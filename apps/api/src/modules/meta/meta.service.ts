import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import type {
  MetaConnection,
  SocialAccount,
} from '../../generated/prisma/client.js';
import { CryptoService } from '../crypto/crypto.service.js';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TOKEN_INVALID_CODE } from './graph-error.js';
import { MetaGraphClient } from './meta-graph.client.js';
import {
  AccountWithoutTokenException,
  MetaApiException,
  MetaConnectionInvalidException,
} from './meta.exceptions.js';
import { createOAuthState } from './oauth-state.js';

export const META_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'instagram_basic',
  'instagram_content_publish',
  'business_management',
] as const;

interface PagesResponse {
  data: {
    id: string;
    name: string;
    access_token?: string;
    picture?: { data?: { url?: string } };
    instagram_business_account?: {
      id: string;
      username?: string;
      profile_picture_url?: string;
    };
  }[];
  paging?: { cursors?: { after?: string }; next?: string };
}

export interface SyncResult {
  facebook: number;
  instagram: number;
  deactivated: number;
  /** Permisos pedidos que Meta no concedio (vacio = todo bien) */
  missingPermissions: string[];
}

export interface MetaStatus {
  connected: boolean;
  status: 'ACTIVE' | 'INVALID' | null;
  fbUserName: string | null;
  tokenExpiresAt: Date | null;
  lastSyncedAt: Date | null;
}

