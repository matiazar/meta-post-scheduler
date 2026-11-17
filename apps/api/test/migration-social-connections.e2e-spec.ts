import { readFileSync } from 'node:fs';
import { PrismaModule } from '../src/modules/prisma/prisma.module.js';
import { PrismaService } from '../src/modules/prisma/prisma.service.js';
import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ENV } from '../src/config/config.module.js';
import { resetDatabase, testDatabaseUrl } from './helpers/test-db.js';
import { makeTestEnv } from './helpers/test-env.js';

/**
 * La migracion A (20261118120000) copia los datos de meta_connections y threads_connections
 * (que la B borro) a social_connections. Como las tablas viejas ya no existen, el test las
 * recrea, siembra filas y corre la parte de copia del SQL real de la migracion.
 */
describe('Migracion social_connections: copia de datos (e2e, DB de test)', () => {
  let prisma: PrismaService;
  let close: () => Promise<void>;

  const sql = readFileSync(
    new URL(
      '../prisma/migrations/20261118120000_social_connections/migration.sql',
      import.meta.url,
    ),
    'utf-8',
  );
  const copyStatements = sql
    .slice(sql.indexOf('-- Copia de datos'))
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);

  beforeAll(async () => {
    @Global()
    @Module({
      providers: [
        {
          provide: ENV,
          useValue: makeTestEnv({ DATABASE_URL: testDatabaseUrl() }),
        },
      ],
      exports: [ENV],
    })
    class TestConfigModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [TestConfigModule, PrismaModule],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    close = () => app.close();
  });

  afterAll(async () => {
    await close();
  });

  afterEach(async () => {
    await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS "meta_connections"');
    await prisma.$executeRawUnsafe(
      'DROP TABLE IF EXISTS "threads_connections"',
    );
  });

  it('copia solo la conexion de Meta mas reciente, los perfiles de Threads y vincula las cuentas', async () => {
    await resetDatabase(prisma);
    await prisma.$executeRawUnsafe(`CREATE TABLE "meta_connections" (
      "id" TEXT PRIMARY KEY, "fbUserId" TEXT NOT NULL, "fbUserName" TEXT NOT NULL,
      "userTokenEnc" TEXT NOT NULL, "userTokenExpiresAt" TIMESTAMP(3),
      "status" "ConnectionStatus" NOT NULL DEFAULT 'ACTIVE', "lastSyncedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL)`);
    await prisma.$executeRawUnsafe(`CREATE TABLE "threads_connections" (
      "id" TEXT PRIMARY KEY, "threadsUserId" TEXT NOT NULL, "username" TEXT NOT NULL,
      "tokenEnc" TEXT NOT NULL, "tokenExpiresAt" TIMESTAMP(3),
      "tokenRefreshedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "status" "ConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL)`);
    await prisma.$executeRawUnsafe(`INSERT INTO "meta_connections"
      ("id","fbUserId","fbUserName","userTokenEnc","status","createdAt","updatedAt") VALUES
      ('old','u1','Viejo','enc-old','ACTIVE', now() - interval '1 day', now()),
      ('new','u2','Nuevo','enc-new','INVALID', now(), now())`);
    await prisma.$executeRawUnsafe(`INSERT INTO "threads_connections"
      ("id","threadsUserId","username","tokenEnc","updatedAt") VALUES ('t1','th1','perfil','enc-th', now())`);
    for (const [network, externalId] of [
      ['FACEBOOK', 'p1'],
      ['INSTAGRAM', 'i1'],
      ['THREADS', 'th1'],
      ['THREADS', 'sin-conexion'],
    ] as const) {
      await prisma.socialAccount.create({
        data: { network, externalId, name: externalId },
      });
    }

    for (const statement of copyStatements) {
      await prisma.$executeRawUnsafe(statement);
    }

    const rows = await prisma.socialConnection.findMany({
      orderBy: { provider: 'asc' },
    });
    expect(rows).toHaveLength(2);
    const meta = rows.find((r) => r.provider === 'META')!;
    expect(meta).toMatchObject({
      id: 'new',
      externalId: 'u2',
      displayName: 'Nuevo',
      tokenEnc: 'enc-new',
      status: 'INVALID',
      tokenRefreshedAt: null,
    });
    const threads = rows.find((r) => r.provider === 'THREADS')!;
    expect(threads).toMatchObject({
      id: 't1',
      externalId: 'th1',
      displayName: 'perfil',
      tokenEnc: 'enc-th',
    });
    expect(threads.tokenRefreshedAt).not.toBeNull();

    const link = async (externalId: string) =>
      (
        await prisma.socialAccount.findFirstOrThrow({
          where: { externalId },
        })
      ).connectionId;
    expect(await link('p1')).toBe('new');
    expect(await link('i1')).toBe('new');
    expect(await link('th1')).toBe('t1');
    expect(await link('sin-conexion')).toBeNull();
  });
});
