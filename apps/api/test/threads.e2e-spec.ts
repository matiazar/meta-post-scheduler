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
import { CryptoModule } from '../src/modules/crypto/crypto.module.js';
import { CryptoService } from '../src/modules/crypto/crypto.service.js';
import { MailService } from '../src/modules/mail/mail.service.js';
import { MetaApiException } from '../src/modules/meta/meta.exceptions.js';
import { ThreadsGraphClient } from '../src/modules/meta/threads-graph.client.js';
import { PrismaModule } from '../src/modules/prisma/prisma.module.js';
import { PrismaService } from '../src/modules/prisma/prisma.service.js';
import { ThreadsController } from '../src/modules/threads/threads.controller.js';
import { ThreadsService } from '../src/modules/threads/threads.service.js';
import { resetDatabase, testDatabaseUrl } from './helpers/test-db.js';
import { makeTestEnv, TEST_PASSWORD } from './helpers/test-env.js';

type Route = (params: Record<string, unknown>, token?: string) => unknown;

const DAY = 24 * 60 * 60 * 1000;

describe('Conexion Threads (e2e, DB de test, Threads mockeado)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let crypto: CryptoService;
  let threads: ThreadsService;
  let cookie: string;
  const env: Env = makeTestEnv({
    DATABASE_URL: testDatabaseUrl(),
    THREADS_APP_ID: '9876543210',
    THREADS_APP_SECRET: 'threads-test-secret',
    THREADS_REDIRECT_URI: 'http://localhost:3001/threads/callback',
  });
  const notifyAdmin = vi.fn().mockResolvedValue(undefined);
  const routes = new Map<string, Route>();
  const calls: {
    method: string;
    path: string;
    params: Record<string, unknown>;
  }[] = [];

  // Threads falso: nunca sale a internet
  const handle =
    (method: string) =>
    (path: string, params: Record<string, unknown> = {}, token?: string) => {
      calls.push({ method, path, params });
      const route = routes.get(`${method} ${path}`);
      if (!route) return Promise.reject(new Error(`ruta sin mock: ${path}`));
      try {
        return Promise.resolve(route(params, token));
      } catch (error) {
        return Promise.reject(error);
      }
    };
  const fakeGraph = { get: handle('GET'), post: handle('POST') };

  function mockHappyPath() {
    routes.clear();
    routes.set('POST /oauth/access_token', () => ({
      access_token: 'SHORT-TH-TOKEN',
      user_id: 'th-user-1',
    }));
    routes.set('GET /access_token', () => ({
      access_token: 'LONG-TH-TOKEN',
      expires_in: 5_184_000,
    }));
    routes.set('GET /v1.0/me', () => ({
      id: 'th-user-1',
      username: 'kalendox',
      threads_profile_picture_url: 'https://img/th1.jpg',
    }));
  }

  beforeAll(async () => {
    @Global()
    @Module({
      providers: [{ provide: ENV, useValue: env }],
      exports: [ENV],
    })
    class TestConfigModule {}

    // MailModule real necesita Redis: se reemplaza por un doble
    @Global()
    @Module({
      providers: [{ provide: MailService, useValue: { notifyAdmin } }],
      exports: [MailService],
    })
    class FakeMailModule {}

    @Module({
      controllers: [ThreadsController],
      providers: [
        ThreadsService,
        { provide: ThreadsGraphClient, useValue: fakeGraph },
      ],
      imports: [CryptoModule],
    })
    class TestThreadsModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [
        TestConfigModule,
        FakeMailModule,
        PrismaModule,
        CryptoModule,
        AuthModule,
        TestThreadsModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app as NestExpressApplication, env);
    await app.init();
    prisma = app.get(PrismaService);
    crypto = app.get(CryptoService);
    threads = app.get(ThreadsService);

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: env.ADMIN_EMAIL, password: TEST_PASSWORD })
      .expect(200);
    cookie = (login.headers['set-cookie'] as unknown as string[])
      .find((c) => c.startsWith(`${SESSION_COOKIE}=`))!
      .split(';')[0];
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    notifyAdmin.mockClear();
    calls.length = 0;
    mockHappyPath();
  });

  const server = () => app.getHttpServer();
  const authed = {
    get: (url: string) => request(server()).get(url).set('Cookie', cookie),
  };

  async function startConnect() {
    const res = await authed.get('/threads/connect-url').expect(200);
    const url = new URL(res.body.url as string);
    const oauthCookie = (res.headers['set-cookie'] as unknown as string[]).find(
      (c) => c.startsWith('sp_threads_oauth_state='),
    )!;
    return {
      url,
      state: url.searchParams.get('state')!,
      oauthCookie,
      oauthCookiePair: oauthCookie.split(';')[0],
    };
  }

  async function connected() {
    const { state, oauthCookiePair } = await startConnect();
    await request(server())
      .get(`/threads/callback?code=CODE&state=${encodeURIComponent(state)}`)
      .set('Cookie', oauthCookiePair)
      .expect(302);
  }

  it('status y connect-url exigen sesion; el callback es publico', async () => {
    await request(server()).get('/threads/status').expect(401);
    await request(server()).get('/threads/connect-url').expect(401);
    // Sin state valido responde 400 (no 401): la ruta es publica
    await request(server()).get('/threads/callback?code=x&state=y').expect(400);
  });

  it('connect-url arma la URL de Threads con la app, scopes, redirect y state; cookie httpOnly', async () => {
    const { url, oauthCookie } = await startConnect();
    expect(url.origin + url.pathname).toBe('https://threads.com/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe('9876543210');
    expect(url.searchParams.get('redirect_uri')).toBe(
      env.THREADS_REDIRECT_URI,
    );
    expect(url.searchParams.get('scope')).toBe(
      'threads_basic,threads_content_publish',
    );
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.toString()).not.toContain('threads-test-secret');
    expect(oauthCookie).toContain('HttpOnly');
    expect(oauthCookie).toContain('SameSite=Lax');
  });

  it('el callback conecta: canjea el codigo, guarda el token cifrado y crea la cuenta', async () => {
    const { state, oauthCookiePair } = await startConnect();
    const res = await request(server())
      .get(`/threads/callback?code=CODE123&state=${encodeURIComponent(state)}`)
      .set('Cookie', oauthCookiePair)
      .expect(302);
    expect(res.headers.location).toBe(
      `${env.WEB_ORIGIN}/settings/threads?status=ok`,
    );

    const connection = await prisma.threadsConnection.findFirstOrThrow();
    expect(connection).toMatchObject({
      threadsUserId: 'th-user-1',
      username: 'kalendox',
      status: 'ACTIVE',
    });
    expect(connection.tokenEnc).not.toContain('LONG-TH-TOKEN');
    expect(crypto.decrypt(connection.tokenEnc)).toBe('LONG-TH-TOKEN');
    expect(connection.tokenExpiresAt!.getTime()).toBeGreaterThan(
      Date.now() + 59 * DAY,
    );
    const account = await prisma.socialAccount.findFirstOrThrow({
      where: { network: 'THREADS' },
    });
    expect(account).toMatchObject({
      externalId: 'th-user-1',
      name: 'kalendox',
      pictureUrl: 'https://img/th1.jpg',
      active: true,
    });
    // El secreto viaja en el body del POST, no en la URL; la cookie vale una sola vez
    expect(calls[0]).toMatchObject({
      method: 'POST',
      path: '/oauth/access_token',
      params: { client_secret: 'threads-test-secret', code: 'CODE123' },
    });
    expect(
      (res.headers['set-cookie'] as unknown as string[]).join(';'),
    ).toMatch(/sp_threads_oauth_state=;/);
  });

  it('reconectar actualiza el token y conserva la marca de la cuenta', async () => {
    await connected();
    const brand = await prisma.brand.create({
      data: { name: 'Kalendox', slug: 'kalendox' },
    });
    await prisma.socialAccount.updateMany({
      where: { network: 'THREADS' },
      data: { brandId: brand.id },
    });
    await prisma.threadsConnection.updateMany({ data: { status: 'INVALID' } });
    routes.set('GET /access_token', () => ({
      access_token: 'NEW-LONG-TOKEN',
      expires_in: 5_184_000,
    }));

    await connected();

    expect(await prisma.threadsConnection.count()).toBe(1);
    expect(await prisma.socialAccount.count()).toBe(1);
    const connection = await prisma.threadsConnection.findFirstOrThrow();
    expect(connection.status).toBe('ACTIVE');
    expect(crypto.decrypt(connection.tokenEnc)).toBe('NEW-LONG-TOKEN');
    expect(
      (await prisma.socialAccount.findFirstOrThrow()).brandId,
    ).toBe(brand.id);
  });

  it('rechaza un callback sin cookie, con state alterado o ajeno, sin tocar Threads', async () => {
    const { state, oauthCookiePair } = await startConnect();
    await request(server())
      .get(`/threads/callback?code=C&state=${encodeURIComponent(state)}`)
      .expect(400);
    await request(server())
      .get(`/threads/callback?code=C&state=${encodeURIComponent(state)}x`)
      .set('Cookie', oauthCookiePair)
      .expect(400);
    // La cookie de Meta no sirve para Threads
    await request(server())
      .get(`/threads/callback?code=C&state=${encodeURIComponent(state)}`)
      .set('Cookie', oauthCookiePair.replace('sp_threads_', 'sp_'))
      .expect(400);
    expect(calls).toHaveLength(0);
    expect(await prisma.threadsConnection.count()).toBe(0);
  });

  it('si el usuario cancela vuelve con status=denied y no guarda nada', async () => {
    const { state, oauthCookiePair } = await startConnect();
    const res = await request(server())
      .get(
        `/threads/callback?error=access_denied&state=${encodeURIComponent(state)}`,
      )
      .set('Cookie', oauthCookiePair)
      .expect(302);
    expect(res.headers.location).toContain('status=denied');
    expect(await prisma.threadsConnection.count()).toBe(0);
  });

  it('si Threads falla al canjear el codigo vuelve con status=error', async () => {
    routes.set('POST /oauth/access_token', () => {
      throw new MetaApiException('code vencido', 400, null, false);
    });
    const { state, oauthCookiePair } = await startConnect();
    const res = await request(server())
      .get(`/threads/callback?code=BAD&state=${encodeURIComponent(state)}`)
      .set('Cookie', oauthCookiePair)
      .expect(302);
    expect(res.headers.location).toContain('status=error');
    expect(await prisma.threadsConnection.count()).toBe(0);
  });

  it('status lista las conexiones sin exponer tokens', async () => {
    let res = await authed.get('/threads/status').expect(200);
    expect(res.body).toEqual({ configured: true, connections: [] });
    await connected();
    res = await authed.get('/threads/status').expect(200);
    expect(res.body.connections).toEqual([
      {
        username: 'kalendox',
        status: 'ACTIVE',
        tokenExpiresAt: expect.any(String),
      },
    ]);
    expect(JSON.stringify(res.body)).not.toContain('TH-TOKEN');
  });

  describe('renovacion del token', () => {
    const makeOld = (expiresInDays: number, refreshedDaysAgo: number) =>
      prisma.threadsConnection.updateMany({
        data: {
          tokenExpiresAt: new Date(Date.now() + expiresInDays * DAY),
          tokenRefreshedAt: new Date(Date.now() - refreshedDaysAgo * DAY),
        },
      });

    it('renueva los que vencen en menos de 15 dias y guarda el token nuevo', async () => {
      await connected();
      await makeOld(10, 50);
      routes.set('GET /refresh_access_token', () => ({
        access_token: 'REFRESHED-TOKEN',
        expires_in: 5_184_000,
      }));

      expect(await threads.refreshDue()).toBe(1);

      const connection = await prisma.threadsConnection.findFirstOrThrow();
      expect(crypto.decrypt(connection.tokenEnc)).toBe('REFRESHED-TOKEN');
      expect(connection.tokenExpiresAt!.getTime()).toBeGreaterThan(
        Date.now() + 59 * DAY,
      );
      const refresh = calls.find((c) => c.path === '/refresh_access_token')!;
      expect(refresh.params).toMatchObject({
        grant_type: 'th_refresh_token',
        access_token: 'LONG-TH-TOKEN',
      });
    });

    it('no toca los que vencen en mas de 15 dias ni los renovados hace menos de 24 h', async () => {
      await connected();
      await makeOld(40, 20);
      expect(await threads.refreshDue()).toBe(0);
      await makeOld(10, 0);
      expect(await threads.refreshDue()).toBe(0);
      expect(calls.some((c) => c.path === '/refresh_access_token')).toBe(false);
    });

    it('si Threads rechaza el token (190) la conexion queda INVALID y avisa una sola vez', async () => {
      await connected();
      await makeOld(5, 50);
      routes.set('GET /refresh_access_token', () => {
        throw new MetaApiException('Token vencido', 190, null, false);
      });

      expect(await threads.refreshDue()).toBe(0);
      expect(await threads.refreshDue()).toBe(0);

      expect((await prisma.threadsConnection.findFirstOrThrow()).status).toBe(
        'INVALID',
      );
      expect(notifyAdmin).toHaveBeenCalledTimes(1);
      expect(notifyAdmin.mock.calls[0].join(' ')).not.toContain('LONG-TH-TOKEN');
    });

    it('un fallo pasajero se deja para la proxima vuelta sin invalidar nada', async () => {
      await connected();
      await makeOld(5, 50);
      routes.set('GET /refresh_access_token', () => {
        throw new MetaApiException('caido', null, null, true);
      });

      expect(await threads.refreshDue()).toBe(0);

      expect((await prisma.threadsConnection.findFirstOrThrow()).status).toBe(
        'ACTIVE',
      );
      expect(notifyAdmin).not.toHaveBeenCalled();
    });
  });

  it('sin las variables de Threads, connect-url responde 503 y status lo indica', async () => {
    const original = { ...env };
    env.THREADS_APP_ID = undefined;
    env.THREADS_APP_SECRET = undefined;
    env.THREADS_REDIRECT_URI = undefined;
    try {
      await authed.get('/threads/connect-url').expect(503);
      const res = await authed.get('/threads/status').expect(200);
      expect(res.body.configured).toBe(false);
    } finally {
      Object.assign(env, original);
    }
  });
});
