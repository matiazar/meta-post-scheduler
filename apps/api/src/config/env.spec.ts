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
};

describe('parseEnv', () => {
  it('parsea un entorno valido y aplica defaults', () => {
    const env = parseEnv(valid);
    expect(env.PORT).toBe(3001);
    expect(env.SMTP_PORT).toBe(587);
  });

  it('NODE_ENV es obligatorio', () => {
    const { NODE_ENV: _omit, ...withoutNodeEnv } = valid;
    expect(() => parseEnv(withoutNodeEnv)).toThrow(/NODE_ENV/);
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
