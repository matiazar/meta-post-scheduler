import { InvalidEnvException } from './config.exceptions.js';
import { parseEnv } from './env.js';

const valid = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  ADMIN_EMAIL: 'admin@example.com',
  MAIL_FROM: 'Social Publisher <no-reply@example.com>',
  SMTP_HOST: 'smtp.example.com',
  SMTP_PORT: '587',
  SMTP_USER: 'user',
  SMTP_PASS: 'secret-pass',
  ADMIN_PASSWORD_HASH: `$2b$12$${'a'.repeat(53)}`,
  JWT_SECRET: 'j'.repeat(32),
  WEB_ORIGIN: 'http://localhost:3000',
  TOKEN_ENC_KEY: Buffer.alloc(32, 7).toString('base64'),
  META_APP_ID: '1234567890',
  META_APP_SECRET: 'app-secret',
  META_GRAPH_VERSION: 'v24.0',
  META_REDIRECT_URI: 'http://localhost:3001/meta/callback',
  R2_ACCOUNT_ID: 'acc',
  R2_ACCESS_KEY_ID: 'key',
  R2_SECRET_ACCESS_KEY: 'secret',
  R2_BUCKET: 'bucket',
  R2_PUBLIC_BASE_URL: 'https://media.example.com',
};

describe('parseEnv', () => {
  it('parsea un entorno valido y aplica defaults', () => {
    const env = parseEnv(valid);
    expect(env.PORT).toBe(3001);
    expect(env.SMTP_PORT).toBe(587);
  });

  it('Threads es opcional, pero va completo o no va', () => {
    expect(parseEnv(valid).THREADS_APP_ID).toBeUndefined();
    const threads = {
      THREADS_APP_ID: '999',
      THREADS_APP_SECRET: 'threads-secret',
      THREADS_REDIRECT_URI: 'http://localhost:3001/threads/callback',
    };
    expect(parseEnv({ ...valid, ...threads }).THREADS_APP_ID).toBe('999');
    expect(() => parseEnv({ ...valid, THREADS_APP_ID: '999' })).toThrow(
      /THREADS_APP_SECRET.*THREADS_REDIRECT_URI/,
    );
  });

  it('NODE_ENV es obligatorio', () => {
    const { NODE_ENV: _omit, ...withoutNodeEnv } = valid;
    expect(() => parseEnv(withoutNodeEnv)).toThrow(/NODE_ENV/);
  });

  it('rechaza un hash que no es bcrypt y un JWT_SECRET corto', () => {
    expect(() =>
      parseEnv({ ...valid, ADMIN_PASSWORD_HASH: 'plaintext' }),
    ).toThrow(/ADMIN_PASSWORD_HASH/);
    expect(() => parseEnv({ ...valid, JWT_SECRET: 'corto' })).toThrow(
      /JWT_SECRET/,
    );
  });

  it('TOKEN_ENC_KEY debe ser de exactamente 32 bytes en base64', () => {
    expect(() =>
      parseEnv({
        ...valid,
        TOKEN_ENC_KEY: Buffer.alloc(16).toString('base64'),
      }),
    ).toThrow(/TOKEN_ENC_KEY/);
    expect(() =>
      parseEnv({ ...valid, TOKEN_ENC_KEY: 'no es base64!' }),
    ).toThrow(/TOKEN_ENC_KEY/);
  });

  it('META_GRAPH_VERSION debe tener formato vNN.N', () => {
    expect(() => parseEnv({ ...valid, META_GRAPH_VERSION: '24' })).toThrow(
      /META_GRAPH_VERSION/,
    );
  });

  it('WEB_ORIGIN debe ser un origen exacto, sin barra final', () => {
    expect(() =>
      parseEnv({ ...valid, WEB_ORIGIN: 'http://localhost:3000/' }),
    ).toThrow(/WEB_ORIGIN/);
    expect(
      parseEnv({ ...valid, WEB_ORIGIN: 'https://panel.example.com' })
        .WEB_ORIGIN,
    ).toBe('https://panel.example.com');
  });

  it('falla nombrando las variables faltantes, sin mostrar valores', () => {
    const { DATABASE_URL: _omit, ...incomplete } = valid;
    const attempt = () =>
      parseEnv({ ...incomplete, ADMIN_EMAIL: 'no-es-mail' });
    expect(attempt).toThrow(InvalidEnvException);
    try {
      attempt();
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('DATABASE_URL');
      expect(message).toContain('ADMIN_EMAIL');
      expect(message).not.toContain('no-es-mail');
    }
  });
});
