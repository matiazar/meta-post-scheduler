const SENSITIVE_KEY =
  /token|password|passwd|secret|authorization|cookie|api[_-]?key/i;
const SENSITIVE_PARAM =
  /((?:access_token|refresh_token|fb_exchange_token|client_secret|token|password)=)[^&\s"']+/gi;
const CODE_PARAM = /([?&]code=)[^&\s"']+/gi;
const JSON_SECRET =
  /("(?:access_token|refresh_token|fb_exchange_token|client_secret|token|password|authorization)"\s*:\s*")[^"]*(")/gi;
const BEARER = /(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi;

export const REDACTED = '[REDACTED]';

/** Tapa tokens y claves en un texto libre (mensajes de error, URLs, respuestas). */
export function redactString(text: string): string {
  return text
    .replace(SENSITIVE_PARAM, `$1${REDACTED}`)
    .replace(CODE_PARAM, `$1${REDACTED}`)
    .replace(JSON_SECRET, `$1${REDACTED}$2`)
    .replace(BEARER, `$1${REDACTED}`);
}

/** Copia el valor tapando campos sensibles por nombre y tokens dentro de strings. */
export function redact(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return redactString(value);
  if (value === null || typeof value !== 'object') return value;
  if (depth > 6) return '[TRUNCATED]';
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, val]) => [
      key,
      SENSITIVE_KEY.test(key) ? REDACTED : redact(val, depth + 1),
    ]),
  );
}
