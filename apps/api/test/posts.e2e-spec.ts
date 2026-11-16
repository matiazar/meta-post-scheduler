import { randomUUID } from 'node:crypto';
import { Global, Module } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import sharp from 'sharp';
import request from 'supertest';
import { configureApp } from '../src/app.setup.js';
import { ENV } from '../src/config/config.module.js';
import type { Env } from '../src/config/env.js';
import { AuthModule } from '../src/modules/auth/auth.module.js';
import { SESSION_COOKIE } from '../src/modules/auth/auth.constants.js';
import { ImageProcessor } from '../src/modules/media/image-processor.js';
import { PrismaModule } from '../src/modules/prisma/prisma.module.js';
import { PrismaService } from '../src/modules/prisma/prisma.service.js';
import { PostMediaService } from '../src/modules/posts/post-media.service.js';
import { PostsController } from '../src/modules/posts/posts.controller.js';
import { PostsService } from '../src/modules/posts/posts.service.js';
import { StorageException } from '../src/modules/storage/storage.exceptions.js';
import { StorageService } from '../src/modules/storage/storage.service.js';
import { resetDatabase, testDatabaseUrl } from './helpers/test-db.js';
import { makeTestEnv, TEST_PASSWORD } from './helpers/test-env.js';

const hours = (n: number) => new Date(Date.now() + n * 3_600_000).toISOString();

