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
import { MediaController } from '../src/modules/media/media.controller.js';
import { MediaService } from '../src/modules/media/media.service.js';
import { PrismaModule } from '../src/modules/prisma/prisma.module.js';
import { PrismaService } from '../src/modules/prisma/prisma.service.js';
import { StorageException } from '../src/modules/storage/storage.exceptions.js';
import { StorageService } from '../src/modules/storage/storage.service.js';
import { resetDatabase, testDatabaseUrl } from './helpers/test-db.js';
import { makeTestEnv, TEST_PASSWORD } from './helpers/test-env.js';

describe('Media (e2e, DB de test, R2 en memoria)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookie: string;
  const env: Env = makeTestEnv({ DATABASE_URL: testDatabaseUrl() });

  // R2 falso: un Map en memoria. Nunca sale a internet.
  const bucket = new Map<string, { body: Buffer; type: string }>();
  let failPutOnCall = 0;
  let putCalls = 0;
  const fakeStorage = {
    put: (key: string, body: Buffer, type: string) => {
      putCalls++;
      if (failPutOnCall && putCalls === failPutOnCall) {
        return Promise.reject(new StorageException('guardar'));
      }
      bucket.set(key, { body, type });
      return Promise.resolve();
    },
    get: (key: string) => {
      const item = bucket.get(key);
      return item
        ? Promise.resolve(item.body)
        : Promise.reject(new StorageException('leer'));
    },
    delete: (key: string) => {
      bucket.delete(key);
      return Promise.resolve();
    },
    publicUrl: (key: string) => `https://media.example.com/${key}`,
  };

  const image = (
    width = 800,
    height = 600,
    format: 'jpeg' | 'png' | 'webp' = 'jpeg',
  ) =>
    sharp({
      create: { width, height, channels: 3, background: '#3366cc' },
    })
      [format]()
      .toBuffer();

  beforeAll(async () => {
    @Global()
    @Module({
      providers: [{ provide: ENV, useValue: env }],
      exports: [ENV],
    })
    class TestConfigModule {}

    @Module({
      controllers: [MediaController],
      providers: [
        MediaService,
        ImageProcessor,
        { provide: StorageService, useValue: fakeStorage },
      ],
    })
    class TestMediaModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [TestConfigModule, PrismaModule, AuthModule, TestMediaModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app as NestExpressApplication, env);
    await app.init();
    prisma = app.get(PrismaService);

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
    bucket.clear();
    failPutOnCall = 0;
    putCalls = 0;
  });

  const server = () => app.getHttpServer();
  const upload = () => request(server()).post('/media').set('Cookie', cookie);

  describe('autenticacion', () => {
    it('todas las rutas exigen sesion', async () => {
      await request(server()).post('/media').expect(401);
      await request(server()).get('/media/abc').expect(401);
      await request(server())
        .get('/media/abc/preview?aspectRatio=SQUARE&fitMode=CROP')
        .expect(401);
    });
  });

  describe('POST /media', () => {
    it('sube varias imagenes: guarda originales con key UUID y registra la fila', async () => {
      const res = await upload()
        .attach('files', await image(800, 600), 'foto uno.jpg')
        .attach('files', await image(500, 500, 'png'), 'logo.png')
        .attach('files', await image(300, 200, 'webp'), 'banner.webp')
        .expect(201);
      expect(res.body).toHaveLength(3);
      expect(res.body[0]).toMatchObject({
        filename: 'foto uno.jpg',
        width: 800,
        height: 600,
        mime: 'image/jpeg',
      });
      expect(res.body[1].mime).toBe('image/png');
      expect(res.body[2].mime).toBe('image/webp');
      expect(bucket.size).toBe(3);
      const rows = await prisma.media.findMany();
      expect(rows).toHaveLength(3);
      for (const row of rows) {
        expect(row.originalKey).toMatch(
          /^originals\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.(jpg|png|webp)$/,
        );
        expect(bucket.get(row.originalKey)!.body.length).toBe(row.sizeBytes);
      }
      expect(res.body[0].originalUrl).toMatch(
        /^https:\/\/media\.example\.com\/originals\//,
      );
    });

    it('la extension y el tipo salen del contenido, no del nombre', async () => {
      const res = await upload()
        .attach('files', await image(100, 100, 'png'), 'engano.jpg')
        .expect(201);
      expect(res.body[0].mime).toBe('image/png');
      const row = await prisma.media.findFirstOrThrow();
      expect(row.originalKey.endsWith('.png')).toBe(true);
    });

    it('un nombre con ruta se guarda solo como nombre y no influye en la key', async () => {
      const res = await upload()
        .attach('files', await image(100, 100), {
          filename: '../../secreto/foto.jpg',
        })
        .expect(201);
      expect(res.body[0].filename).toBe('foto.jpg');
      const row = await prisma.media.findFirstOrThrow();
      expect(row.originalKey).not.toContain('secreto');
    });

    it('sin archivos responde 400', async () => {
      await upload().expect(400);
    });

    it('rechaza archivos que no son imagen (texto con extension .jpg) con 400', async () => {
      const res = await upload()
        .attach('files', Buffer.from('hola, no soy una imagen'), 'falso.jpg')
        .expect(400);
      expect(res.body.message).toContain('falso.jpg');
    });

    it('rechaza GIF y explica el caso HEIC', async () => {
      const gif = await sharp({
        create: { width: 8, height: 8, channels: 3, background: '#fff' },
      })
        .gif()
        .toBuffer();
      await upload().attach('files', gif, 'a.gif').expect(400);
      const heic = Buffer.concat([
        Buffer.from([0, 0, 0, 24]),
        Buffer.from('ftypheic'),
        Buffer.alloc(64),
      ]);
      const res = await upload()
        .attach('files', heic, 'iphone.heic')
        .expect(400);
      expect(res.body.message).toMatch(/HEIC|dañado|soportado/);
    });

    it('todo o nada: una imagen invalida impide guardar las validas', async () => {
      await upload()
        .attach('files', await image(), 'ok.jpg')
        .attach('files', Buffer.from('basura'), 'mala.jpg')
        .expect(400);
      expect(bucket.size).toBe(0);
      expect(await prisma.media.count()).toBe(0);
    });

    it('si R2 falla a mitad, borra lo ya subido y responde 503 sin filas', async () => {
      failPutOnCall = 2;
      await upload()
        .attach('files', await image(), 'a.jpg')
        .attach('files', await image(), 'b.jpg')
        .expect(503);
      expect(bucket.size).toBe(0);
      expect(await prisma.media.count()).toBe(0);
    });

    it('mas de 10 archivos responde 400', async () => {
      const img = await image(50, 50);
      let req = upload();
      for (let i = 0; i < 11; i++) req = req.attach('files', img, `f${i}.jpg`);
      await req.expect(400);
      expect(bucket.size).toBe(0);
    });

    it('un archivo de mas de 20 MB responde 413', async () => {
      await upload()
        .attach('files', Buffer.alloc(20 * 1024 * 1024 + 1024), 'enorme.jpg')
        .expect(413);
      expect(bucket.size).toBe(0);
    });

    it('un campo con otro nombre no se acepta', async () => {
      await upload()
        .attach('archivo', await image(), 'a.jpg')
        .expect(400);
    });
  });

  describe('GET /media/:id', () => {
    it('devuelve los datos de la imagen y 404 si no existe', async () => {
      const [created] = (
        await upload()
          .attach('files', await image(640, 480), 'a.jpg')
          .expect(201)
      ).body as { id: string }[];
      const res = await request(server())
        .get(`/media/${created.id}`)
        .set('Cookie', cookie)
        .expect(200);
      expect(res.body).toMatchObject({
        id: created.id,
        width: 640,
        height: 480,
      });
      expect(JSON.stringify(res.body)).not.toContain('originalKey');
      await request(server())
        .get('/media/no-existe')
        .set('Cookie', cookie)
        .expect(404);
    });
  });

  describe('GET /media/:id/preview', () => {
    const preview = (id: string, query: string) =>
      request(server())
        .get(`/media/${id}/preview?${query}`)
        .set('Cookie', cookie)
        .buffer(true)
        .parse((res, cb) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => cb(null, Buffer.concat(chunks)));
        });

    it.each([
      ['SQUARE', 1, 1],
      ['PORTRAIT', 4, 5],
      ['LANDSCAPE', 1.91, 1],
    ])(
      'devuelve un JPEG %s con la proporcion correcta',
      async (aspect, w, h) => {
        const [created] = (
          await upload()
            .attach('files', await image(1600, 1200), 'a.jpg')
            .expect(201)
        ).body as { id: string }[];
        const res = await preview(
          created.id,
          `aspectRatio=${aspect}&fitMode=CROP`,
        ).expect(200);
        expect(res.headers['content-type']).toContain('image/jpeg');
        expect(res.headers['cache-control']).toContain('private');
        const meta = await sharp(res.body as Buffer).metadata();
        expect(meta.format).toBe('jpeg');
        expect(meta.width! / meta.height!).toBeCloseTo(w / h, 2);
        expect(meta.width).toBeLessThanOrEqual(1440);
      },
    );

    it('PAD acepta color de relleno', async () => {
      const [created] = (
        await upload()
          .attach('files', await image(1000, 400), 'a.jpg')
          .expect(201)
      ).body as { id: string }[];
      const res = await preview(
        created.id,
        'aspectRatio=SQUARE&fitMode=PAD&padColor=%2300ff00',
      ).expect(200);
      const { data, info } = await sharp(res.body as Buffer)
        .raw()
        .toBuffer({ resolveWithObject: true });
      expect(info.width).toBe(info.height);
      // Esquina superior izquierda: relleno verde
      expect(data[1]).toBeGreaterThan(200);
      expect(data[0]).toBeLessThan(60);
    });

    it('valida los parametros (400) y la existencia (404)', async () => {
      const [created] = (
        await upload()
          .attach('files', await image(), 'a.jpg')
          .expect(201)
      ).body as { id: string }[];
      await preview(created.id, 'aspectRatio=CUADRADO&fitMode=CROP').expect(
        400,
      );
      await preview(created.id, 'aspectRatio=SQUARE').expect(400);
      await preview(
        created.id,
        'aspectRatio=SQUARE&fitMode=CROP&padColor=rojo',
      ).expect(400);
      await preview(created.id, 'aspectRatio=SQUARE&fitMode=CROP&x=1').expect(
        400,
      );
      await preview('no-existe', 'aspectRatio=SQUARE&fitMode=CROP').expect(404);
    });

    it('si el original no esta en R2 responde 503', async () => {
      const [created] = (
        await upload()
          .attach('files', await image(), 'a.jpg')
          .expect(201)
      ).body as { id: string }[];
      bucket.clear();
      await preview(created.id, 'aspectRatio=SQUARE&fitMode=CROP').expect(503);
    });
  });
});
