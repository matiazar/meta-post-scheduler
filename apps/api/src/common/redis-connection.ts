import type { ConnectionOptions } from 'bullmq';
import { InvalidEnvException } from '../config/config.exceptions.js';

/** Convierte REDIS_URL (redis://[:pass@]host:port[/db]) en opciones de conexion de BullMQ. */
export function redisConnectionFromUrl(url: string): ConnectionOptions {
  const parsed = new URL(url);
  const db = parsed.pathname.length > 1 ? Number(parsed.pathname.slice(1)) : 0;
  if (!Number.isInteger(db) || db < 0) {
    throw new InvalidEnvException(['REDIS_URL']);
  }
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    db,
    tls: parsed.protocol === 'rediss:' ? {} : undefined,
  };
}
