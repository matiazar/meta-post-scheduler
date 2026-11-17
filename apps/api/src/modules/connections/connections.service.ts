import { Injectable, Logger } from '@nestjs/common';
import type {
  ConnectionProvider,
  SocialConnection,
} from '../../generated/prisma/client.js';
import { CryptoService } from '../crypto/crypto.service.js';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CONNECTION_INFO,
  type ConnectionRefresher,
} from './connections.types.js';

export interface SaveConnectionInput {
  provider: ConnectionProvider;
  externalId: string;
  displayName: string;
  /** Token en claro: se cifra aca */
  token: string;
  tokenExpiresAt: Date | null;
  /** La red lo renueva (guarda cuando se renovo por ultima vez) */
  renewable: boolean;
}

/** Cliente de Prisma o transaccion: lo unico que se necesita para guardar una conexion */
type Db = Pick<PrismaService, 'socialConnection'>;

/** Conexiones con las redes (DEC-014): guardado, token, invalidacion y renovacion, iguales para todas. */
@Injectable()
export class ConnectionsService {
  private readonly logger = new Logger(ConnectionsService.name);
  private readonly refreshers: ConnectionRefresher[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly mail: MailService,
  ) {}

  registerRefresher(refresher: ConnectionRefresher): void {
    this.refreshers.push(refresher);
  }

  private data(input: SaveConnectionInput, now: Date) {
    return {
      displayName: input.displayName,
      tokenEnc: this.crypto.encrypt(input.token),
      tokenExpiresAt: input.tokenExpiresAt,
      tokenRefreshedAt: input.renewable ? now : null,
      status: 'ACTIVE' as const,
    };
  }

  /** Crea o actualiza (una reconexion la deja ACTIVE). Acepta una transaccion. */
  save(
    input: SaveConnectionInput,
    db: Db = this.prisma,
  ): Promise<SocialConnection> {
    const data = this.data(input, new Date());
    return db.socialConnection.upsert({
      where: {
        provider_externalId: {
          provider: input.provider,
          externalId: input.externalId,
        },
      },
      create: {
        provider: input.provider,
        externalId: input.externalId,
        ...data,
      },
      update: data,
    });
  }

  /** Redes con un solo login vigente (Meta): reemplaza el anterior en una transaccion. */
  async replace(input: SaveConnectionInput): Promise<SocialConnection> {
    const [, created] = await this.prisma.$transaction([
      this.prisma.socialConnection.deleteMany({
        where: { provider: input.provider },
      }),
      this.prisma.socialConnection.create({
        data: {
          provider: input.provider,
          externalId: input.externalId,
          ...this.data(input, new Date()),
        },
      }),
    ]);
    return created;
  }

  find(
    provider: ConnectionProvider,
    externalId: string,
  ): Promise<SocialConnection | null> {
    return this.prisma.socialConnection.findUnique({
      where: { provider_externalId: { provider, externalId } },
    });
  }

  /** La mas reciente (para las redes con un solo login) */
  latest(provider: ConnectionProvider): Promise<SocialConnection | null> {
    return this.prisma.socialConnection.findFirst({
      where: { provider },
      orderBy: { createdAt: 'desc' },
    });
  }

  list(provider: ConnectionProvider): Promise<SocialConnection[]> {
    return this.prisma.socialConnection.findMany({
      where: { provider },
      orderBy: { displayName: 'asc' },
    });
  }

  token(connection: Pick<SocialConnection, 'tokenEnc'>): string {
    return this.crypto.decrypt(connection.tokenEnc);
  }

  touchSynced(id: string): Promise<SocialConnection> {
    return this.prisma.socialConnection.update({
      where: { id },
      data: { lastSyncedAt: new Date() },
    });
  }

  /**
   * La red rechazo el token (190): deja la conexion INVALID y avisa. El UPDATE condicionado
   * a ACTIVE hace que, aunque lleguen varios rechazos a la vez, el aviso salga una sola vez.
   */
  async markInvalid(
    connection: Pick<SocialConnection, 'id' | 'provider' | 'displayName'>,
  ): Promise<void> {
    const { count } = await this.prisma.socialConnection.updateMany({
      where: { id: connection.id, status: 'ACTIVE' },
      data: { status: 'INVALID' },
    });
    if (count === 0) return;
    const info = CONNECTION_INFO[connection.provider];
    const who = info.who(connection.displayName);
    try {
      await this.mail.notifyAdmin(
        `${info.label}: hay que reconectar${who}`,
        `El token de ${info.label}${who ? ` de${who}` : ''} ya no es válido. Reconectá desde ${info.settings} para seguir publicando.`,
      );
    } catch (error) {
      // El aviso es secundario: si Redis falla se deja constancia sin romper el flujo
      this.logger.error(
        `No se pudo encolar el aviso de token invalido: ${error instanceof Error ? error.message : 'error'}`,
      );
    }
  }

  /**
   * Renueva los tokens por vencer de las redes que tienen refresher. Un fallo pasajero se
   * deja para la proxima vuelta; si la red rechaza el token, la conexion queda INVALID y se avisa.
   */
  async refreshDue(now: Date = new Date()): Promise<number> {
    let refreshed = 0;
    for (const refresher of this.refreshers) {
      const due = await this.prisma.socialConnection.findMany({
        where: {
          provider: refresher.provider,
          status: 'ACTIVE',
          tokenExpiresAt: {
            lt: new Date(now.getTime() + refresher.refreshWhenLeftMs),
          },
          tokenRefreshedAt: {
            lte: new Date(now.getTime() - refresher.minAgeMs),
          },
        },
      });
      for (const connection of due) {
        try {
          const res = await refresher.refresh(this.token(connection), now);
          await this.prisma.socialConnection.update({
            where: { id: connection.id },
            data: {
              tokenEnc: this.crypto.encrypt(res.token),
              tokenExpiresAt: res.expiresAt,
              tokenRefreshedAt: now,
            },
          });
          refreshed++;
        } catch (error) {
          if (refresher.isTokenRejected(error)) {
            await this.markInvalid(connection);
          } else {
            this.logger.warn(
              `No se pudo renovar el token de ${CONNECTION_INFO[connection.provider].label} (${connection.displayName}): ${error instanceof Error ? error.message : 'error'}`,
            );
          }
        }
      }
    }
    return refreshed;
  }
}
