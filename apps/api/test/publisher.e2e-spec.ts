import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ENV } from '../src/config/config.module.js';
import type { Env } from '../src/config/env.js';
import type { ErrorReporterService } from '../src/modules/errors/error-reporter.service.js';
import type { MailService } from '../src/modules/mail/mail.service.js';
import { MetaApiException } from '../src/modules/meta/meta.exceptions.js';
import type { MetaGraphClient } from '../src/modules/meta/meta-graph.client.js';
import type { MetaService } from '../src/modules/meta/meta.service.js';
import type { PostMediaService } from '../src/modules/posts/post-media.service.js';
import { PostsService } from '../src/modules/posts/posts.service.js';
import { PrismaModule } from '../src/modules/prisma/prisma.module.js';
import { PrismaService } from '../src/modules/prisma/prisma.service.js';
import { FacebookPublisher } from '../src/modules/publisher/facebook.publisher.js';
import { InstagramPublisher } from '../src/modules/publisher/instagram.publisher.js';
import { PublishService } from '../src/modules/publisher/publish.service.js';
import { ThreadsPublisher } from '../src/modules/publisher/threads.publisher.js';
import type { ThreadsGraphClient } from '../src/modules/meta/threads-graph.client.js';
import type { ThreadsService } from '../src/modules/threads/threads.service.js';
import { TickService } from '../src/modules/publisher/tick.service.js';
import { resetDatabase, testDatabaseUrl } from './helpers/test-db.js';
import { makeTestEnv } from './helpers/test-env.js';

type Handler = (params: Record<string, unknown>) => unknown;

const minutes = (n: number) => n * 60_000;