describe('Posts (e2e, DB de test, R2 en memoria)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let posts: PostsService;
  let cookie: string;
  const env: Env = makeTestEnv({ DATABASE_URL: testDatabaseUrl() });

  const bucket = new Map<string, Buffer>();
  let failPutAfter = Infinity;
  let puts = 0;
  const fakeStorage = {
    put: (key: string, body: Buffer) => {
      if (++puts > failPutAfter) {
        return Promise.reject(new StorageException('guardar'));
      }
      bucket.set(key, body);
      return Promise.resolve();
    },
    get: (key: string) => {
      const body = bucket.get(key);
      return body
        ? Promise.resolve(body)
        : Promise.reject(new StorageException('leer'));
    },
    delete: (key: string) => {
      bucket.delete(key);
      return Promise.resolve();
    },
    publicUrl: (key: string) => `https://media.example.com/${key}`,
  };
  const processedKeys = () =>
    [...bucket.keys()].filter((k) => k.startsWith('processed/'));

  beforeAll(async () => {
    @Global()
    @Module({
      providers: [{ provide: ENV, useValue: env }],
      exports: [ENV],
    })
    class TestConfigModule {}

    @Module({
      controllers: [PostsController],
      providers: [
        PostsService,
        PostMediaService,
        ImageProcessor,
        { provide: StorageService, useValue: fakeStorage },
      ],
    })
    class TestPostsModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [TestConfigModule, PrismaModule, AuthModule, TestPostsModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app as NestExpressApplication, env);
    await app.init();
    prisma = app.get(PrismaService);
    posts = app.get(PostsService);

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

  // Datos base de cada test
  let brandId: string;
  let fb: string;
  let ig: string;

  beforeEach(async () => {
    await resetDatabase(prisma);
    bucket.clear();
    failPutAfter = Infinity;
    puts = 0;
    const brand = await prisma.brand.create({
      data: { name: 'Kalendox', slug: 'kalendox', color: '#112233' },
    });
    brandId = brand.id;
    fb = (
      await prisma.socialAccount.create({
        data: {
          brandId,
          network: 'FACEBOOK',
          externalId: 'page-1',
          name: 'Kalendox FB',
        },
      })
    ).id;
    ig = (
      await prisma.socialAccount.create({
        data: {
          brandId,
          network: 'INSTAGRAM',
          externalId: 'ig-1',
          name: 'kalendox',
          username: 'kalendox',
        },
      })
    ).id;
  });

  const server = () => app.getHttpServer();
  const api = {
    get: (url: string) => request(server()).get(url).set('Cookie', cookie),
    post: (url: string) => request(server()).post(url).set('Cookie', cookie),
    patch: (url: string) => request(server()).patch(url).set('Cookie', cookie),
    delete: (url: string) =>
      request(server()).delete(url).set('Cookie', cookie),
  };

  async function seedMedia(width = 1600, height = 1200): Promise<string> {
    const buffer = await sharp({
      create: { width, height, channels: 3, background: '#cc6633' },
    })
      .jpeg()
      .toBuffer();
    const key = `originals/2026/11/${randomUUID()}.jpg`;
    bucket.set(key, buffer);
    const media = await prisma.media.create({
      data: {
        originalKey: key,
        originalFilename: `foto-${width}x${height}.jpg`,
        width,
        height,
        sizeBytes: buffer.length,
        mime: 'image/jpeg',
      },
    });
    return media.id;
  }

  async function createDraft(overrides: Record<string, unknown> = {}) {
    const mediaId = await seedMedia();
    const res = await api
      .post('/posts')
      .send({
        brandId,
        caption: 'Hola mundo',
        mediaIds: [mediaId],
        targets: [{ socialAccountId: fb }, { socialAccountId: ig }],
        ...overrides,
      })
      .expect(201);
    return res.body as {
      id: string;
      status: string;
      media: {
        mediaId: string;
        publicUrl: string;
        width: number;
        height: number;
      }[];
      targets: { id: string; status: string }[];
    };
  }

  describe('autenticacion', () => {
    it('todas las rutas exigen sesion', async () => {
      const s = server();
      await request(s).get('/posts?status=DRAFT').expect(401);
      await request(s).get('/posts/x').expect(401);
      await request(s).post('/posts').send({}).expect(401);
      await request(s).patch('/posts/x').send({}).expect(401);
      await request(s).post('/posts/x/schedule').send({}).expect(401);
      await request(s).post('/posts/x/publish-now').expect(401);
      await request(s).post('/posts/x/cancel').expect(401);
      await request(s).post('/posts/x/retry').expect(401);
      await request(s).delete('/posts/x').expect(401);
    });
  });

  describe('crear', () => {
    it('crea un borrador con imagenes procesadas y destinos pendientes', async () => {
      const post = await createDraft({
        aspectRatio: 'PORTRAIT',
        fitMode: 'CROP',
      });
      expect(post.status).toBe('DRAFT');
      expect(post.media).toHaveLength(1);
      expect(post.media[0].width / post.media[0].height).toBeCloseTo(0.8, 2);
      expect(post.media[0].publicUrl).toMatch(
        /^https:\/\/media\.example\.com\/processed\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.jpg$/,
      );
      expect(post.targets.map((t) => t.status)).toEqual(['PENDING', 'PENDING']);
      expect(processedKeys()).toHaveLength(1);
      const stored = bucket.get(processedKeys()[0])!;
      expect((await sharp(stored).metadata()).format).toBe('jpeg');
    });

    it('un borrador puede estar vacio', async () => {
      const res = await api.post('/posts').send({ brandId }).expect(201);
      expect(res.body).toMatchObject({
        status: 'DRAFT',
        caption: '',
        aspectRatio: 'SQUARE',
        fitMode: 'CROP',
        media: [],
        targets: [],
      });
    });

    it('conserva el orden de las imagenes', async () => {
      const a = await seedMedia(800, 800);
      const b = await seedMedia(900, 900);
      const res = await api
        .post('/posts')
        .send({ brandId, mediaIds: [b, a] })
        .expect(201);
      expect(res.body.media.map((m: { mediaId: string }) => m.mediaId)).toEqual(
        [b, a],
      );
      expect(
        res.body.media.map((m: { position: number }) => m.position),
      ).toEqual([0, 1]);
    });

    it('marca inexistente -> 404', async () => {
      await api.post('/posts').send({ brandId: 'no-existe' }).expect(404);
    });

    it('rechaza una cuenta de otra marca', async () => {
      const other = await prisma.brand.create({
        data: { name: 'Otra', slug: 'otra' },
      });
      const foreign = await prisma.socialAccount.create({
        data: {
          brandId: other.id,
          network: 'FACEBOOK',
          externalId: 'page-x',
          name: 'Ajena',
        },
      });
      await api
        .post('/posts')
        .send({ brandId, targets: [{ socialAccountId: foreign.id }] })
        .expect(400);
      // Sin marca asignada tampoco vale
      const free = await prisma.socialAccount.create({
        data: { network: 'FACEBOOK', externalId: 'page-y', name: 'Libre' },
      });
      await api
        .post('/posts')
        .send({ brandId, targets: [{ socialAccountId: free.id }] })
        .expect(400);
    });

    it('rechaza cuentas inactivas, inexistentes y repetidas', async () => {
      await prisma.socialAccount.update({
        where: { id: fb },
        data: { active: false },
      });
      await api
        .post('/posts')
        .send({ brandId, targets: [{ socialAccountId: fb }] })
        .expect(400);
      await api
        .post('/posts')
        .send({ brandId, targets: [{ socialAccountId: 'no-existe' }] })
        .expect(400);
      await api
        .post('/posts')
        .send({
          brandId,
          targets: [{ socialAccountId: ig }, { socialAccountId: ig }],
        })
        .expect(400);
    });

    it('rechaza imagenes inexistentes o repetidas, y mas de 10', async () => {
      await api
        .post('/posts')
        .send({ brandId, mediaIds: ['no-existe'] })
        .expect(400);
      const a = await seedMedia(300, 300);
      await api
        .post('/posts')
        .send({ brandId, mediaIds: [a, a] })
        .expect(400);
      const many: string[] = [];
      for (let i = 0; i < 11; i++) many.push(await seedMedia(200, 200));
      const res = await api
        .post('/posts')
        .send({ brandId, mediaIds: many })
        .expect(400);
      expect(res.body.message).toContain('10');
      expect(processedKeys()).toHaveLength(0);
    });

    it('acepta un carrusel de 10 imagenes', async () => {
      const ids: string[] = [];
      for (let i = 0; i < 10; i++) ids.push(await seedMedia(400, 300));
      const res = await api
        .post('/posts')
        .send({ brandId, mediaIds: ids })
        .expect(201);
      expect(res.body.media).toHaveLength(10);
      expect(processedKeys()).toHaveLength(10);
    });

    it('el texto para Instagram no puede superar 2200 caracteres; Facebook si', async () => {
      const long = 'a'.repeat(2201);
      await api
        .post('/posts')
        .send({ brandId, caption: long, targets: [{ socialAccountId: ig }] })
        .expect(400);
      await api
        .post('/posts')
        .send({ brandId, caption: long, targets: [{ socialAccountId: fb }] })
        .expect(201);
      // 2200 justos pasan; el override de la cuenta manda sobre el texto base
      await api
        .post('/posts')
        .send({
          brandId,
          caption: 'a'.repeat(2200),
          targets: [{ socialAccountId: ig }],
        })
        .expect(201);
      await api
        .post('/posts')
        .send({
          brandId,
          caption: 'corto',
          targets: [{ socialAccountId: ig, captionOverride: long }],
        })
        .expect(400);
      await api
        .post('/posts')
        .send({
          brandId,
          caption: long,
          targets: [{ socialAccountId: ig, captionOverride: 'corto' }],
        })
        .expect(201);
    });

    it('cuenta los caracteres como Instagram (emojis cuentan como 1)', async () => {
      await api
        .post('/posts')
        .send({
          brandId,
          caption: '😀'.repeat(2200),
          targets: [{ socialAccountId: ig }],
        })
        .expect(201);
    });

    it('valida el body: campos extra, enums, fechas', async () => {
      await api
        .post('/posts')
        .send({ brandId, status: 'PUBLISHED' })
        .expect(400);
      await api
        .post('/posts')
        .send({ brandId, aspectRatio: 'CUADRADO' })
        .expect(400);
      await api
        .post('/posts')
        .send({ brandId, scheduledAt: 'manana' })
        .expect(400);
      await api.post('/posts').send({}).expect(400);
    });

    it('si R2 falla al procesar no queda nada a medias', async () => {
      const a = await seedMedia();
      const b = await seedMedia();
      puts = 0;
      failPutAfter = 1;
      await api
        .post('/posts')
        .send({ brandId, mediaIds: [a, b] })
        .expect(503);
      expect(processedKeys()).toHaveLength(0);
      expect(await prisma.post.count()).toBe(0);
    });
  });

  describe('editar', () => {
    it('cambiar solo el texto no regenera las imagenes', async () => {
      const post = await createDraft();
      const before = processedKeys();
      const res = await api
        .patch(`/posts/${post.id}`)
        .send({ caption: 'Nuevo texto' })
        .expect(200);
      expect(res.body.caption).toBe('Nuevo texto');
      expect(processedKeys()).toEqual(before);
      expect(res.body.media[0].publicUrl).toBe(post.media[0].publicUrl);
    });

    it('cambiar proporcion o modo regenera y borra la version vieja', async () => {
      const post = await createDraft();
      const oldKeys = processedKeys();
      const res = await api
        .patch(`/posts/${post.id}`)
        .send({ aspectRatio: 'LANDSCAPE', fitMode: 'PAD' })
        .expect(200);
      expect(res.body.media[0].width / res.body.media[0].height).toBeCloseTo(
        1.91,
        1,
      );
      const now = processedKeys();
      expect(now).toHaveLength(1);
      expect(now[0]).not.toBe(oldKeys[0]);
      expect(bucket.has(oldKeys[0])).toBe(false);
    });

    it('cambiar imagenes (orden o conjunto) regenera', async () => {
      const post = await createDraft();
      const extra = await seedMedia(500, 500);
      const res = await api
        .patch(`/posts/${post.id}`)
        .send({ mediaIds: [extra, post.media[0].mediaId] })
        .expect(200);
      expect(res.body.media).toHaveLength(2);
      expect(res.body.media[0].mediaId).toBe(extra);
      expect(processedKeys()).toHaveLength(2);
      const rows = await prisma.postMedia.findMany({
        where: { postId: post.id },
      });
      expect(rows.map((r) => r.position).sort((a, b) => a - b)).toEqual([0, 1]);
    });

    it('reemplaza los destinos: quita, agrega y actualiza el texto propio', async () => {
      const post = await createDraft();
      const res = await api
        .patch(`/posts/${post.id}`)
        .send({
          targets: [{ socialAccountId: ig, captionOverride: 'Solo IG' }],
        })
        .expect(200);
      expect(res.body.targets).toHaveLength(1);
      expect(res.body.targets[0]).toMatchObject({
        socialAccountId: ig,
        captionOverride: 'Solo IG',
        network: 'INSTAGRAM',
      });
      const back = await api
        .patch(`/posts/${post.id}`)
        .send({ targets: [{ socialAccountId: fb }, { socialAccountId: ig }] })
        .expect(200);
      expect(back.body.targets).toHaveLength(2);
      const igTarget = back.body.targets.find(
        (t: { socialAccountId: string }) => t.socialAccountId === ig,
      );
      expect(igTarget.captionOverride).toBeNull();
    });

    it('un override vacio vuelve al texto base', async () => {
      const post = await createDraft();
      const res = await api
        .patch(`/posts/${post.id}`)
        .send({ targets: [{ socialAccountId: fb, captionOverride: '   ' }] })
        .expect(200);
      expect(res.body.targets[0].captionOverride).toBeNull();
    });

    it('valida igual que al crear (texto largo, cuenta ajena)', async () => {
      const post = await createDraft();
      await api
        .patch(`/posts/${post.id}`)
        .send({ caption: 'a'.repeat(2201) })
        .expect(400);
      await api
        .patch(`/posts/${post.id}`)
        .send({ brandId: 'otra' })
        .expect(400);
      await api.patch('/posts/no-existe').send({ caption: 'x' }).expect(404);
    });

    it('un borrador acepta fecha tentativa, incluso borrarla', async () => {
      const post = await createDraft();
      const at = hours(5);
      const set = await api
        .patch(`/posts/${post.id}`)
        .send({ scheduledAt: at })
        .expect(200);
      expect(new Date(set.body.scheduledAt).toISOString()).toBe(at);
      expect(set.body.status).toBe('DRAFT');
      const cleared = await api
        .patch(`/posts/${post.id}`)
        .send({ scheduledAt: null })
        .expect(200);
      expect(cleared.body.scheduledAt).toBeNull();
    });

    it('si el publicador ya tomo un destino, el post no se edita aunque siga programado', async () => {
      const post = await createDraft();
      await api
        .post(`/posts/${post.id}/schedule`)
        .send({ scheduledAt: hours(1) });
      await prisma.postTarget.update({
        where: { id: post.targets[0].id },
        data: { status: 'QUEUED' },
      });
      await api
        .patch(`/posts/${post.id}`)
        .send({ targets: [{ socialAccountId: ig }] })
        .expect(409);
      await api
        .patch(`/posts/${post.id}`)
        .send({ aspectRatio: 'PORTRAIT' })
        .expect(409);
      const after = await api.get(`/posts/${post.id}`).expect(200);
      expect(after.body.targets).toHaveLength(2);
      expect(after.body.caption).toBe('Hola mundo');
      expect(processedKeys()).toHaveLength(1);
    });

    it('un post publicando, publicado, fallido o cancelado no se edita (409)', async () => {
      for (const status of [
        'PUBLISHING',
        'PUBLISHED',
        'PARTIAL',
        'FAILED',
        'CANCELLED',
      ] as const) {
        const post = await createDraft();
        await prisma.post.update({ where: { id: post.id }, data: { status } });
        await api.patch(`/posts/${post.id}`).send({ caption: 'x' }).expect(409);
      }
    });
  });

  describe('programar', () => {
    it('programa un borrador completo', async () => {
      const post = await createDraft();
      const at = hours(3);
      const res = await api
        .post(`/posts/${post.id}/schedule`)
        .send({ scheduledAt: at })
        .expect(200);
      expect(res.body.status).toBe('SCHEDULED');
      expect(new Date(res.body.scheduledAt).toISOString()).toBe(at);
    });

    it('usa la fecha tentativa del borrador si no se manda otra', async () => {
      const at = hours(4);
      const post = await createDraft({ scheduledAt: at });
      const res = await api
        .post(`/posts/${post.id}/schedule`)
        .send({})
        .expect(200);
      expect(new Date(res.body.scheduledAt).toISOString()).toBe(at);
    });

    it('rechaza fecha pasada, sin fecha, sin imagenes o sin cuentas', async () => {
      const post = await createDraft();
      await api
        .post(`/posts/${post.id}/schedule`)
        .send({ scheduledAt: new Date(Date.now() - 1000).toISOString() })
        .expect(400);
      await api.post(`/posts/${post.id}/schedule`).send({}).expect(400);

      const noMedia = await createDraft({ mediaIds: [] });
      await api
        .post(`/posts/${noMedia.id}/schedule`)
        .send({ scheduledAt: hours(1) })
        .expect(400);
      const noTargets = await createDraft({ targets: [] });
      await api
        .post(`/posts/${noTargets.id}/schedule`)
        .send({ scheduledAt: hours(1) })
        .expect(400);
      expect((await api.get(`/posts/${post.id}`)).body.status).toBe('DRAFT');
    });

    it('reprograma un post programado (schedule y PATCH) y valida que sea futura', async () => {
      const post = await createDraft();
      await api
        .post(`/posts/${post.id}/schedule`)
        .send({ scheduledAt: hours(2) })
        .expect(200);
      const later = hours(10);
      const res = await api
        .patch(`/posts/${post.id}`)
        .send({ scheduledAt: later })
        .expect(200);
      expect(new Date(res.body.scheduledAt).toISOString()).toBe(later);
      expect(res.body.status).toBe('SCHEDULED');
      await api
        .patch(`/posts/${post.id}`)
        .send({ scheduledAt: new Date(Date.now() - 5000).toISOString() })
        .expect(400);
      await api
        .patch(`/posts/${post.id}`)
        .send({ scheduledAt: null })
        .expect(400);
      const again = hours(20);
      const r2 = await api
        .post(`/posts/${post.id}/schedule`)
        .send({ scheduledAt: again })
        .expect(200);
      expect(new Date(r2.body.scheduledAt).toISOString()).toBe(again);
    });

    it('un post programado no puede quedar sin imagenes ni cuentas', async () => {
      const post = await createDraft();
      await api
        .post(`/posts/${post.id}/schedule`)
        .send({ scheduledAt: hours(2) })
        .expect(200);
      await api.patch(`/posts/${post.id}`).send({ mediaIds: [] }).expect(400);
      await api.patch(`/posts/${post.id}`).send({ targets: [] }).expect(400);
      expect((await api.get(`/posts/${post.id}`)).body.media).toHaveLength(1);
    });

    it('publicar ahora deja el post programado para ya', async () => {
      const post = await createDraft();
      const before = Date.now();
      const res = await api.post(`/posts/${post.id}/publish-now`).expect(200);
      expect(res.body.status).toBe('SCHEDULED');
      expect(new Date(res.body.scheduledAt).getTime()).toBeGreaterThanOrEqual(
        before - 1000,
      );
      expect(new Date(res.body.scheduledAt).getTime()).toBeLessThanOrEqual(
        Date.now() + 1000,
      );
      await api.post(`/posts/${post.id}/publish-now`).expect(200);
    });

    it('publicar ahora exige un post completo y editable', async () => {
      const empty = await createDraft({ mediaIds: [] });
      await api.post(`/posts/${empty.id}/publish-now`).expect(400);
      const done = await createDraft();
      await prisma.post.update({
        where: { id: done.id },
        data: { status: 'PUBLISHED' },
      });
      await api.post(`/posts/${done.id}/publish-now`).expect(409);
      await api
        .post(`/posts/${done.id}/schedule`)
        .send({ scheduledAt: hours(1) })
        .expect(409);
    });
  });

  describe('cancelar y eliminar', () => {
    it('cancela un borrador, un programado y uno con reintentos pendientes', async () => {
      const draft = await createDraft();
      expect(
        (await api.post(`/posts/${draft.id}/cancel`).expect(200)).body.status,
      ).toBe('CANCELLED');

      const scheduled = await createDraft();
      await api
        .post(`/posts/${scheduled.id}/schedule`)
        .send({ scheduledAt: hours(1) });
      expect(
        (await api.post(`/posts/${scheduled.id}/cancel`).expect(200)).body
          .status,
      ).toBe('CANCELLED');

      const retrying = await createDraft();
      await prisma.post.update({
        where: { id: retrying.id },
        data: { status: 'PUBLISHING' },
      });
      await prisma.postTarget.updateMany({
        where: { postId: retrying.id },
        data: { status: 'PENDING', attempts: 1 },
      });
      await api.post(`/posts/${retrying.id}/cancel`).expect(200);
    });

    it('no cancela lo que se esta publicando ni lo ya terminado', async () => {
      const inFlight = await createDraft();
      await prisma.post.update({
        where: { id: inFlight.id },
        data: { status: 'PUBLISHING' },
      });
      await prisma.postTarget.update({
        where: { id: inFlight.targets[0].id },
        data: { status: 'PUBLISHING' },
      });
      await api.post(`/posts/${inFlight.id}/cancel`).expect(409);

      for (const status of [
        'PUBLISHED',
        'PARTIAL',
        'FAILED',
        'CANCELLED',
      ] as const) {
        const p = await createDraft();
        await prisma.post.update({ where: { id: p.id }, data: { status } });
        await api.post(`/posts/${p.id}/cancel`).expect(409);
      }
    });

    it('un post cancelado ya no se edita ni se programa', async () => {
      const post = await createDraft();
      await api.post(`/posts/${post.id}/cancel`).expect(200);
      await api.patch(`/posts/${post.id}`).send({ caption: 'x' }).expect(409);
      await api
        .post(`/posts/${post.id}/schedule`)
        .send({ scheduledAt: hours(1) })
        .expect(409);
    });

    it('elimina borradores y cancelados (y sus imagenes procesadas); no lo demas', async () => {
      const draft = await createDraft();
      expect(processedKeys()).toHaveLength(1);
      await api.delete(`/posts/${draft.id}`).expect(204);
      expect(processedKeys()).toHaveLength(0);
      await api.get(`/posts/${draft.id}`).expect(404);
      expect(await prisma.postTarget.count()).toBe(0);
      expect(await prisma.postMedia.count()).toBe(0);

      const cancelled = await createDraft();
      await api.post(`/posts/${cancelled.id}/cancel`);
      await api.delete(`/posts/${cancelled.id}`).expect(204);

      const scheduled = await createDraft();
      await api
        .post(`/posts/${scheduled.id}/schedule`)
        .send({ scheduledAt: hours(1) });
      await api.delete(`/posts/${scheduled.id}`).expect(409);
      await api.delete('/posts/no-existe').expect(404);
    });
  });

  describe('reintentar y estado derivado', () => {
    it('reintenta solo los destinos fallidos y deja el post en curso', async () => {
      const post = await createDraft();
      await prisma.post.update({
        where: { id: post.id },
        data: { status: 'PARTIAL' },
      });
      const [fbTarget, igTarget] = post.targets;
      await prisma.postTarget.update({
        where: { id: fbTarget.id },
        data: {
          status: 'PUBLISHED',
          attempts: 1,
          externalPostId: 'fb_1',
          permalink: 'https://fb/1',
        },
      });
      await prisma.postTarget.update({
        where: { id: igTarget.id },
        data: {
          status: 'FAILED',
          attempts: 4,
          lastError: 'boom',
          lastErrorCode: '100',
        },
      });

      const res = await api.post(`/posts/${post.id}/retry`).expect(200);
      expect(res.body.status).toBe('PUBLISHING');
      const targets = res.body.targets as {
        id: string;
        status: string;
        attempts: number;
        lastError: string | null;
        permalink: string | null;
      }[];
      const retried = targets.find((t) => t.id === igTarget.id)!;
      expect(retried).toMatchObject({
        status: 'PENDING',
        attempts: 0,
        lastError: null,
      });
      const kept = targets.find((t) => t.id === fbTarget.id)!;
      expect(kept).toMatchObject({
        status: 'PUBLISHED',
        permalink: 'https://fb/1',
      });
      const row = await prisma.postTarget.findUniqueOrThrow({
        where: { id: igTarget.id },
      });
      expect(row.nextAttemptAt!.getTime()).toBeLessThanOrEqual(
        Date.now() + 1000,
      );
    });

    it('reintentar un FAILED completo lo deja en curso; en otros estados responde 409', async () => {
      const failed = await createDraft();
      await prisma.post.update({
        where: { id: failed.id },
        data: { status: 'FAILED' },
      });
      await prisma.postTarget.updateMany({
        where: { postId: failed.id },
        data: { status: 'FAILED', attempts: 4 },
      });
      const res = await api.post(`/posts/${failed.id}/retry`).expect(200);
      expect(
        res.body.targets.every(
          (t: { status: string }) => t.status === 'PENDING',
        ),
      ).toBe(true);
      // Sin intentos previos ya reseteados y sin publicados: queda programado de nuevo
      expect(res.body.status).toBe('SCHEDULED');

      for (const status of [
        'DRAFT',
        'SCHEDULED',
        'PUBLISHING',
        'PUBLISHED',
        'CANCELLED',
      ] as const) {
        const p = await createDraft();
        await prisma.post.update({ where: { id: p.id }, data: { status } });
        await api.post(`/posts/${p.id}/retry`).expect(409);
      }
    });

    it('recomputeStatus deriva el estado de los destinos y no toca borradores', async () => {
      const post = await createDraft();
      await api
        .post(`/posts/${post.id}/schedule`)
        .send({ scheduledAt: hours(1) });
      const [a, b] = post.targets;

      await prisma.postTarget.update({
        where: { id: a.id },
        data: { status: 'QUEUED' },
      });
      expect(await posts.recomputeStatus(post.id)).toBe('PUBLISHING');
      await prisma.postTarget.update({
        where: { id: a.id },
        data: { status: 'PUBLISHED' },
      });
      await prisma.postTarget.update({
        where: { id: b.id },
        data: { status: 'FAILED', attempts: 4 },
      });
      expect(await posts.recomputeStatus(post.id)).toBe('PARTIAL');
      await prisma.postTarget.update({
        where: { id: b.id },
        data: { status: 'PUBLISHED' },
      });
      expect(await posts.recomputeStatus(post.id)).toBe('PUBLISHED');
      expect((await api.get(`/posts/${post.id}`)).body.status).toBe(
        'PUBLISHED',
      );

      const draft = await createDraft();
      await prisma.postTarget.updateMany({
        where: { postId: draft.id },
        data: { status: 'PUBLISHED' },
      });
      expect(await posts.recomputeStatus(draft.id)).toBe('DRAFT');
    });
  });

  describe('detalle y calendario', () => {
    it('el detalle trae marca, imagenes, destinos con cuenta y ultimos intentos, sin datos internos', async () => {
      const post = await createDraft();
      await prisma.publishAttempt.create({
        data: {
          postTargetId: post.targets[0].id,
          startedAt: new Date(),
          finishedAt: new Date(),
          ok: false,
          errorCode: '190',
          errorMessage: 'token',
          responseSnippet: 'secreto-interno',
        },
      });
      const res = await api.get(`/posts/${post.id}`).expect(200);
      expect(res.body.brand).toMatchObject({
        name: 'Kalendox',
        color: '#112233',
      });
      expect(res.body.media[0].filename).toMatch(/foto-/);
      const target = res.body.targets.find(
        (t: { socialAccountId: string }) => t.socialAccountId === fb,
      );
      expect(target).toMatchObject({
        network: 'FACEBOOK',
        accountName: 'Kalendox FB',
      });
      expect(target.attemptLog).toHaveLength(1);
      const json = JSON.stringify(res.body);
      expect(json).not.toContain('secreto-interno');
      expect(json).not.toMatch(
        /processedKey|originalKey|pageTokenEnc|igContainerId/,
      );
      await api.get('/posts/no-existe').expect(404);
    });

    it('lista por rango, marca y estado con la forma liviana del calendario', async () => {
      const inRange = await createDraft();
      await api
        .post(`/posts/${inRange.id}/schedule`)
        .send({ scheduledAt: hours(24) });
      const outside = await createDraft();
      await api
        .post(`/posts/${outside.id}/schedule`)
        .send({ scheduledAt: hours(24 * 40) });
      const draft = await createDraft();

      const from = hours(0);
      const to = hours(24 * 7);
      const res = await api.get(`/posts?from=${from}&to=${to}`).expect(200);
      expect(res.body.map((p: { id: string }) => p.id)).toEqual([inRange.id]);
      expect(res.body[0]).toMatchObject({
        status: 'SCHEDULED',
        brand: { name: 'Kalendox', color: '#112233' },
        mediaCount: 1,
      });
      expect(res.body[0].thumbnailUrl).toContain('processed/');
      expect(res.body[0].targets).toEqual(
        expect.arrayContaining([
          {
            network: 'FACEBOOK',
            accountName: 'Kalendox FB',
            status: 'PENDING',
          },
        ]),
      );

      const drafts = await api.get('/posts?status=DRAFT').expect(200);
      expect(drafts.body.map((p: { id: string }) => p.id)).toEqual([draft.id]);

      const other = await prisma.brand.create({
        data: { name: 'Otra', slug: 'otra' },
      });
      const none = await api
        .get(`/posts?from=${from}&to=${to}&brandId=${other.id}`)
        .expect(200);
      expect(none.body).toEqual([]);
    });

    it('el rango incluye el limite inferior y excluye el superior', async () => {
      const post = await createDraft();
      const at = new Date(Date.now() + 3_600_000);
      await api
        .post(`/posts/${post.id}/schedule`)
        .send({ scheduledAt: at.toISOString() });
      const hit = await api
        .get(
          `/posts?from=${at.toISOString()}&to=${new Date(at.getTime() + 1000).toISOString()}`,
        )
        .expect(200);
      expect(hit.body).toHaveLength(1);
      const miss = await api
        .get(
          `/posts?from=${new Date(at.getTime() - 1000).toISOString()}&to=${at.toISOString()}`,
        )
        .expect(200);
      expect(miss.body).toHaveLength(0);
    });

    it('valida los parametros del listado', async () => {
      await api.get('/posts').expect(400);
      await api.get(`/posts?from=${hours(0)}`).expect(400);
      await api.get(`/posts?from=${hours(5)}&to=${hours(1)}`).expect(400);
      await api
        .get(`/posts?from=${hours(0)}&to=${hours(24 * 101)}`)
        .expect(400);
      await api.get('/posts?status=INVENTADO').expect(400);
      await api.get('/posts?from=ayer&to=hoy').expect(400);
    });
  });
});
