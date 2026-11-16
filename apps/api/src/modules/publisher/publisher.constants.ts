export const TICK_QUEUE = 'tick';
export const PUBLISH_QUEUE = 'publish';

/** Cada cuanto corre el tick que busca targets vencidos. */
export const TICK_EVERY_MS = 60_000;
/** Maximo de targets que toma un tick (el resto queda para el proximo minuto). */
export const TICK_BATCH = 50;

/** QUEUED sin arrancar hace mas de esto: el job se perdio, vuelve a PENDING sin gastar intento. */
export const QUEUED_STALE_MS = 5 * 60_000;
/** PUBLISHING sin terminar hace mas de esto: el worker murio a mitad de camino. */
export const PUBLISHING_STALE_MS = 15 * 60_000;

/** Intentos totales por destino y espera antes del 2do, 3er y 4to (DEC-07). */
export const MAX_ATTEMPTS = 4;
export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000];

/** Limite diario de IG: se reintenta cada hora durante 24 h desde el primer rechazo. */
export const DAILY_LIMIT_RETRY_MS = 60 * 60_000;
export const DAILY_LIMIT_WINDOW_MS = 24 * 60 * 60_000;

/** Espera de IG hasta que el container este FINISHED. */
export const IG_POLL_INTERVAL_MS = 3_000;
export const IG_POLL_TIMEOUT_MS = 60_000;

export const IG_ERROR_CODE_DAILY_LIMIT = 'DAILY_LIMIT';
