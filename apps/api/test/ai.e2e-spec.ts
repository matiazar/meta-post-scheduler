import { Global, Module } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import sharp from 'sharp';
import request from 'supertest';
import { vi } from 'vitest';
import { configureApp } from '../src/app.setup.js';
import { ENV } from '../src/config/config.module.js';
import type { Env } from '../src/config/env.js';
import {
  AiClient,
  ANTHROPIC_CLIENT,
  type AnthropicLike,
} from '../src/modules/ai/ai.client.js';
import { AiController } from '../src/modules/ai/ai.controller.js';
import { AiService } from '../src/modules/ai/ai.service.js';
import { SESSION_COOKIE } from '../src/modules/auth/auth.constants.js';
import { AuthModule } from '../src/modules/auth/auth.module.js';
import { BrandsModule } from '../src/modules/brands/brands.module.js';
import { ImageProcessor } from '../src/modules/media/image-processor.js';
import { MediaService } from '../src/modules/media/media.service.js';
import { PrismaModule } from '../src/modules/prisma/prisma.module.js';
import { PrismaService } from '../src/modules/prisma/prisma.service.js';
import { StorageService } from '../src/modules/storage/storage.service.js';
import { resetDatabase, testDatabaseUrl } from './helpers/test-db.js';
import { makeTestEnv, TEST_PASSWORD } from './helpers/test-env.js';

describe('IA: sugerir texto (e2e, DB de test, modelo y R2 simulados)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookie: string;
  const env: Env = makeTestEnv({ DATABASE_URL: testDatabaseUrl() });

  // R2 falso en memoria y modelo falso: nunca salen a internet
  const bucket = new Map<string, Buffer>();
  const fakeStorage = {
    get: (key: string) => {
      const body = bucket.get(key);
      return body ? Promise.resolve(body) : Promise.reject(new Error('falta'));
    },
    publicUrl: (key: string) => `https://media.example.com/${key}`,
  };
  const create = vi.fn();
  const fakeSdk = { messages: { create } } as unknown as AnthropicLike;

  const reply = (variants: unknown) => ({
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: JSON.stringify({ variants }) }],
  });

  beforeAll(async () => {
    @Global()
    @Module({
      providers: [{ provide: ENV, useValue: env }],
      exports: [ENV],
    })
    class TestConfigModule {}

    @Module({
      imports: [BrandsModule],
      controllers: [AiController],
      providers: [
        AiService,
        AiClient,
        MediaService,
        ImageProcessor,
        { provide: ANTHROPIC_CLIENT, useValue: fakeSdk },
        { provide: StorageService, useValue: fakeStorage },
      ],
    })
    class TestAiModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [TestConfigModule, PrismaModule, AuthModule, TestAiModule],
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
    create.mockReset();
  });

  const server = () => app.getHttpServer();
  const suggest = (body: unknown) =>
    request(server()).post('/ai/suggest-copy').set('Cookie', cookie).send(body as object);

  async function seed() {
    const brand = await prisma.brand.create({
      data: {
        name: 'Kalendox',
        slug: 'kalendox',
        description: 'Software de turnos para estudios de yoga',
        tone: 'cercano, sin emojis',
        defaultHashtags: '#kalendox',
      },
    });
    // Foto grande: tiene que llegar achicada al modelo
    const buffer = await sharp({
      create: { width: 3200, height: 2000, channels: 3, background: '#3366cc' },
    })
      .jpeg()
      .toBuffer();
    const key = 'originals/2026/11/foto.jpg';
    bucket.set(key, buffer);
    const media = await prisma.media.create({
      data: {
        originalKey: key,
        originalFilename: 'foto.jpg',
        width: 3200,
        height: 2000,
        sizeBytes: buffer.length,
        mime: 'image/jpeg',
      },
    });
    return { brand, media };
  }

  it('exige sesion', async () => {
    await request(server()).post('/ai/suggest-copy').send({}).expect(401);
  });

  it('valida el pedido: marca, al menos una imagen y red conocida', async () => {
    await suggest({ mediaIds: ['m1'] }).expect(400);
    await suggest({ brandId: 'b1', mediaIds: [] }).expect(400);
    await suggest({ brandId: 'b1', mediaIds: ['m1'], network: 'TIKTOK' }).expect(
      400,
    );
    await suggest({
      brandId: 'b1',
      mediaIds: ['m1'],
      hint: 'x'.repeat(301),
    }).expect(400);
    expect(create).not.toHaveBeenCalled();
  });

  it('marca o imagen inexistente: 404 sin llamar al modelo', async () => {
    const { brand } = await seed();
    await suggest({ brandId: 'nope', mediaIds: ['x'] }).expect(404);
    await suggest({ brandId: brand.id, mediaIds: ['nope'] }).expect(404);
    expect(create).not.toHaveBeenCalled();
  });

  it('lee la imagen, usa el contexto de la marca y devuelve variantes limpias', async () => {
    const { brand, media } = await seed();
    create.mockResolvedValue(
      reply([
        { text: 'Tus turnos, ordenados.', hashtags: ['#Kalendox', 'agenda', 'yoga'] },
        { text: 'Menos mensajes, más clases.', hashtags: ['gestión'] },
      ]),
    );

    const res = await suggest({
      brandId: brand.id,
      mediaIds: [media.id],
      network: 'BOTH',
      hint: 'promo de abril',
    }).expect(201);

    expect(res.body.variants).toEqual([
      // #Kalendox es un hashtag fijo de la marca: no se repite
      { text: 'Tus turnos, ordenados.', hashtags: ['agenda', 'yoga'] },
      { text: 'Menos mensajes, más clases.', hashtags: ['gestión'] },
    ]);

    const [body] = create.mock.calls[0];
    expect(body.system).toContain('community manager');
    const [imageBlock, textBlock] = body.messages[0].content;
    expect(textBlock.text).toContain('Marca: Kalendox');
    expect(textBlock.text).toContain('yoga');
    expect(textBlock.text).toContain('cercano, sin emojis');
    expect(textBlock.text).toContain('promo de abril');
    const sent = Buffer.from(imageBlock.source.data, 'base64');
    const meta = await sharp(sent).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBe(1568);
  });

  it('si el modelo rechaza el pedido responde 422 con un mensaje claro', async () => {
    const { brand, media } = await seed();
    create.mockResolvedValue({ stop_reason: 'refusal', content: [] });
    const res = await suggest({
      brandId: brand.id,
      mediaIds: [media.id],
    }).expect(422);
    expect(res.body.message).toContain('Escribilo a mano');
  });

  it('si el proveedor falla responde 502 sin detalles internos', async () => {
    const { brand, media } = await seed();
    create.mockRejectedValue(new Error('401 invalid x-api-key sk-ant-SECRET'));
    const res = await suggest({
      brandId: brand.id,
      mediaIds: [media.id],
    }).expect(502);
    expect(JSON.stringify(res.body)).not.toContain('SECRET');
  });
});
