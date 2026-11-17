import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import type { SocialAccount } from '../../generated/prisma/client.js';
import { CryptoService } from '../crypto/crypto.service.js';
import { MailService } from '../mail/mail.service.js';
import { TOKEN_INVALID_CODE } from '../meta/graph-error.js';
import {
  AccountWithoutTokenException,
  MetaApiException,
} from '../meta/meta.exceptions.js';
import { createOAuthState } from '../meta/oauth-state.js';
import { ThreadsGraphClient } from '../meta/threads-graph.client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ThreadsNotConfiguredException } from './threads.exceptions.js';

export const THREADS_SCOPES = [
  'threads_basic',
  'threads_content_publish',
] as const;

/** Se renueva cuando faltan menos de 15 dias (el token dura 60) */
const REFRESH_WHEN_LEFT_MS = 15 * 24 * 60 * 60_000;
/** Threads solo deja renovar tokens con mas de 24 horas */
const MIN_AGE_TO_REFRESH_MS = 24 * 60 * 60_000;

export interface ThreadsStatusItem {
  username: string;
  status: 'ACTIVE' | 'INVALID';
  tokenExpiresAt: Date | null;
}

interface ThreadsProfile {
  id: string;
  username: string;
  threads_profile_picture_url?: string;
}

type AccountRef = Pick<SocialAccount, 'externalId'>;

function expiryFrom(
  expiresIn: number | undefined,
  from: Date = new Date(),
): Date | null {
  return expiresIn ? new Date(from.getTime() + expiresIn * 1000) : null;
}

