// Corre con: npm run test:scripts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyValues } from './env-template.mjs';

const template = [
  'POSTGRES_PASSWORD=CAMBIAR',
  "ADMIN_PASSWORD_HASH='CAMBIAR'",
  'SMTP_HOST=smtp.example.com',
  '# THREADS_APP_ID=',
  '',
].join('\n');

test('reemplaza solo las claves pedidas y deja el resto igual', () => {
  const out = applyValues(template, { POSTGRES_PASSWORD: 'abc123' });
  assert.match(out, /^POSTGRES_PASSWORD=abc123$/m);
  assert.match(out, /^SMTP_HOST=smtp\.example\.com$/m);
  assert.match(out, /^# THREADS_APP_ID=$/m);
});

test('un hash bcrypt con $ queda literal, sin interpretarse como grupo', () => {
  const hash = "'$2b$12$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012345'";
  const out = applyValues(template, { ADMIN_PASSWORD_HASH: hash });
  assert.ok(out.includes(`ADMIN_PASSWORD_HASH=${hash}`));
});

test('funciona con saltos de linea de Windows', () => {
  const out = applyValues(template.replaceAll('\n', '\r\n'), {
    POSTGRES_PASSWORD: 'xyz',
  });
  assert.match(out, /^POSTGRES_PASSWORD=xyz\r$/m);
});

test('falla si una clave no esta en la plantilla', () => {
  assert.throws(
    () => applyValues(template, { TOKEN_ENC_KEY: 'k' }),
    /TOKEN_ENC_KEY/,
  );
});

test('una clave solo comentada no cuenta como presente', () => {
  assert.throws(() => applyValues(template, { THREADS_APP_ID: '1' }));
});