@Injectable()
export class MetaService {
  private readonly logger = new Logger(MetaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly graph: MetaGraphClient,
    private readonly crypto: CryptoService,
    private readonly mail: MailService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** URL del dialogo de Facebook y el nonce que va en la cookie anti-CSRF. */
  buildAuthUrl(): { url: string; nonce: string } {
    const { state, nonce } = createOAuthState(this.env.JWT_SECRET);
    const params = new URLSearchParams({
      client_id: this.env.META_APP_ID,
      redirect_uri: this.env.META_REDIRECT_URI,
      state,
      scope: META_SCOPES.join(','),
      response_type: 'code',
    });
    return {
      url: `https://www.facebook.com/${this.env.META_GRAPH_VERSION}/dialog/oauth?${params.toString()}`,
      nonce,
    };
  }

  async status(): Promise<MetaStatus> {
    const connection = await this.prisma.metaConnection.findFirst({
      orderBy: { createdAt: 'desc' },
    });
    if (!connection) {
      return {
        connected: false,
        status: null,
        fbUserName: null,
        tokenExpiresAt: null,
        lastSyncedAt: null,
      };
    }
    return {
      connected: connection.status === 'ACTIVE',
      status: connection.status,
      fbUserName: connection.fbUserName,
      tokenExpiresAt: connection.userTokenExpiresAt,
      lastSyncedAt: connection.lastSyncedAt,
    };
  }

  /** Canjea el `code` del callback por un token largo, guarda la conexion y sincroniza. */
  async connect(code: string): Promise<SyncResult> {
    const short = await this.graph.get<{ access_token: string }>(
      '/oauth/access_token',
      {
        client_id: this.env.META_APP_ID,
        client_secret: this.env.META_APP_SECRET,
        redirect_uri: this.env.META_REDIRECT_URI,
        code,
      },
    );
    const long = await this.graph.get<{
      access_token: string;
      expires_in?: number;
    }>('/oauth/access_token', {
      grant_type: 'fb_exchange_token',
      client_id: this.env.META_APP_ID,
      client_secret: this.env.META_APP_SECRET,
      fb_exchange_token: short.access_token,
    });
    const me = await this.graph.get<{ id: string; name: string }>(
      '/me',
      { fields: 'id,name' },
      long.access_token,
    );

    const expiresAt = long.expires_in
      ? new Date(Date.now() + long.expires_in * 1000)
      : null;
    // Una sola conexion activa: se reemplaza la anterior
    await this.prisma.$transaction([
      this.prisma.metaConnection.deleteMany(),
      this.prisma.metaConnection.create({
        data: {
          fbUserId: me.id,
          fbUserName: me.name,
          userTokenEnc: this.crypto.encrypt(long.access_token),
          userTokenExpiresAt: expiresAt,
        },
      }),
    ]);
    return this.sync();
  }

  /** Upsert de Paginas e IG vinculadas; las que ya no aparecen quedan inactivas. */
  async sync(): Promise<SyncResult> {
    const connection = await this.activeConnection();
    const userToken = this.crypto.decrypt(connection.userTokenEnc);

    try {
      const pages = await this.fetchAllPages(userToken);
      const missingPermissions = await this.missingPermissions(userToken);
      const result = await this.saveAccounts(pages, missingPermissions);
      await this.prisma.metaConnection.update({
        where: { id: connection.id },
        data: { lastSyncedAt: new Date() },
      });
      return result;
    } catch (error) {
      if (
        error instanceof MetaApiException &&
        error.code === TOKEN_INVALID_CODE
      ) {
        await this.markInvalid(connection.id);
        throw new MetaConnectionInvalidException();
      }
      if (error instanceof MetaApiException && error.isTransient) {
        // Rate limit o caida de Meta: esperado, no es un bug (503 no se reporta por mail)
        throw new ServiceUnavailableException(
          'Meta no está disponible por ahora. Probá de nuevo en unos minutos',
        );
      }
      throw error;
    }
  }

  /** Token con el que se publica en esa cuenta (FB: el suyo; IG: el de su Pagina). */
  async tokenForAccount(
    account: Pick<SocialAccount, 'network' | 'pageId' | 'pageTokenEnc'>,
  ): Promise<string> {
    let encrypted = account.pageTokenEnc;
    if (account.network === 'INSTAGRAM') {
      const page = account.pageId
        ? await this.prisma.socialAccount.findUnique({
            where: {
              network_externalId: {
                network: 'FACEBOOK',
                externalId: account.pageId,
              },
            },
            select: { pageTokenEnc: true },
          })
        : null;
      encrypted = page?.pageTokenEnc ?? null;
    }
    if (!encrypted) throw new AccountWithoutTokenException();
    return this.crypto.decrypt(encrypted);
  }

  private async activeConnection(): Promise<MetaConnection> {
    const connection = await this.prisma.metaConnection.findFirst({
      orderBy: { createdAt: 'desc' },
    });
    if (!connection || connection.status !== 'ACTIVE') {
      throw new MetaConnectionInvalidException();
    }
    return connection;
  }

  /**
   * Meta rechazo el token (codigo 190) al publicar: marca la conexion como INVALID y avisa.
   * Si ya estaba invalida no hace nada (un solo aviso por caida).
   */
  async markCurrentConnectionInvalid(): Promise<void> {
    const connection = await this.prisma.metaConnection.findFirst({
      orderBy: { createdAt: 'desc' },
    });
    if (connection?.status === 'ACTIVE') await this.markInvalid(connection.id);
  }

  /** Hay una conexion con Meta activa (si no, publicar es inutil). */
  async hasActiveConnection(): Promise<boolean> {
    const connection = await this.prisma.metaConnection.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { status: true },
    });
    return connection?.status === 'ACTIVE';
  }

  private async markInvalid(id: string): Promise<void> {
    await this.prisma.metaConnection.update({
      where: { id },
      data: { status: 'INVALID' },
    });
    try {
      await this.mail.notifyAdmin(
        'Meta: hay que reconectar',
        'El token de Meta ya no es válido. Reconectá desde Ajustes > Meta para seguir publicando.',
      );
    } catch (error) {
      // El aviso es secundario: si Redis falla se deja constancia sin romper el flujo
      this.logger.error(
        `No se pudo encolar el aviso de token invalido: ${error instanceof Error ? error.message : 'error'}`,
      );
    }
  }

  private async fetchAllPages(token: string): Promise<PagesResponse['data']> {
    const all: PagesResponse['data'] = [];
    let after: string | undefined;
    // Tope de paginas por si Meta repite el cursor
    for (let i = 0; i < 20; i++) {
      const page = await this.graph.get<PagesResponse>(
        '/me/accounts',
        {
          fields:
            'id,name,access_token,picture{url},instagram_business_account{id,username,profile_picture_url}',
          limit: 100,
          after,
        },
        token,
      );
      all.push(...page.data);
      after = page.paging?.next ? page.paging.cursors?.after : undefined;
      if (!after) break;
    }
    return all;
  }

  private async missingPermissions(token: string): Promise<string[]> {
    const res = await this.graph.get<{
      data: { permission: string; status: string }[];
    }>('/me/permissions', {}, token);
    const granted = new Set(
      res.data.filter((p) => p.status === 'granted').map((p) => p.permission),
    );
    return META_SCOPES.filter((scope) => !granted.has(scope));
  }

  private async saveAccounts(
    pages: PagesResponse['data'],
    missingPermissions: string[],
  ): Promise<SyncResult> {
    let instagram = 0;
    let facebook = 0;
    const seenIds: string[] = [];

    await this.prisma.$transaction(async (tx) => {
      for (const page of pages) {
        if (!page.access_token) continue;
        const fb = await tx.socialAccount.upsert({
          where: {
            network_externalId: { network: 'FACEBOOK', externalId: page.id },
          },
          create: {
            network: 'FACEBOOK',
            externalId: page.id,
            name: page.name,
            pictureUrl: page.picture?.data?.url ?? null,
            pageId: page.id,
            pageTokenEnc: this.crypto.encrypt(page.access_token),
          },
          update: {
            name: page.name,
            pictureUrl: page.picture?.data?.url ?? null,
            pageId: page.id,
            pageTokenEnc: this.crypto.encrypt(page.access_token),
            active: true,
          },
          select: { id: true },
        });
        seenIds.push(fb.id);
        facebook++;

        const ig = page.instagram_business_account;
        if (ig) {
          const saved = await tx.socialAccount.upsert({
            where: {
              network_externalId: { network: 'INSTAGRAM', externalId: ig.id },
            },
            create: {
              network: 'INSTAGRAM',
              externalId: ig.id,
              name: ig.username ?? ig.id,
              username: ig.username ?? null,
              pictureUrl: ig.profile_picture_url ?? null,
              pageId: page.id,
            },
            update: {
              name: ig.username ?? ig.id,
              username: ig.username ?? null,
              pictureUrl: ig.profile_picture_url ?? null,
              pageId: page.id,
              active: true,
            },
            select: { id: true },
          });
          seenIds.push(saved.id);
          instagram++;
        }
      }
      return undefined;
    });

    const deactivated = await this.prisma.socialAccount.updateMany({
      where: { id: { notIn: seenIds }, active: true },
      data: { active: false },
    });
    return {
      facebook,
      instagram,
      deactivated: deactivated.count,
      missingPermissions,
    };
  }
}
