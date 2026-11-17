import { Inject, Injectable } from '@nestjs/common';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import type { SocialAccount } from '../../generated/prisma/client.js';
import { ConnectionsService } from '../connections/connections.service.js';
import { AccountWithoutTokenException } from '../meta/meta.exceptions.js';
import { createOAuthState } from '../meta/oauth-state.js';
import { ThreadsGraphClient } from '../meta/threads-graph.client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ThreadsNotConfiguredException } from './threads.exceptions.js';

export const THREADS_SCOPES = [
  'threads_basic',
  'threads_content_publish',
] as const;

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

type AccountRef = Pick<SocialAccount, 'connectionId'>;

/** Conexion con perfiles de Threads: login propio y token largo de 60 dias (se renueva en ThreadsRefresher). */
@Injectable()
export class ThreadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly graph: ThreadsGraphClient,
    private readonly connections: ConnectionsService,
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
    const connections = await this.connections.list('THREADS');
    return connections.map((c) => ({
      username: c.displayName,
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

    await this.prisma.$transaction(async (tx) => {
      const connection = await this.connections.save(
        {
          provider: 'THREADS',
          externalId: profile.id,
          displayName: profile.username,
          token: long.access_token,
          tokenExpiresAt: long.expires_in
            ? new Date(Date.now() + long.expires_in * 1000)
            : null,
          renewable: true,
        },
        tx,
      );
      // Si la cuenta ya estaba (reconexion), conserva su marca
      await tx.socialAccount.upsert({
        where: {
          network_externalId: { network: 'THREADS', externalId: profile.id },
        },
        create: {
          network: 'THREADS',
          externalId: profile.id,
          name: profile.username,
          username: profile.username,
          pictureUrl: profile.threads_profile_picture_url ?? null,
          connectionId: connection.id,
        },
        update: {
          name: profile.username,
          username: profile.username,
          pictureUrl: profile.threads_profile_picture_url ?? null,
          connectionId: connection.id,
          active: true,
        },
      });
    });
    return { username: profile.username };
  }

  /** Token con el que se publica en esa cuenta de Threads. */
  async tokenForAccount(account: AccountRef): Promise<string> {
    const connection = await this.connectionOf(account);
    if (!connection) throw new AccountWithoutTokenException();
    return this.connections.token(connection);
  }

  async hasActiveConnection(account: AccountRef): Promise<boolean> {
    const connection = await this.connectionOf(account);
    return connection?.status === 'ACTIVE';
  }

  /** Threads rechazo el token (codigo 190): marca la conexion y avisa una sola vez. */
  async markInvalid(account: AccountRef): Promise<void> {
    const connection = await this.connectionOf(account);
    if (connection) await this.connections.markInvalid(connection);
  }

  /** La conexion de la cuenta sale de su FK (DEC-014), no de una convencion por externalId. */
  private async connectionOf(account: AccountRef) {
    return account.connectionId
      ? this.connections.findById(account.connectionId)
      : null;
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
}
