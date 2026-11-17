import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { ConnectionRefresher } from '../connections/connections.types.js';
import { ConnectionsService } from '../connections/connections.service.js';
import { TOKEN_INVALID_CODE } from '../meta/graph-error.js';
import { MetaApiException } from '../meta/meta.exceptions.js';
import { ThreadsGraphClient } from '../meta/threads-graph.client.js';

/** Renovacion del token largo de Threads (dura 60 dias); se registra sola en ConnectionsService. */
@Injectable()
export class ThreadsRefresher implements ConnectionRefresher, OnModuleInit {
  readonly provider = 'THREADS' as const;
  /** Se renueva cuando faltan menos de 15 dias */
  readonly refreshWhenLeftMs = 15 * 24 * 60 * 60_000;
  /** Threads solo deja renovar tokens con mas de 24 horas */
  readonly minAgeMs = 24 * 60 * 60_000;

  constructor(
    private readonly graph: ThreadsGraphClient,
    private readonly connections: ConnectionsService,
  ) {}

  onModuleInit(): void {
    this.connections.registerRefresher(this);
  }

  async refresh(
    token: string,
    now: Date,
  ): Promise<{ token: string; expiresAt: Date | null }> {
    const res = await this.graph.get<{
      access_token: string;
      expires_in?: number;
    }>('/refresh_access_token', {
      grant_type: 'th_refresh_token',
      access_token: token,
    });
    return {
      token: res.access_token,
      expiresAt: res.expires_in
        ? new Date(now.getTime() + res.expires_in * 1000)
        : null,
    };
  }

  isTokenRejected(error: unknown): boolean {
    return (
      error instanceof MetaApiException &&
      !error.isTransient &&
      error.code === TOKEN_INVALID_CODE
    );
  }
}
