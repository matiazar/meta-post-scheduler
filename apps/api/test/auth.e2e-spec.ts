import { Global, Module } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureApp } from '../src/app.setup.js';
import { ENV } from '../src/config/config.module.js';
import type { Env } from '../src/config/env.js';
import { AuthModule } from '../src/modules/auth/auth.module.js';
import { SESSION_COOKIE } from '../src/modules/auth/auth.constants.js';
import { HealthController } from '../src/modules/health/health.controller.js';
import { HealthService } from '../src/modules/health/health.service.js';
import { makeTestEnv, TEST_PASSWORD } from './helpers/test-env.js';

async function createApp(env: Env): Promise<INestApplication> {
  @Global()
  @Module({
    providers: [{ provide: ENV, useValue: env }],
    exports: [ENV],
  })
  class TestConfigModule {}

  const moduleRef = await Test.createTestingModule({
    imports: [TestConfigModule, AuthModule],
    controllers: [HealthController],
    providers: [
      {
        provide: HealthService,
        useValue: {
          check: () => ({ status: 'ok', db: 'up', redis: 'up' }),
        },
      },
    ],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app, env);
  await app.init();
  return app;
}

function sessionCookie(res: request.Response): string | undefined {
  const cookies = (res.headers['set-cookie'] as unknown as string[]) ?? [];
  return cookies.find((c) => c.startsWith(`${SESSION_COOKIE}=`));
}

describe('Auth (e2e)', () => {
  let app: INestApplication;
  const env = makeTestEnv();

  beforeEach(async () => {
    app = await createApp(env);
  });

  afterEach(async () => {
    await app.close();
  });

  const login = (password = TEST_PASSWORD, email = env.ADMIN_EMAIL) =>
    request(app.getHttpServer()).post('/auth/login').send({ email, password });

  it('login correcto responde 200 y setea una cookie httpOnly SameSite=Lax', async () => {
    const res = await login().expect(200);
    expect(res.body).toEqual({ email: env.ADMIN_EMAIL });
    const cookie = sessionCookie(res)!;
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).not.toContain('Secure');
  });

  it('en produccion la cookie es Secure', async () => {
    await app.close();
    app = await createApp(makeTestEnv({ NODE_ENV: 'production' }));
    const res = await login().expect(200);
    expect(sessionCookie(res)).toContain('Secure');
  });

  it('login con contraseña incorrecta responde 401', async () => {
    const res = await login('incorrecta-123').expect(401);
    expect(sessionCookie(res)).toBeUndefined();
  });

  it('login con body invalido responde 400', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'no-es-mail', password: '' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: env.ADMIN_EMAIL, password: TEST_PASSWORD, extra: 1 })
      .expect(400);
  });

  it('tras 5 fallos responde 429', async () => {
    for (let i = 0; i < 5; i++) await login('incorrecta-123').expect(401);
    await login().expect(429);
  });

  it('/auth/me sin cookie responde 401', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('/auth/me con la cookie del login responde con el usuario', async () => {
    const cookie = sessionCookie(await login().expect(200))!;
    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', cookie.split(';')[0])
      .expect(200);
    expect(res.body).toEqual({ email: env.ADMIN_EMAIL });
  });

  it('/auth/me con una cookie alterada responde 401', async () => {
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', `${SESSION_COOKIE}=abc.def.ghi`)
      .expect(401);
  });

  it('logout limpia la cookie', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/logout')
      .expect(204);
    expect(sessionCookie(res)).toMatch(/Expires=Thu, 01 Jan 1970/);
  });

  it('/health sigue siendo publico', async () => {
    await request(app.getHttpServer()).get('/health').expect(200);
  });

  it('CORS permite solo el origen de la web, con credenciales', async () => {
    const ok = await request(app.getHttpServer())
      .options('/auth/me')
      .set('Origin', env.WEB_ORIGIN)
      .set('Access-Control-Request-Method', 'GET');
    expect(ok.headers['access-control-allow-origin']).toBe(env.WEB_ORIGIN);
    expect(ok.headers['access-control-allow-credentials']).toBe('true');

    const bad = await request(app.getHttpServer())
      .options('/auth/me')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'GET');
    // Con origen fijo, el servidor siempre anuncia solo el de la web; el navegador
    // bloquea la respuesta a cualquier otro origen. Nunca se refleja el origen pedido.
    expect(bad.headers['access-control-allow-origin']).toBe(env.WEB_ORIGIN);
    expect(bad.headers['access-control-allow-origin']).not.toBe(
      'https://evil.example',
    );
  });
});
