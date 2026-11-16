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
import { MetaGraphClient } from '../src/modules/meta/meta-graph.client.js';
import { MetaController } from '../src/modules/meta/meta.controller.js';
import { MetaService } from '../src/modules/meta/meta.service.js';
import { PrismaModule } from '../src/modules/prisma/prisma.module.js';
import { PrismaService } from '../src/modules/prisma/prisma.service.js';
import { resetDatabase, testDatabaseUrl } from './helpers/test-db.js';
import { makeTestEnv, TEST_PASSWORD } from './helpers/test-env.js';

type Route = (params: Record<string, unknown>, token?: string) => unknown;

describe('Conexion Meta (e2e, DB de test, Meta mockeado)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let crypto: CryptoService;
  let cookie: string;
  const env: Env = makeTestEnv({ DATABASE_URL: testDatabaseUrl() });
  const notifyAdmin = vi.fn().mockResolvedValue(undefined);
  const routes = new Map<string, Route>();
  const calls: { path: string; token?: string }[] = [];

  // Meta falso: nunca sale a internet
  const fakeGraph = {
    get: (
      path: string,
      params: Record<string, unknown> = {},
      token?: string,
    ) => {
      calls.push({ path, token });
      const route = routes.get(path);
      if (!route) return Promise.reject(new Error(`ruta sin mock: ${path}`));
      try {
        return Promise.resolve(route(params, token));
      } catch (error) {
        return Promise.reject(error);
      }
    },
    post: () => Promise.reject(new Error('no se publica en estos tests')),
  };

  const pages = {
    data: [
      {
        id: 'page-1',
        name: 'Kalendox',
        access_token: 'PAGE-TOKEN-1',
        picture: { data: { url: 'https://img/p1.jpg' } },
        instagram_business_account: {
          id: 'ig-1',
          username: 'kalendox',
          profile_picture_url: 'https://img/ig1.jpg',
        },
      },
      { id: 'page-2', name: 'Envios Box', access_token: 'PAGE-TOKEN-2' },
    ],
  };

  const allPermissions = {
    data: [
      'pages_show_list',
      'pages_read_engagement',
      'pages_manage_posts',
      'instagram_basic',
      'instagram_content_publish',
      'business_management',
    ].map((permission) => ({ permission, status: 'granted' })),
  };

  function mockHappyPath() {
    routes.clear();
    routes.set('/oauth/access_token', (params) =>
      params.grant_type === 'fb_exchange_token'
        ? { access_token: 'LONG-USER-TOKEN', expires_in: 5_184_000 }
        : { access_token: 'SHORT-USER-TOKEN' },
    );
    routes.set('/me', () => ({ id: 'fb-user-1', name: 'Matias' }));
    routes.set('/me/accounts', () => pages);
    routes.set('/me/permissions', () => allPermissions);
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
      controllers: [MetaController],
      providers: [
        MetaService,
        { provide: MetaGraphClient, useValue: fakeGraph },
      ],
      imports: [CryptoModule],
    })
    class TestMetaModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [
        TestConfigModule,
        FakeMailModule,
        PrismaModule,
        CryptoModule,
        AuthModule,
        TestMetaModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app as NestExpressApplication, env);
    await app.init();
    prisma = app.get(PrismaService);
    crypto = app.get(CryptoService);

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
    post: (url: string) => request(server()).post(url).set('Cookie', cookie),
  };

  /** Recorre el flujo real: connect-url -> (Facebook) -> callback con el state y la cookie. */
  async function startConnect() {
    const res = await authed.get('/meta/connect-url').expect(200);
    const url = new URL(res.body.url as string);
    const state = url.searchParams.get('state')!;
    const oauthCookie = (res.headers['set-cookie'] as unknown as string[]).find(
      (c) => c.startsWith('sp_oauth_state='),
    )!;
    return {
      url,
      state,
      oauthCookie,
      oauthCookiePair: oauthCookie.split(';')[0],
    };
  }

  describe('autenticacion', () => {
    it('status, connect-url y sync exigen sesion; el callback es publico', async () => {
      await request(server()).get('/meta/status').expect(401);
      await request(server()).get('/meta/connect-url').expect(401);
      await request(server()).post('/meta/sync').expect(401);
      // Sin state valido responde 400 (no 401): la ruta es publica
      await request(server()).get('/meta/callback?code=x&state=y').expect(400);
    });
  });

  describe('connect-url', () => {
    it('arma la URL de Facebook con la app, scopes, redirect y state; cookie httpOnly', async () => {
      const { url, oauthCookie } = await startConnect();
      expect(url.origin + url.pathname).toBe(
        'https://www.facebook.com/v24.0/dialog/oauth',
      );
      expect(url.searchParams.get('client_id')).toBe(env.META_APP_ID);
      expect(url.searchParams.get('redirect_uri')).toBe(env.META_REDIRECT_URI);
      expect(url.searchParams.get('scope')).toContain('pages_manage_posts');
      expect(url.searchParams.get('scope')).toContain(
        'instagram_content_publish',
      );
      expect(url.searchParams.get('state')).toBeTruthy();
      expect(url.toString()).not.toContain(env.META_APP_SECRET);
      expect(oauthCookie).toContain('HttpOnly');
      expect(oauthCookie).toContain('SameSite=Lax');
    });
  });

  describe('callback', () => {
    it('conecta: canjea el codigo, guarda el token cifrado y sincroniza', async () => {
      const { state, oauthCookiePair } = await startConnect();
      const res = await request(server())
        .get(`/meta/callback?code=CODE123&state=${encodeURIComponent(state)}`)
        .set('Cookie', oauthCookiePair)
        .expect(302);
      expect(res.headers.location).toBe(
        `${env.WEB_ORIGIN}/settings/meta?status=ok`,
      );

      const connection = await prisma.metaConnection.findFirstOrThrow();
      expect(connection.fbUserName).toBe('Matias');
      expect(connection.status).toBe('ACTIVE');
      expect(connection.userTokenEnc).not.toContain('LONG-USER-TOKEN');
      expect(crypto.decrypt(connection.userTokenEnc)).toBe('LONG-USER-TOKEN');
      expect(connection.userTokenExpiresAt!.getTime()).toBeGreaterThan(
        Date.now() + 59 * 24 * 3600 * 1000,
      );
      expect(await prisma.socialAccount.count()).toBe(3);
      // La cookie del state se invalida tras usarla
      expect(
        (res.headers['set-cookie'] as unknown as string[]).join(';'),
      ).toMatch(/sp_oauth_state=;/);
    });

    it('rechaza un callback sin cookie, con state ajeno o alterado, sin tocar Meta', async () => {
      const { state, oauthCookiePair } = await startConnect();
      await request(server())
        .get(`/meta/callback?code=C&state=${encodeURIComponent(state)}`)
        .expect(400);
      await request(server())
        .get(`/meta/callback?code=C&state=${encodeURIComponent(state)}x`)
        .set('Cookie', oauthCookiePair)
        .expect(400);
      await request(server())
        .get('/meta/callback?code=C')
        .set('Cookie', oauthCookiePair)
        .expect(400);
      expect(calls).toHaveLength(0);
      expect(await prisma.metaConnection.count()).toBe(0);
    });

    it('si el usuario cancela en Facebook vuelve con status=denied y no guarda nada', async () => {
      const { state, oauthCookiePair } = await startConnect();
      const res = await request(server())
        .get(
          `/meta/callback?error=access_denied&error_reason=user_denied&state=${encodeURIComponent(state)}`,
        )
        .set('Cookie', oauthCookiePair)
        .expect(302);
      expect(res.headers.location).toContain('status=denied');
      expect(await prisma.metaConnection.count()).toBe(0);
    });

    it('si Meta falla al canjear el codigo vuelve con status=error', async () => {
      routes.set('/oauth/access_token', () => {
        throw new MetaApiException('code vencido', 100, null, false);
      });
      const { state, oauthCookiePair } = await startConnect();
      const res = await request(server())
        .get(`/meta/callback?code=BAD&state=${encodeURIComponent(state)}`)
        .set('Cookie', oauthCookiePair)
        .expect(302);
      expect(res.headers.location).toContain('status=error');
      expect(await prisma.metaConnection.count()).toBe(0);
    });

    it('avisa con status=permissions si Meta no concedio todos los permisos', async () => {
      routes.set('/me/permissions', () => ({
        data: allPermissions.data.map((p) =>
          p.permission === 'instagram_content_publish'
            ? { ...p, status: 'declined' }
            : p,
        ),
      }));
      const { state, oauthCookiePair } = await startConnect();
      const res = await request(server())
        .get(`/meta/callback?code=C&state=${encodeURIComponent(state)}`)
        .set('Cookie', oauthCookiePair)
        .expect(302);
      expect(res.headers.location).toContain('status=permissions');
    });

    it('reconectar reemplaza la conexion anterior (una sola fila)', async () => {
      for (let i = 0; i < 2; i++) {
        const { state, oauthCookiePair } = await startConnect();
        await request(server())
          .get(`/meta/callback?code=C&state=${encodeURIComponent(state)}`)
          .set('Cookie', oauthCookiePair)
          .expect(302);
      }
      expect(await prisma.metaConnection.count()).toBe(1);
    });
  });

  describe('sync y cuentas', () => {
    async function connect() {
      const { state, oauthCookiePair } = await startConnect();
      await request(server())
        .get(`/meta/callback?code=C&state=${encodeURIComponent(state)}`)
        .set('Cookie', oauthCookiePair)
        .expect(302);
    }

    it('crea cuentas FB e IG; el token de la Pagina queda cifrado y el de IG usa el de su Pagina', async () => {
      await connect();
      const fb = await prisma.socialAccount.findFirstOrThrow({
        where: { externalId: 'page-1' },
      });
      expect(fb.network).toBe('FACEBOOK');
      expect(fb.pageTokenEnc).not.toContain('PAGE-TOKEN-1');
      expect(crypto.decrypt(fb.pageTokenEnc!)).toBe('PAGE-TOKEN-1');
      const ig = await prisma.socialAccount.findFirstOrThrow({
        where: { externalId: 'ig-1' },
      });
      expect(ig).toMatchObject({
        network: 'INSTAGRAM',
        username: 'kalendox',
        pageId: 'page-1',
        pageTokenEnc: null,
      });
      const meta = app.get(MetaService);
      await expect(meta.tokenForAccount(ig)).resolves.toBe('PAGE-TOKEN-1');
      await expect(meta.tokenForAccount(fb)).resolves.toBe('PAGE-TOKEN-1');
    });

    it('sync repetido no duplica, conserva la marca y desactiva las cuentas que desaparecen', async () => {
      await connect();
      const brand = await prisma.brand.create({
        data: { name: 'Kalendox', slug: 'kalendox' },
      });
      await prisma.socialAccount.updateMany({
        where: { externalId: 'page-1' },
        data: { brandId: brand.id },
      });
      routes.set('/me/accounts', () => ({ data: [pages.data[0]] }));
      const res = await authed.post('/meta/sync').expect(200);
      expect(res.body).toMatchObject({
        facebook: 1,
        instagram: 1,
        deactivated: 1,
        missingPermissions: [],
      });
      expect(await prisma.socialAccount.count()).toBe(3);
      const gone = await prisma.socialAccount.findFirstOrThrow({
        where: { externalId: 'page-2' },
      });
      expect(gone.active).toBe(false);
      const kept = await prisma.socialAccount.findFirstOrThrow({
        where: { externalId: 'page-1' },
      });
      expect(kept.brandId).toBe(brand.id);

      // Si vuelve a aparecer, se reactiva
      routes.set('/me/accounts', () => pages);
      await authed.post('/meta/sync').expect(200);
      expect(
        (
          await prisma.socialAccount.findFirstOrThrow({
            where: { externalId: 'page-2' },
          })
        ).active,
      ).toBe(true);
    });

    it('sigue la paginacion de /me/accounts', async () => {
      await connect();
      let n = 0;
      routes.set('/me/accounts', (params) => {
        n++;
        return params.after
          ? { data: [pages.data[1]] }
          : {
              data: [pages.data[0]],
              paging: { cursors: { after: 'CUR' }, next: 'https://next' },
            };
      });
      const res = await authed.post('/meta/sync').expect(200);
      expect(n).toBe(2);
      expect(res.body.facebook).toBe(2);
    });

    it('token invalido (190): marca la conexion INVALID, avisa por mail y responde 409', async () => {
      await connect();
      routes.set('/me/accounts', () => {
        throw new MetaApiException(
          'Invalid OAuth',
          190,
          null,
          false,
          false,
          401,
        );
      });
      await authed.post('/meta/sync').expect(409);
      expect((await prisma.metaConnection.findFirstOrThrow()).status).toBe(
        'INVALID',
      );
      expect(notifyAdmin).toHaveBeenCalledTimes(1);
      const status = await authed.get('/meta/status').expect(200);
      expect(status.body).toMatchObject({
        connected: false,
        status: 'INVALID',
      });
      // Con la conexion invalida ya no se llama a Meta
      calls.length = 0;
      await authed.post('/meta/sync').expect(409);
      expect(calls).toHaveLength(0);
    });

    it('otro error de Meta no invalida la conexion', async () => {
      await connect();
      routes.set('/me/accounts', () => {
        throw new MetaApiException('rate limit', 4, null, true);
      });
      await authed.post('/meta/sync').expect(503);
      expect((await prisma.metaConnection.findFirstOrThrow()).status).toBe(
        'ACTIVE',
      );
      expect(notifyAdmin).not.toHaveBeenCalled();
    });

    it('sync sin conexion responde 409', async () => {
      await authed.post('/meta/sync').expect(409);
    });

    it('status no expone tokens', async () => {
      await authed
        .get('/meta/status')
        .expect(200)
        .expect((r) => {
          expect(r.body.connected).toBe(false);
        });
      await connect();
      const res = await authed.get('/meta/status').expect(200);
      expect(res.body).toMatchObject({
        connected: true,
        status: 'ACTIVE',
        fbUserName: 'Matias',
      });
      expect(JSON.stringify(res.body)).not.toMatch(/TOKEN|v1:/);
    });

    it('el token usado para listar paginas es el de larga duracion, no el corto', async () => {
      await connect();
      const accountsCall = calls.find((c) => c.path === '/me/accounts')!;
      expect(accountsCall.token).toBe('LONG-USER-TOKEN');
    });
  });

  describe('tokenForAccount', () => {
    it('una cuenta IG sin Pagina o sin token lanza AccountWithoutToken', async () => {
      const meta = app.get(MetaService);
      await expect(
        meta.tokenForAccount({
          network: 'INSTAGRAM',
          pageId: null,
          pageTokenEnc: null,
        }),
      ).rejects.toThrow(/token/);
      await expect(
        meta.tokenForAccount({
          network: 'FACEBOOK',
          pageId: 'p',
          pageTokenEnc: null,
        }),
      ).rejects.toThrow(/token/);
    });
  });
});
