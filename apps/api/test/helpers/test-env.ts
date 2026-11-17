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
    META_APP_ID: '1234567890',
    META_APP_SECRET: 'test-app-secret',
    META_GRAPH_VERSION: 'v24.0',
    META_REDIRECT_URI: 'http://localhost:3001/meta/callback',
    R2_ACCOUNT_ID: 'test-account',
    R2_ACCESS_KEY_ID: 'test-key',
    R2_SECRET_ACCESS_KEY: 'test-secret',
    R2_BUCKET: 'test-bucket',
    R2_PUBLIC_BASE_URL: 'https://media.example.com',
    // Sin ANTHROPIC_API_KEY: los e2e nunca llaman al modelo
    AI_MODEL: 'claude-sonnet-5-5',
    ...overrides,
  };
}