describe('Publicador (e2e, DB de test, Meta falso)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let publish: PublishService;
  let tick: TickService;
  let ig: InstagramPublisher;
  let threadsPub: ThreadsPublisher;
  const env: Env = makeTestEnv({ DATABASE_URL: testDatabaseUrl() });

  // Meta falso: nunca sale a internet
  const routes = new Map<string, Handler>();
  const calls: {
    method: string;
    path: string;
    params: Record<string, unknown>;
  }[] = [];
  const call = (
    method: string,
    path: string,
    params: Record<string, unknown>,
  ) => {
    calls.push({ method, path, params });
    const handler = routes.get(`${method} ${path}`);
    if (!handler)
      return Promise.reject(new Error(`ruta sin mock: ${method} ${path}`));
    try {
      return Promise.resolve(handler(params));
    } catch (error) {
      return Promise.reject(error);
    }
  };
  const fakeGraph = {
    get: (path: string, params: Record<string, unknown> = {}) =>
      call('GET', path, params),
    post: (path: string, params: Record<string, unknown> = {}) =>
      call('POST', path, params),
  } as unknown as MetaGraphClient;

  const connectionActive = { value: true };
  const markInvalid = vi.fn().mockResolvedValue(undefined);
  const fakeMeta = {
    hasActiveConnection: () => Promise.resolve(connectionActive.value),
    tokenForAccount: () => Promise.resolve('TOKEN-SECRETO'),
    markCurrentConnectionInvalid: markInvalid,
  } as unknown as MetaService;

  const threadsActive = { value: true };
  const threadsInvalid = vi.fn().mockResolvedValue(undefined);
  const fakeThreads = {
    hasActiveConnection: () => Promise.resolve(threadsActive.value),
    tokenForAccount: () => Promise.resolve('THREADS-TOKEN-SECRETO'),
    markInvalid: threadsInvalid,
  } as unknown as ThreadsService;

  const notifyAdmin = vi.fn().mockResolvedValue(undefined);
  const fakeMail = { notifyAdmin } as unknown as MailService;
  const report = vi.fn().mockResolvedValue(undefined);
  const fakeReporter = { report } as unknown as ErrorReporterService;

  const addBulk = vi.fn().mockResolvedValue([]);
  const fakeQueue = { addBulk } as never;

  beforeAll(async () => {
    @Global()
    @Module({
      providers: [{ provide: ENV, useValue: env }],
      exports: [ENV],
    })
    class TestConfigModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [TestConfigModule, PrismaModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const posts = new PostsService(prisma, {} as unknown as PostMediaService);
    const facebook = new FacebookPublisher(fakeGraph, fakeMeta);
    ig = new InstagramPublisher(fakeGraph, prisma, fakeMeta);
    ig.pollIntervalMs = 1;
    ig.pollTimeoutMs = 200;
    threadsPub = new ThreadsPublisher(
      fakeGraph as unknown as ThreadsGraphClient,
      prisma,
      fakeThreads,
    );
    threadsPub.pollIntervalMs = 1;
    threadsPub.pollTimeoutMs = 200;
    publish = new PublishService(
      prisma,
      posts,
      fakeMail,
      [facebook, ig, threadsPub],
      fakeReporter,
    );
    tick = new TickService(prisma, posts, publish, fakeQueue);
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await app.close();
  });

  let brandId: string;
  let fbAccount: string;
  let igAccount: string;
  let thAccount: string;

  beforeEach(async () => {
    await resetDatabase(prisma);
    routes.clear();
    calls.length = 0;
    connectionActive.value = true;
    threadsActive.value = true;
    vi.clearAllMocks();
    brandId = (
      await prisma.brand.create({
        data: { name: 'Kalendox', slug: 'kalendox', color: '#112233' },
      })
    ).id;
    fbAccount = (
      await prisma.socialAccount.create({
        data: {
          brandId,
          network: 'FACEBOOK',
          externalId: 'page-1',
          name: 'Kalendox FB',
        },
      })
    ).id;
    igAccount = (
      await prisma.socialAccount.create({
        data: {
          brandId,
          network: 'INSTAGRAM',
          externalId: 'ig-1',
          name: 'kalendox',
          pageId: 'page-1',
        },
      })
    ).id;
    thAccount = (
      await prisma.socialAccount.create({
        data: {
          brandId,
          network: 'THREADS',
          externalId: 'th-1',
          name: 'kalendox',
        },
      })
    ).id;
  });

  interface SeedOptions {
    accounts?: string[];
    images?: number;
    postStatus?: 'SCHEDULED' | 'DRAFT' | 'CANCELLED';
    scheduledAt?: Date;
    caption?: string;
    target?: Partial<{
      status: 'PENDING' | 'QUEUED' | 'PUBLISHING';
      attempts: number;
      nextAttemptAt: Date | null;
      queuedAt: Date | null;
      startedAt: Date | null;
      igContainerId: string | null;
      dailyLimitSince: Date | null;
    }>;
  }

  /** Post con sus imagenes procesadas y un destino por cuenta. Devuelve ids. */
  async function seed(options: SeedOptions = {}) {
    const images = options.images ?? 1;
    const post = await prisma.post.create({
      data: {
        brandId,
        caption: options.caption ?? 'Hola mundo',
        status: options.postStatus ?? 'SCHEDULED',
        scheduledAt: options.scheduledAt ?? new Date(Date.now() - minutes(1)),
      },
    });
    for (let i = 0; i < images; i++) {
      const media = await prisma.media.create({
        data: {
          originalKey: `originals/${post.id}-${i}.jpg`,
          originalFilename: `f${i}.jpg`,
          width: 1000,
          height: 1000,
          sizeBytes: 100,
          mime: 'image/jpeg',
        },
      });
      await prisma.postMedia.create({
        data: {
          postId: post.id,
          mediaId: media.id,
          position: i,
          processedKey: `processed/${post.id}-${i}.jpg`,
          publicUrl: `https://media.example.com/${post.id}-${i}.jpg`,
        },
      });
    }
    const targets: string[] = [];
    for (const accountId of options.accounts ?? [fbAccount]) {
      const t = await prisma.postTarget.create({
        data: {
          postId: post.id,
          socialAccountId: accountId,
          status: 'PENDING',
          ...options.target,
        },
      });
      targets.push(t.id);
    }
    return { postId: post.id, targetId: targets[0], targets };
  }

  const target = (id: string) =>
    prisma.postTarget.findUniqueOrThrow({ where: { id } });
  const post = (id: string) => prisma.post.findUniqueOrThrow({ where: { id } });
  const queued = async (id: string) => {
    await prisma.postTarget.update({
      where: { id },
      data: { status: 'QUEUED', queuedAt: new Date() },
    });
  };

  describe('tick', () => {
    it('toma los vencidos, los marca QUEUED y encola un job por destino', async () => {
      const { postId, targetId } = await seed({
        accounts: [fbAccount, igAccount],
      });

      const result = await tick.tick();

      expect(result).toEqual({ queued: 2, requeued: 0, hung: 0 });
      const t = await target(targetId);
      expect(t.status).toBe('QUEUED');
      expect(t.queuedAt).not.toBeNull();
      expect((await post(postId)).status).toBe('PUBLISHING');
      const jobs = addBulk.mock.calls[0][0] as { opts: { jobId: string } }[];
      expect(jobs.map((j) => j.opts.jobId)).toContain(`${targetId}-0`);
    });

    it('no toma borradores, cancelados, futuros ni reintentos que aun no tocan', async () => {
      await seed({ postStatus: 'DRAFT' });
      await seed({ postStatus: 'CANCELLED' });
      await seed({ scheduledAt: new Date(Date.now() + minutes(30)) });
      await seed({
        target: {
          attempts: 1,
          nextAttemptAt: new Date(Date.now() + minutes(5)),
        },
      });

      expect((await tick.tick()).queued).toBe(0);
      expect(addBulk).not.toHaveBeenCalled();
    });

    it('un segundo tick no vuelve a tomar lo ya encolado', async () => {
      await seed();
      await tick.tick();
      expect((await tick.tick()).queued).toBe(0);
    });

    it('dos ticks a la vez no duplican destinos (SKIP LOCKED)', async () => {
      for (let i = 0; i < 6; i++) await seed();

      const [a, b] = await Promise.all([tick.tick(), tick.tick()]);

      expect(a.queued + b.queued).toBe(6);
      const jobIds = addBulk.mock.calls.flatMap((c) =>
        (c[0] as { opts: { jobId: string } }[]).map((j) => j.opts.jobId),
      );
      expect(new Set(jobIds).size).toBe(6);
    });

    it('un QUEUED sin tomar hace mas de 5 min vuelve a PENDING sin gastar intento y se reencola', async () => {
      const { targetId } = await seed({
        target: {
          status: 'QUEUED',
          queuedAt: new Date(Date.now() - minutes(6)),
        },
      });

      const result = await tick.tick();

      expect(result.requeued).toBe(1);
      expect(result.queued).toBe(1);
      expect((await target(targetId)).attempts).toBe(0);
    });

    it('un QUEUED reciente se deja en paz', async () => {
      await seed({
        target: {
          status: 'QUEUED',
          queuedAt: new Date(Date.now() - minutes(1)),
        },
      });
      expect(await tick.tick()).toEqual({ queued: 0, requeued: 0, hung: 0 });
    });

    it('PUBLISHING colgado en Facebook: FAILED para revisar a mano, con aviso', async () => {
      const { targetId, postId } = await seed({
        target: {
          status: 'PUBLISHING',
          startedAt: new Date(Date.now() - minutes(20)),
        },
      });
      await prisma.publishAttempt.create({
        data: {
          postTargetId: targetId,
          startedAt: new Date(Date.now() - minutes(20)),
        },
      });

      const result = await tick.tick();

      expect(result.hung).toBe(1);
      const t = await target(targetId);
      expect(t.status).toBe('FAILED');
      expect(t.lastError).toContain('Revisá manualmente');
      expect((await post(postId)).status).toBe('FAILED');
      expect(notifyAdmin).toHaveBeenCalledTimes(1);
      const log = await prisma.publishAttempt.findFirstOrThrow({
        where: { postTargetId: targetId },
      });
      expect(log.finishedAt).not.toBeNull();
      expect(log.errorCode).toBe('HUNG');
    });

    it('PUBLISHING colgado en Instagram: vuelve a PENDING gastando un intento', async () => {
      const { targetId } = await seed({
        accounts: [igAccount],
        target: {
          status: 'PUBLISHING',
          startedAt: new Date(Date.now() - minutes(20)),
          igContainerId: 'container-1',
        },
      });

      await tick.tick();

      const t = await target(targetId);
      // Se recupero y, como esta vencido, el mismo tick lo volvio a encolar
      expect(t.attempts).toBe(1);
      expect(t.igContainerId).toBe('container-1');
      expect(['PENDING', 'QUEUED']).toContain(t.status);
    });

    it('PUBLISHING colgado de Instagram sin intentos restantes: FAILED', async () => {
      const { targetId } = await seed({
        accounts: [igAccount],
        target: {
          status: 'PUBLISHING',
          attempts: 3,
          startedAt: new Date(Date.now() - minutes(20)),
        },
      });
      await tick.tick();
      expect((await target(targetId)).status).toBe('FAILED');
    });
  });

  describe('Facebook', () => {
    it('publica una foto y guarda id y link', async () => {
      const { targetId, postId } = await seed({ caption: 'Texto FB' });
      await queued(targetId);
      routes.set('POST /page-1/photos', () => ({
        id: 'photo-1',
        post_id: 'page-1_99',
      }));
      routes.set('GET /page-1_99', () => ({
        permalink_url: '/page-1/posts/99',
      }));

      await publish.publishTarget(targetId);

      const t = await target(targetId);
      expect(t.status).toBe('PUBLISHED');
      expect(t.externalPostId).toBe('page-1_99');
      expect(t.permalink).toBe('https://www.facebook.com/page-1/posts/99');
      expect(t.publishedAt).not.toBeNull();
      expect((await post(postId)).status).toBe('PUBLISHED');
      expect(calls[0].params).toMatchObject({ message: 'Texto FB' });
      expect(String(calls[0].params.url)).toContain(
        'https://media.example.com/',
      );
      const log = await prisma.publishAttempt.findFirstOrThrow({
        where: { postTargetId: targetId },
      });
      expect(log.ok).toBe(true);
    });

    it('carrusel: sube cada foto sin publicar y arma un post con attached_media', async () => {
      const { targetId } = await seed({ images: 3 });
      await queued(targetId);
      let n = 0;
      routes.set('POST /page-1/photos', () => ({ id: `photo-${++n}` }));
      routes.set('POST /page-1/feed', () => ({ id: 'page-1_77' }));
      routes.set('GET /page-1_77', () => ({
        permalink_url: 'https://www.facebook.com/x',
      }));

      await publish.publishTarget(targetId);

      expect((await target(targetId)).externalPostId).toBe('page-1_77');
      const uploads = calls.filter((c) => c.path === '/page-1/photos');
      expect(uploads).toHaveLength(3);
      expect(uploads.every((c) => c.params.published === false)).toBe(true);
      const feed = calls.find((c) => c.path === '/page-1/feed')!;
      expect(feed.params['attached_media[0]']).toBe(
        JSON.stringify({ media_fbid: 'photo-1' }),
      );
      expect(feed.params['attached_media[2]']).toBe(
        JSON.stringify({ media_fbid: 'photo-3' }),
      );
    });

    it('si falla el link, el post igual queda PUBLISHED', async () => {
      const { targetId } = await seed();
      await queued(targetId);
      routes.set('POST /page-1/photos', () => ({ id: 'photo-1' }));
      routes.set('GET /photo-1', () => {
        throw new MetaApiException('x', 100, null, false);
      });

      await publish.publishTarget(targetId);

      const t = await target(targetId);
      expect(t.status).toBe('PUBLISHED');
      expect(t.permalink).toBeNull();
    });

    it('timeout al publicar: FAILED sin reintentar (podria haber salido) y con aviso', async () => {
      const { targetId } = await seed();
      await queued(targetId);
      routes.set('POST /page-1/photos', () => {
        throw new MetaApiException(
          'Meta no respondió a tiempo',
          null,
          null,
          true,
        );
      });

      await publish.publishTarget(targetId);

      const t = await target(targetId);
      expect(t.status).toBe('FAILED');
      expect(t.lastError).toContain('Revisá manualmente');
      expect(notifyAdmin).toHaveBeenCalledTimes(1);
    });
  });

  describe('Instagram', () => {
    const igRoutes = (state: () => string = () => 'FINISHED') => {
      let n = 0;
      routes.set('POST /ig-1/media', () => ({ id: `container-${++n}` }));
      routes.set('GET /container-1', () => ({ status_code: state() }));
      routes.set('GET /container-2', () => ({ status_code: state() }));
      routes.set('GET /container-3', () => ({ status_code: state() }));
      routes.set('GET /container-4', () => ({ status_code: state() }));
      routes.set('POST /ig-1/media_publish', () => ({ id: 'media-1' }));
      routes.set('GET /media-1', () => ({
        permalink: 'https://instagram.com/p/abc',
      }));
    };

    it('imagen sola: container, espera FINISHED, publica y guarda el link', async () => {
      const { targetId, postId } = await seed({
        accounts: [igAccount],
        caption: 'Texto IG',
      });
      await queued(targetId);
      const states = ['IN_PROGRESS', 'IN_PROGRESS', 'FINISHED'];
      igRoutes(() => states.shift() ?? 'FINISHED');

      await publish.publishTarget(targetId);

      const t = await target(targetId);
      expect(t.status).toBe('PUBLISHED');
      expect(t.externalPostId).toBe('media-1');
      expect(t.permalink).toBe('https://instagram.com/p/abc');
      expect(t.igContainerId).toBe('container-1');
      expect((await post(postId)).status).toBe('PUBLISHED');
      expect(calls.find((c) => c.path === '/ig-1/media')!.params).toMatchObject(
        {
          caption: 'Texto IG',
        },
      );
      expect(
        calls.find((c) => c.path === '/ig-1/media_publish')!.params,
      ).toEqual({
        creation_id: 'container-1',
      });
    });

    it('carrusel: un container por imagen, uno padre y publica el padre', async () => {
      const { targetId } = await seed({ accounts: [igAccount], images: 3 });
      await queued(targetId);
      igRoutes();

      await publish.publishTarget(targetId);

      const creations = calls.filter(
        (c) => c.method === 'POST' && c.path === '/ig-1/media',
      );
      expect(creations).toHaveLength(4);
      expect(
        creations.slice(0, 3).every((c) => c.params.is_carousel_item === true),
      ).toBe(true);
      expect(creations[3].params).toMatchObject({
        media_type: 'CAROUSEL',
        children: 'container-1,container-2,container-3',
      });
      expect(
        calls.find((c) => c.path === '/ig-1/media_publish')!.params,
      ).toEqual({
        creation_id: 'container-4',
      });
      expect((await target(targetId)).igContainerId).toBe('container-4');
    });

    it('guarda el container apenas se crea: si la espera falla, el reintento lo reanuda', async () => {
      const { targetId } = await seed({ accounts: [igAccount] });
      await queued(targetId);
      igRoutes(() => 'IN_PROGRESS');

      await publish.publishTarget(targetId);

      let t = await target(targetId);
      expect(t.status).toBe('PENDING');
      expect(t.attempts).toBe(1);
      expect(t.igContainerId).toBe('container-1');
      expect(t.lastErrorCode).toBe('IG_PROCESSING_TIMEOUT');

      // Segundo intento: el container ya esta FINISHED, no se crea otro
      routes.set('GET /container-1', () => ({ status_code: 'FINISHED' }));
      calls.length = 0;
      await prisma.postTarget.update({
        where: { id: targetId },
        data: { status: 'QUEUED', queuedAt: new Date() },
      });
      await publish.publishTarget(targetId);

      t = await target(targetId);
      expect(t.status).toBe('PUBLISHED');
      expect(
        calls.some((c) => c.method === 'POST' && c.path === '/ig-1/media'),
      ).toBe(false);
    });

    it('container en ERROR: se descarta y el proximo intento crea uno nuevo', async () => {
      const { targetId } = await seed({ accounts: [igAccount] });
      await queued(targetId);
      igRoutes(() => 'ERROR');

      await publish.publishTarget(targetId);

      const t = await target(targetId);
      expect(t.status).toBe('PENDING');
      expect(t.igContainerId).toBeNull();
    });

    it('ya estaba PUBLISHED: encuentra el post por texto y fecha y no vuelve a publicar', async () => {
      const startedAt = new Date(Date.now() - minutes(2));
      const { targetId } = await seed({
        accounts: [igAccount],
        caption: 'Texto IG',
        target: { igContainerId: 'container-9', startedAt, attempts: 1 },
      });
      await queued(targetId);
      routes.set('GET /container-9', () => ({ status_code: 'PUBLISHED' }));
      routes.set('GET /ig-1/media', () => ({
        data: [
          {
            id: 'old',
            caption: 'Texto IG',
            timestamp: new Date(
              startedAt.getTime() - minutes(60),
            ).toISOString(),
          },
          {
            id: 'media-7',
            caption: 'Texto IG',
            timestamp: new Date(startedAt.getTime() + 5_000)
              .toISOString()
              .replace('Z', '+0000'),
            permalink: 'https://instagram.com/p/zzz',
          },
        ],
      }));

      await publish.publishTarget(targetId);

      const t = await target(targetId);
      expect(t.status).toBe('PUBLISHED');
      expect(t.externalPostId).toBe('media-7');
      expect(t.permalink).toBe('https://instagram.com/p/zzz');
      expect(calls.some((c) => c.path === '/ig-1/media_publish')).toBe(false);
      expect(notifyAdmin).not.toHaveBeenCalled();
    });

    it('ya estaba PUBLISHED pero no aparece: queda PUBLISHED sin link y avisa', async () => {
      const { targetId } = await seed({
        accounts: [igAccount],
        target: {
          igContainerId: 'container-9',
          startedAt: new Date(Date.now() - minutes(2)),
        },
      });
      await queued(targetId);
      routes.set('GET /container-9', () => ({ status_code: 'PUBLISHED' }));
      routes.set('GET /ig-1/media', () => ({ data: [] }));

      await publish.publishTarget(targetId);

      const t = await target(targetId);
      expect(t.status).toBe('PUBLISHED');
      expect(t.externalPostId).toBeNull();
      expect(t.permalink).toBeNull();
      expect(calls.some((c) => c.path === '/ig-1/media_publish')).toBe(false);
      expect(notifyAdmin).toHaveBeenCalledTimes(1);
    });

    it('limite diario: no gasta intentos, reintenta en 1 h y a las 24 h falla', async () => {
      const { targetId } = await seed({ accounts: [igAccount] });
      await queued(targetId);
      routes.set('POST /ig-1/media', () => {
        throw new MetaApiException(
          'Límite diario',
          9,
          2207042,
          false,
          true,
          400,
        );
      });

      await publish.publishTarget(targetId);

      let t = await target(targetId);
      expect(t.status).toBe('PENDING');
      expect(t.attempts).toBe(0);
      expect(t.lastErrorCode).toBe('DAILY_LIMIT');
      expect(t.dailyLimitSince).not.toBeNull();
      const wait = t.nextAttemptAt!.getTime() - Date.now();
      expect(wait).toBeGreaterThan(minutes(59));
      expect(wait).toBeLessThanOrEqual(minutes(60));
      expect(notifyAdmin).not.toHaveBeenCalled();

      // Pasaron mas de 24 h desde el primer rechazo
      await prisma.postTarget.update({
        where: { id: targetId },
        data: {
          status: 'QUEUED',
          queuedAt: new Date(),
          dailyLimitSince: new Date(Date.now() - 25 * 60 * 60_000),
        },
      });
      await publish.publishTarget(targetId);

      t = await target(targetId);
      expect(t.status).toBe('FAILED');
      expect(t.dailyLimitSince).toBeNull();
      expect(notifyAdmin).toHaveBeenCalledTimes(1);
    });
  });

  describe('Threads', () => {
    const thRoutes = (state: () => string = () => 'FINISHED') => {
      let n = 0;
      routes.set('POST /v1.0/th-1/threads', () => ({
        id: `th-container-${++n}`,
      }));
      for (let i = 1; i <= 4; i++) {
        routes.set(`GET /v1.0/th-container-${i}`, () => ({ status: state() }));
      }
      routes.set('POST /v1.0/th-1/threads_publish', () => ({
        id: 'th-media-1',
      }));
      routes.set('GET /v1.0/th-media-1', () => ({
        permalink: 'https://www.threads.com/@kalendox/post/abc',
      }));
    };

    it('imagen sola: container IMAGE con el texto, espera FINISHED, publica y guarda el link', async () => {
      const { targetId, postId } = await seed({
        accounts: [thAccount],
        caption: 'Texto Threads',
      });
      await queued(targetId);
      const states = ['IN_PROGRESS', 'FINISHED'];
      thRoutes(() => states.shift() ?? 'FINISHED');

      await publish.publishTarget(targetId);

      const t = await target(targetId);
      expect(t.status).toBe('PUBLISHED');
      expect(t.externalPostId).toBe('th-media-1');
      expect(t.permalink).toBe('https://www.threads.com/@kalendox/post/abc');
      expect(t.igContainerId).toBe('th-container-1');
      expect((await post(postId)).status).toBe('PUBLISHED');
      expect(
        calls.find((c) => c.path === '/v1.0/th-1/threads')!.params,
      ).toMatchObject({ media_type: 'IMAGE', text: 'Texto Threads' });
      expect(
        calls.find((c) => c.path === '/v1.0/th-1/threads_publish')!.params,
      ).toEqual({ creation_id: 'th-container-1' });
    });

    it('carrusel: un container por imagen, uno padre CAROUSEL y publica el padre', async () => {
      const { targetId } = await seed({ accounts: [thAccount], images: 3 });
      await queued(targetId);
      thRoutes();

      await publish.publishTarget(targetId);

      const creations = calls.filter(
        (c) => c.method === 'POST' && c.path === '/v1.0/th-1/threads',
      );
      expect(creations).toHaveLength(4);
      expect(
        creations.slice(0, 3).every((c) => c.params.is_carousel_item === true),
      ).toBe(true);
      expect(creations[3].params).toMatchObject({
        media_type: 'CAROUSEL',
        children: 'th-container-1,th-container-2,th-container-3',
      });
      expect((await target(targetId)).igContainerId).toBe('th-container-4');
    });

    it('si la espera falla, el reintento reanuda el container sin crear otro', async () => {
      const { targetId } = await seed({ accounts: [thAccount] });
      await queued(targetId);
      thRoutes(() => 'IN_PROGRESS');

      await publish.publishTarget(targetId);

      let t = await target(targetId);
      expect(t.status).toBe('PENDING');
      expect(t.igContainerId).toBe('th-container-1');
      expect(t.lastErrorCode).toBe('THREADS_PROCESSING_TIMEOUT');

      routes.set('GET /v1.0/th-container-1', () => ({ status: 'FINISHED' }));
      calls.length = 0;
      await queued(targetId);
      await publish.publishTarget(targetId);

      t = await target(targetId);
      expect(t.status).toBe('PUBLISHED');
      expect(
        calls.some(
          (c) => c.method === 'POST' && c.path === '/v1.0/th-1/threads',
        ),
      ).toBe(false);
    });

    it('ya estaba PUBLISHED: encuentra el post por texto y fecha y no vuelve a publicar', async () => {
      const startedAt = new Date(Date.now() - minutes(2));
      const { targetId } = await seed({
        accounts: [thAccount],
        caption: 'Texto Threads',
        target: {
          status: 'QUEUED',
          queuedAt: new Date(),
          startedAt,
          igContainerId: 'th-container-1',
        },
      });
      routes.set('GET /v1.0/th-container-1', () => ({ status: 'PUBLISHED' }));
      routes.set('GET /v1.0/th-1/threads', () => ({
        data: [
          {
            id: 'th-media-9',
            text: 'Texto Threads',
            timestamp: new Date(startedAt.getTime() + 5_000).toISOString(),
            permalink: 'https://www.threads.com/@kalendox/post/zzz',
          },
        ],
      }));

      await publish.publishTarget(targetId);

      const t = await target(targetId);
      expect(t.status).toBe('PUBLISHED');
      expect(t.externalPostId).toBe('th-media-9');
      expect(calls.some((c) => c.path.endsWith('/threads_publish'))).toBe(
        false,
      );
    });

    it('token invalido (190): FAILED y marca la conexion de Threads como invalida', async () => {
      const { targetId } = await seed({ accounts: [thAccount] });
      await queued(targetId);
      routes.set('POST /v1.0/th-1/threads', () => {
        throw new MetaApiException(
          'Token vencido',
          190,
          null,
          false,
          false,
          400,
        );
      });

      await publish.publishTarget(targetId);

      expect((await target(targetId)).status).toBe('FAILED');
      expect(threadsInvalid).toHaveBeenCalledTimes(1);
      expect(markInvalid).not.toHaveBeenCalled();
    });

    it('sin conexion activa con Threads: FAILED sin llamar a Threads', async () => {
      const { targetId } = await seed({ accounts: [thAccount] });
      await queued(targetId);
      threadsActive.value = false;

      await publish.publishTarget(targetId);

      const t = await target(targetId);
      expect(t.status).toBe('FAILED');
      expect(t.lastErrorCode).toBe('THREADS_DISCONNECTED');
      expect(calls).toHaveLength(0);
    });

    it('PUBLISHING colgado en Threads: vuelve a PENDING gastando un intento (el container evita duplicar)', async () => {
      const { targetId } = await seed({
        accounts: [thAccount],
        target: {
          status: 'PUBLISHING',
          startedAt: new Date(Date.now() - minutes(20)),
          igContainerId: 'th-container-1',
        },
      });

      await tick.tick();

      const t = await target(targetId);
      expect(t.status).toBe('PENDING');
      expect(t.attempts).toBe(1);
    });
  });

  describe('errores y reintentos', () => {
    it('error pasajero: reintenta a 1, 5 y 15 min y al 4to intento queda FAILED con aviso', async () => {
      const { targetId, postId } = await seed();
      routes.set('POST /page-1/photos', () => {
        throw new MetaApiException('Meta caída', 2, null, true, false, 503);
      });
      const expectedWaits = [1, 5, 15];

      for (let attempt = 1; attempt <= 3; attempt++) {
        await queued(targetId);
        await publish.publishTarget(targetId);
        const t = await target(targetId);
        expect(t.status).toBe('PENDING');
        expect(t.attempts).toBe(attempt);
        const wait = t.nextAttemptAt!.getTime() - Date.now();
        expect(wait).toBeGreaterThan(
          minutes(expectedWaits[attempt - 1]) - 5_000,
        );
        expect(wait).toBeLessThanOrEqual(minutes(expectedWaits[attempt - 1]));
        expect((await post(postId)).status).toBe('PUBLISHING');
      }
      expect(notifyAdmin).not.toHaveBeenCalled();

      await queued(targetId);
      await publish.publishTarget(targetId);

      const t = await target(targetId);
      expect(t.status).toBe('FAILED');
      expect(t.attempts).toBe(4);
      expect(t.nextAttemptAt).toBeNull();
      expect((await post(postId)).status).toBe('FAILED');
      expect(notifyAdmin).toHaveBeenCalledTimes(1);
      expect(
        await prisma.publishAttempt.count({
          where: { postTargetId: targetId },
        }),
      ).toBe(4);
    });

    it('error permanente: FAILED de una, con aviso, sin tokens en lo guardado', async () => {
      const { targetId } = await seed();
      await queued(targetId);
      routes.set('POST /page-1/photos', () => {
        throw new MetaApiException(
          'Parámetro inválido access_token=TOKEN-SECRETO',
          100,
          null,
          false,
          false,
          400,
        );
      });

      await publish.publishTarget(targetId);

      const t = await target(targetId);
      expect(t.status).toBe('FAILED');
      expect(t.attempts).toBe(1);
      expect(t.lastErrorCode).toBe('100');
      const log = await prisma.publishAttempt.findFirstOrThrow({
        where: { postTargetId: targetId },
      });
      const stored = JSON.stringify([t, log, notifyAdmin.mock.calls]);
      expect(stored).not.toContain('TOKEN-SECRETO');
    });

    it('token invalido (190): FAILED, marca la conexion invalida', async () => {
      const { targetId } = await seed();
      await queued(targetId);
      routes.set('POST /page-1/photos', () => {
        throw new MetaApiException(
          'Token vencido',
          190,
          null,
          false,
          false,
          400,
        );
      });

      await publish.publishTarget(targetId);

      expect((await target(targetId)).status).toBe('FAILED');
      expect(markInvalid).toHaveBeenCalledTimes(1);
    });

    it('sin conexion activa con Meta: FAILED sin llamar a Meta', async () => {
      const { targetId } = await seed();
      await queued(targetId);
      connectionActive.value = false;

      await publish.publishTarget(targetId);

      const t = await target(targetId);
      expect(t.status).toBe('FAILED');
      expect(t.lastErrorCode).toBe('META_DISCONNECTED');
      expect(calls).toHaveLength(0);
    });

    it('cuenta desactivada: FAILED sin llamar a Meta', async () => {
      const { targetId } = await seed();
      await queued(targetId);
      await prisma.socialAccount.update({
        where: { id: fbAccount },
        data: { active: false },
      });

      await publish.publishTarget(targetId);

      expect((await target(targetId)).lastErrorCode).toBe('ACCOUNT_INACTIVE');
      expect(calls).toHaveLength(0);
    });

    it('error inesperado: se reintenta y se reporta', async () => {
      const { targetId } = await seed();
      await queued(targetId);
      routes.set('POST /page-1/photos', () => {
        throw new TypeError('bug');
      });

      await publish.publishTarget(targetId);

      const t = await target(targetId);
      expect(t.status).toBe('PENDING');
      expect(t.attempts).toBe(1);
      expect(report).toHaveBeenCalledTimes(1);
    });

    it('un destino sale y el otro falla: el post queda PARTIAL', async () => {
      const { postId, targets } = await seed({
        accounts: [fbAccount, igAccount],
      });
      for (const id of targets) await queued(id);
      routes.set('POST /page-1/photos', () => ({ id: 'photo-1' }));
      routes.set('GET /photo-1', () => ({
        permalink_url: 'https://www.facebook.com/x',
      }));
      routes.set('POST /ig-1/media', () => {
        throw new MetaApiException(
          'Imagen no válida',
          100,
          2207001,
          false,
          false,
          400,
        );
      });

      await publish.publishTarget(targets[0]);
      await publish.publishTarget(targets[1]);

      expect((await post(postId)).status).toBe('PARTIAL');
    });

    it('post cancelado entre el tick y el worker: no se publica y el destino vuelve a PENDING', async () => {
      const { targetId, postId } = await seed();
      await queued(targetId);
      await prisma.post.update({
        where: { id: postId },
        data: { status: 'CANCELLED' },
      });

      await publish.publishTarget(targetId);

      const t = await target(targetId);
      expect(t.status).toBe('PENDING');
      expect(t.attempts).toBe(0);
      expect(calls).toHaveLength(0);
      expect((await post(postId)).status).toBe('CANCELLED');
    });

    it('un job repetido sobre un destino que ya no esta QUEUED no hace nada', async () => {
      const { targetId } = await seed();

      await publish.publishTarget(targetId);

      expect((await target(targetId)).status).toBe('PENDING');
      expect(calls).toHaveLength(0);
    });
  });
});
