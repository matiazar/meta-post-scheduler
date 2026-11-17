import type { ConnectionProvider } from '../../generated/prisma/client.js';

/**
 * Como renueva su token una red que lo permite (Threads hoy; X y TikTok despues).
 * Las que no lo renuevan (Meta, Telegram) no registran ninguno.
 */
export interface ConnectionRefresher {
  readonly provider: ConnectionProvider;
  /** Se renueva cuando faltan menos de estos ms para que venza */
  readonly refreshWhenLeftMs: number;
  /** La red no deja renovar un token mas joven que esto */
  readonly minAgeMs: number;
  refresh(
    token: string,
    now: Date,
  ): Promise<{ token: string; expiresAt: Date | null }>;
  /** La red dijo que el token ya no sirve (hay que reconectar), no que fallo un pedido */
  isTokenRejected(error: unknown): boolean;
}

/** Textos de los avisos de reconexion por red */
export const CONNECTION_INFO: Record<
  ConnectionProvider,
  { label: string; settings: string; who: (displayName: string) => string }
> = {
  META: { label: 'Meta', settings: 'Ajustes > Meta', who: () => '' },
  THREADS: {
    label: 'Threads',
    settings: 'Ajustes > Threads',
    who: (displayName) => ` @${displayName}`,
  },
};
