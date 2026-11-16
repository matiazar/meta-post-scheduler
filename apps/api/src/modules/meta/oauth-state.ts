import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const STATE_TTL_MS = 10 * 60 * 1000;

function sign(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

/**
 * `state` del OAuth: nonce.vencimiento.firma. El nonce tambien viaja en una cookie
 * httpOnly del navegador que inicio la conexion, asi el callback solo vale para ese navegador.
 */
export function createOAuthState(
  secret: string,
  now = Date.now(),
): { state: string; nonce: string } {
  const nonce = randomBytes(16).toString('base64url');
  const payload = `${nonce}.${now + STATE_TTL_MS}`;
  return { state: `${payload}.${sign(secret, payload)}`, nonce };
}

export function verifyOAuthState(
  secret: string,
  state: string,
  cookieNonce: string | undefined,
  now = Date.now(),
): boolean {
  const parts = state.split('.');
  if (parts.length !== 3 || !cookieNonce) return false;
  const [nonce, expires, signature] = parts;
  const expected = sign(secret, `${nonce}.${expires}`);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  const expiresAt = Number(expires);
  if (!Number.isFinite(expiresAt) || expiresAt < now) return false;
  const n1 = Buffer.from(nonce);
  const n2 = Buffer.from(cookieNonce);
  return n1.length === n2.length && timingSafeEqual(n1, n2);
}