/** Conexion con perfiles de Threads: login propio, token largo de 60 dias y renovacion. */
@Injectable()
export class ThreadsService {
  private readonly logger = new Logger(ThreadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly graph: ThreadsGraphClient,
    private readonly crypto: CryptoService,
    private readonly mail: MailService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  get configured(): boolean {
    return Boolean(
      this.env.THREADS_APP_ID &&
        this.env.THREADS_APP_SECRET &&
        this.env.THREADS_REDIRECT_URI,
    );
  }

  /** URL del dialogo de Threads y el nonce que va en la cookie anti-CSRF. */
  buildAuthUrl(): { url: string; nonce: string } {
    const { appId, redirectUri } = this.credentials();
    const { state, nonce } = createOAuthState(this.env.JWT_SECRET);
    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      scope: THREADS_SCOPES.join(','),
      response_type: 'code',
      state,
    });
    return {
      url: `https://threads.com/oauth/authorize?${params.toString()}`,
      nonce,
    };
  }

  async status(): Promise<ThreadsStatusItem[]> {
    const connections = await this.prisma.threadsConnection.findMany({
      orderBy: { username: 'asc' },
    });
    return connections.map((c) => ({
      username: c.username,
      status: c.status,
      tokenExpiresAt: c.tokenExpiresAt,
    }));
  }

  /** Canjea el `code` por un token largo y deja guardados la conexion y la cuenta del perfil. */
  async connect(code: string): Promise<{ username: string }> {
    const { appId, appSecret, redirectUri } = this.credentials();
    const short = await this.graph.post<{ access_token: string }>(
      '/oauth/access_token',
      {
        client_id: appId,
        client_secret: appSecret,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code,
      },
    );
    const long = await this.graph.get<{
      access_token: string;
      expires_in?: number;
    }>('/access_token', {
      grant_type: 'th_exchange_token',
      client_secret: appSecret,
      access_token: short.access_token,
    });
    const profile = await this.graph.get<ThreadsProfile>(
      '/v1.0/me',
      { fields: 'id,username,threads_profile_picture_url' },
      long.access_token,
    );

    const tokenEnc = this.crypto.encrypt(long.access_token);
    const tokenExpiresAt = expiryFrom(long.expires_in);
    await this.prisma.$transaction([
      this.prisma.threadsConnection.upsert({
        where: { threadsUserId: profile.id },
        create: {
          threadsUserId: profile.id,
          username: profile.username,
          tokenEnc,
          tokenExpiresAt,
        },
        update: {
          username: profile.username,
          tokenEnc,
          tokenExpiresAt,
          tokenRefreshedAt: new Date(),
          status: 'ACTIVE',
        },
      }),
      // Si la cuenta ya estaba (reconexion), conserva su marca
      this.prisma.socialAccount.upsert({
        where: {
          network_externalId: { network: 'THREADS', externalId: profile.id },
        },
        create: {
          network: 'THREADS',
          externalId: profile.id,
          name: profile.username,
          username: profile.username,
          pictureUrl: profile.threads_profile_picture_url ?? null,
        },
        update: {
          name: profile.username,
          username: profile.username,
          pictureUrl: profile.threads_profile_picture_url ?? null,
          active: true,
        },
      }),
    ]);
    return { username: profile.username };
  }

  /** Token con el que se publica en esa cuenta de Threads. */
  async tokenForAccount(account: AccountRef): Promise<string> {
    const connection = await this.prisma.threadsConnection.findUnique({
      where: { threadsUserId: account.externalId },
    });
    if (!connection) throw new AccountWithoutTokenException();
    return this.crypto.decrypt(connection.tokenEnc);
  }

  async hasActiveConnection(account: AccountRef): Promise<boolean> {
    const connection = await this.prisma.threadsConnection.findUnique({
      where: { threadsUserId: account.externalId },
      select: { status: true },
    });
    return connection?.status === 'ACTIVE';
  }

  /** Threads rechazo el token (codigo 190): marca la conexion y avisa una sola vez. */
  async markInvalid(account: AccountRef): Promise<void> {
    const connection = await this.prisma.threadsConnection.findUnique({
      where: { threadsUserId: account.externalId },
    });
    if (!connection || connection.status !== 'ACTIVE') return;
    await this.prisma.threadsConnection.update({
      where: { id: connection.id },
      data: { status: 'INVALID' },
    });
    await this.notify(
      `Threads: hay que reconectar @${connection.username}`,
      `El token de Threads de @${connection.username} ya no es válido. Reconectá desde Ajustes > Threads para seguir publicando.`,
    );
  }

  /**
   * Renueva los tokens que vencen en menos de 15 dias. Un fallo pasajero se deja para la
   * proxima vuelta; si Threads rechaza el token, la conexion queda INVALID y se avisa.
   */
  async refreshDue(now: Date = new Date()): Promise<number> {
    const connections = await this.prisma.threadsConnection.findMany({
      where: {
        status: 'ACTIVE',
        tokenExpiresAt: { lt: new Date(now.getTime() + REFRESH_WHEN_LEFT_MS) },
        tokenRefreshedAt: {
          lte: new Date(now.getTime() - MIN_AGE_TO_REFRESH_MS),
        },
      },
    });
    let refreshed = 0;
    for (const connection of connections) {
      try {
        const res = await this.graph.get<{
          access_token: string;
          expires_in?: number;
        }>('/refresh_access_token', {
          grant_type: 'th_refresh_token',
          access_token: this.crypto.decrypt(connection.tokenEnc),
        });
        await this.prisma.threadsConnection.update({
          where: { id: connection.id },
          data: {
            tokenEnc: this.crypto.encrypt(res.access_token),
            tokenExpiresAt: expiryFrom(res.expires_in, now),
            tokenRefreshedAt: now,
          },
        });
        refreshed++;
      } catch (error) {
        if (
          error instanceof MetaApiException &&
          !error.isTransient &&
          error.code === TOKEN_INVALID_CODE
        ) {
          await this.markInvalid({ externalId: connection.threadsUserId });
        } else {
          this.logger.warn(
            `No se pudo renovar el token de Threads de @${connection.username}: ${error instanceof Error ? error.message : 'error'}`,
          );
        }
      }
    }
    return refreshed;
  }

  private credentials(): {
    appId: string;
    appSecret: string;
    redirectUri: string;
  } {
    const { THREADS_APP_ID, THREADS_APP_SECRET, THREADS_REDIRECT_URI } =
      this.env;
    if (!THREADS_APP_ID || !THREADS_APP_SECRET || !THREADS_REDIRECT_URI) {
      throw new ThreadsNotConfiguredException();
    }
    return {
      appId: THREADS_APP_ID,
      appSecret: THREADS_APP_SECRET,
      redirectUri: THREADS_REDIRECT_URI,
    };
  }

  private async notify(subject: string, text: string): Promise<void> {
    try {
      await this.mail.notifyAdmin(subject, text);
    } catch (error) {
      // El aviso es secundario: si Redis falla se deja constancia sin romper el flujo
      this.logger.error(
        `No se pudo encolar el aviso "${subject}": ${error instanceof Error ? error.message : 'error'}`,
      );
    }
  }
}
