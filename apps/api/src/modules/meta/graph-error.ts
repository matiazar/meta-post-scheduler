import { MetaApiException } from './meta.exceptions.js';

/** Codigos de error de Graph que se reintentan (rate limit, fallos temporales). Spec seccion 9. */
const TRANSIENT_CODES = new Set([1, 2, 4, 17, 32, 613]);
/** Subcodes de IG transitorios: media no lista y similares. */
const TRANSIENT_SUBCODES = new Set([
  2207001, 2207003, 2207008, 2207027, 2207032,
]);
const DAILY_LIMIT_SUBCODE = 2207042;
const DAILY_LIMIT_CODE = 9;

export const TOKEN_INVALID_CODE = 190;

interface GraphErrorBody {
  error?: {
    message?: unknown;
    code?: unknown;
    error_subcode?: unknown;
  };
  /** Los errores de OAuth de Threads vienen planos: { error_type, code, error_message } */
  error_message?: unknown;
  code?: unknown;
}

const asNumber = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

/**
 * Convierte la respuesta de error de Graph en MetaApiException.
 * Se usa solo el mensaje de Meta (sin URL ni parametros), asi no se filtran tokens.
 */
export function mapGraphError(
  httpStatus: number,
  body: unknown,
): MetaApiException {
  const flat = body as GraphErrorBody | null;
  const error = flat?.error;
  const code = asNumber(error?.code ?? flat?.code);
  const subcode = asNumber(error?.error_subcode);
  const rawMessage = error?.message ?? flat?.error_message;
  const message =
    typeof rawMessage === 'string' && rawMessage
      ? rawMessage
      : `Meta respondió HTTP ${httpStatus}`;

  const dailyLimit =
    subcode === DAILY_LIMIT_SUBCODE || code === DAILY_LIMIT_CODE;
  const transient =
    !dailyLimit &&
    (httpStatus >= 500 ||
      (code !== null && TRANSIENT_CODES.has(code)) ||
      (subcode !== null && TRANSIENT_SUBCODES.has(subcode)));

  return new MetaApiException(
    message,
    code,
    subcode,
    transient,
    dailyLimit,
    httpStatus,
  );
}
