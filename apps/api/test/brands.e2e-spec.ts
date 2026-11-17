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
import { BrandsModule } from '../src/modules/brands/brands.module.js';
import { CryptoModule } from '../src/modules/crypto/crypto.module.js';
import { CryptoService } from '../src/modules/crypto/crypto.service.js';
import { PrismaModule } from '../src/modules/prisma/prisma.module.js';
import { PrismaService } from '../src/modules/prisma/prisma.service.js';
import { resetDatabase, testDatabaseUrl } from './helpers/test-db.js';
import { makeTestEnv, TEST_PASSWORD } from './helpers/test-env.js';

describe('Marcas y cuentas sociales (e2e, DB de test)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let crypto: CryptoService;
  let cookie: string;
  const env: Env = makeTestEnv({ DATABASE_URL: testDatabaseUrl() });

  beforeAll(async () => {
    @Global()
    @Module({
      providers: [{ provide: ENV, useValue: env }],
      exports: [ENV],
    })
    class TestConfigModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [
        TestConfigModule,
        PrismaModule,
        CryptoModule,
        AuthModule,
        BrandsModule,
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
    const cookies = login.headers['set-cookie'] as unknown as string[];
    cookie = cookies
      .find((c) => c.startsWith(`${SESSION_COOKIE}=`))!
      .split(';')[0];
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  const api = () => {
    const server = app.getHttpServer();
    return {
      get: (url: string) => request(server).get(url).set('Cookie', cookie),
      post: (url: string) => request(server).post(url).set('Cookie', cookie),
      patch: (url: string) => request(server).patch(url).set('Cookie', cookie),
      delete: (url: string) =>
        request(server).delete(url).set('Cookie', cookie),
    };
  };

  const createBrand = async (name = 'Kalendox') =>
    (await api().post('/brands').send({ name }).expect(201)).body as {
      id: string;
      slug: string;
      color: string;
    };

  describe('autenticacion', () => {
    it('sin sesion todas las rutas responden 401', async () => {
      const server = app.getHttpServer();
      await request(server).get('/brands').expect(401);
      await request(server).post('/brands').send({ name: 'X' }).expect(401);
      await request(server).delete('/brands/abc').expect(401);
      await request(server).get('/social-accounts').expect(401);
      await request(server).patch('/social-accounts/abc').send({}).expect(401);
    });
  });

  describe('marcas', () => {
    it('crea una marca con slug automatico y defaults', async () => {
      const res = await api().post('/brands').send({ name: 'Envíos Box' });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        name: 'Envíos Box',
        slug: 'envios-box',
        color: '#6366f1',
        active: true,
      });
    });

    it('guarda y actualiza descripcion y tono para la IA; vienen vacios por defecto', async () => {
      const created = await api()
        .post('/brands')
        .send({ name: 'Con IA', description: 'Turnos para yoga', tone: 'cercano' })
        .expect(201);
      expect(created.body).toMatchObject({
        description: 'Turnos para yoga',
        tone: 'cercano',
      });
      const plain = await api().post('/brands').send({ name: 'Sin IA' }).expect(201);
      expect(plain.body).toMatchObject({ description: '', tone: '' });

      const updated = await api()
        .patch(`/brands/${created.body.id}`)
        .send({ tone: 'formal' })
        .expect(200);
      expect(updated.body).toMatchObject({
        description: 'Turnos para yoga',
        tone: 'formal',
      });

      await api()
        .patch(`/brands/${created.body.id}`)
        .send({ description: 'x'.repeat(1001) })
        .expect(400);
      await api()
        .patch(`/brands/${created.body.id}`)
        .send({ tone: 'x'.repeat(201) })
        .expect(400);
    });

    it('usa el slug indicado y rechaza uno repetido con 409', async () => {
      await api()
        .post('/brands')
        .send({ name: 'A', slug: 'marca' })
        .expect(201);
      await api()
        .post('/brands')
        .send({ name: 'B', slug: 'marca' })
        .expect(409);
    });

    it('rechaza nombres que repiten el slug generado (409)', async () => {
      await createBrand('Kalendox');
      await api().post('/brands').send({ name: 'kalendox!' }).expect(409);
    });

    it('si el nombre no genera slug util responde 400', async () => {
      await api().post('/brands').send({ name: '!!!' }).expect(400);
    });

    it('valida el body: nombre vacio, color invalido, campos extra', async () => {
      await api().post('/brands').send({ name: '   ' }).expect(400);
      await api()
        .post('/brands')
        .send({ name: 'X', color: 'rojo' })
        .expect(400);
      await api()
        .post('/brands')
        .send({ name: 'X', slug: 'Slug Invalido' })
        .expect(400);
      await api().post('/brands').send({ name: 'X', id: 'abc' }).expect(400);
    });

    it('lista ordenado por nombre y obtiene una marca', async () => {
      const b = await createBrand('Beta');
      await createBrand('Alfa');
      const list = await api().get('/brands').expect(200);
      expect(list.body.map((x: { name: string }) => x.name)).toEqual([
        'Alfa',
        'Beta',
      ]);
      const one = await api().get(`/brands/${b.id}`).expect(200);
      expect(one.body.name).toBe('Beta');
      await api().get('/brands/no-existe').expect(404);
    });

    it('actualiza solo lo enviado y valida el slug unico', async () => {
      const a = await createBrand('Alfa');
      await createBrand('Beta');
      const res = await api()
        .patch(`/brands/${a.id}`)
        .send({ color: '#FF0000', active: false })
        .expect(200);
      expect(res.body).toMatchObject({
        name: 'Alfa',
        color: '#FF0000',
        active: false,
      });
      await api().patch(`/brands/${a.id}`).send({ slug: 'beta' }).expect(409);
      await api().patch('/brands/no-existe').send({ name: 'X' }).expect(404);
    });

    it('elimina una marca sin posts y deja sus cuentas sin marca', async () => {
      const brand = await createBrand();
      const account = await prisma.socialAccount.create({
        data: {
          brandId: brand.id,
          network: 'FACEBOOK',
          externalId: 'fb-1',
          name: 'Pagina 1',
        },
      });
      await api().delete(`/brands/${brand.id}`).expect(204);
      await api().get(`/brands/${brand.id}`).expect(404);
      const after = await prisma.socialAccount.findUniqueOrThrow({
        where: { id: account.id },
      });
      expect(after.brandId).toBeNull();
      await api().delete(`/brands/${brand.id}`).expect(404);
    });

    it('no elimina una marca con posts (409)', async () => {
      const brand = await createBrand();
      await prisma.post.create({ data: { brandId: brand.id } });
      await api().delete(`/brands/${brand.id}`).expect(409);
      await api().get(`/brands/${brand.id}`).expect(200);
    });
  });

  describe('cuentas sociales', () => {
    const seedAccount = (
      overrides: Partial<{
        externalId: string;
        name: string;
        brandId: string | null;
        network: 'FACEBOOK' | 'INSTAGRAM';
      }> = {},
    ) =>
      prisma.socialAccount.create({
        data: {
          network: 'FACEBOOK',
          externalId: 'fb-1',
          name: 'Pagina 1',
          pageId: 'page-1',
          pageTokenEnc: crypto.encrypt('EAAB-token-secreto'),
          ...overrides,
        },
      });

    it('nunca expone el token ni campos internos', async () => {
      await seedAccount();
      const res = await api().get('/social-accounts').expect(200);
      expect(res.body).toHaveLength(1);
      expect(Object.keys(res.body[0]).sort()).toEqual([
        'active',
        'brandId',
        'externalId',
        'id',
        'name',
        'network',
        'pictureUrl',
        'username',
      ]);
      expect(JSON.stringify(res.body)).not.toContain('EAAB-token-secreto');
      expect(JSON.stringify(res.body)).not.toMatch(/pageTokenEnc|v1:/);
    });

    it('filtra por marca y por sin asignar', async () => {
      const brand = await createBrand();
      await seedAccount({ externalId: 'fb-1', brandId: brand.id });
      await seedAccount({ externalId: 'fb-2', name: 'Pagina 2' });
      const byBrand = await api()
        .get(`/social-accounts?brandId=${brand.id}`)
        .expect(200);
      expect(byBrand.body).toHaveLength(1);
      const free = await api()
        .get('/social-accounts?unassigned=true')
        .expect(200);
      expect(free.body).toHaveLength(1);
      expect(free.body[0].externalId).toBe('fb-2');
      await api().get('/social-accounts?unassigned=quizas').expect(400);
    });

    it('asigna y desasigna una marca sin exponer el token', async () => {
      const brand = await createBrand();
      const account = await seedAccount();
      const assigned = await api()
        .patch(`/social-accounts/${account.id}`)
        .send({ brandId: brand.id })
        .expect(200);
      expect(assigned.body.brandId).toBe(brand.id);
      expect(JSON.stringify(assigned.body)).not.toContain('v1:');
      const freed = await api()
        .patch(`/social-accounts/${account.id}`)
        .send({ brandId: null })
        .expect(200);
      expect(freed.body.brandId).toBeNull();
    });

    it('rechaza marca inexistente (404), cuenta inexistente (404) y body invalido (400)', async () => {
      const account = await seedAccount();
      await api()
        .patch(`/social-accounts/${account.id}`)
        .send({ brandId: 'no-existe' })
        .expect(404);
      const brand = await createBrand();
      await api()
        .patch('/social-accounts/no-existe')
        .send({ brandId: brand.id })
        .expect(404);
      await api().patch(`/social-accounts/${account.id}`).send({}).expect(400);
      await api()
        .patch(`/social-accounts/${account.id}`)
        .send({ brandId: brand.id, active: false })
        .expect(400);
    });

    it('el token guardado en la DB esta cifrado y se descifra de ida y vuelta', async () => {
      const account = await seedAccount();
      const row = await prisma.socialAccount.findUniqueOrThrow({
        where: { id: account.id },
      });
      expect(row.pageTokenEnc).not.toContain('EAAB-token-secreto');
      expect(crypto.decrypt(row.pageTokenEnc!)).toBe('EAAB-token-secreto');
    });
  });
});
