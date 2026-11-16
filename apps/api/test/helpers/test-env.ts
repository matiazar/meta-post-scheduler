import { hashSync } from 'bcryptjs';
import type { Env } from '../../src/config/env.js';

export const TEST_PASSWORD = 'correct-horse-battery';
export const TEST_JWT_SECRET = 'test-secret-'.padEnd(48, 'x');

// Costo bajo solo para tests (rapido). En la app real el hash viene del .env
const TEST_HASH = hashSync(TEST_PASSWORD, 4);

export function makeTestEnv(overrides: Partial<Env> = {}): Env {
  return {
    NODE_ENV: 'test',
    PORT: 3001,
    DATABASE_URL: 'postgresql://u:p@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
    ADMIN_EMAIL: 'admin@example.com',
    MAIL_FROM: 'Panel <no-reply@example.com>',
    SMTP_HOST: 'smtp.example.com',
    SMTP_PORT: 587,
    SMTP_USER: 'user',
    SMTP_PASS: 'pass',
    ADMIN_PASSWORD_HASH: TEST_HASH,
    JWT_SECRET: TEST_JWT_SECRET,
    WEB_ORIGIN: 'http://localhost:3000',
    TOKEN_ENC_KEY: Buffer.alloc(32, 7).toString('base64'),
    ...overrides,
  };
}
