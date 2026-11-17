import { Global, Module } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ENV } from '../src/config/config.module.js';
import type { Env } from '../src/config/env.js';
import { ConnectionsService } from '../src/modules/connections/connections.service.js';
import type { ConnectionRefresher } from '../src/modules/connections/connections.types.js';
import { CryptoModule } from '../src/modules/crypto/crypto.module.js';
import { CryptoService } from '../src/modules/crypto/crypto.service.js';
import { MailService } from '../src/modules/mail/mail.service.js';
import { PrismaModule } from '../src/modules/prisma/prisma.module.js';
import { PrismaService } from '../src/modules/prisma/prisma.service.js';
import { resetDatabase, testDatabaseUrl } from './helpers/test-db.js';
import { makeTestEnv } from './helpers/test-env.js';

const DAY = 24 * 60 * 60 * 1000;

describe('ConnectionsService (e2e, DB de test)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let crypto: CryptoService;
  let service: ConnectionsService;
  const env: Env = makeTestEnv({ DATABASE_URL: testDatabaseUrl() });
  const notifyAdmin = vi.fn().mockResolvedValue(undefined);

  beforeAll(async () => {
    @Global()
    @Module({
      providers: [
        { provide: ENV, useValue: env },
        { provide: MailService, useValue: { notifyAdmin } },
      ],
      exports: [ENV, MailService],
    })
    class TestGlobalModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [TestGlobalModule, PrismaModule, CryptoModule],
      providers: [ConnectionsService],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    crypto = app.get(CryptoService);
    service = app.get(ConnectionsService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    notifyAdmin.mockClear();
  });

  const save = (
    over: Partial<Parameters<ConnectionsService['save']>[0]> = {},
  ) =>
    service.save({
      provider: 'THREADS',
      externalId: 'u1',
      displayName: 'perfil',
      token: 'TOKEN-1',
      tokenExpiresAt: new Date(Date.now() + 60 * DAY),
      renewable: true,
      ...over,
    });

  it('guarda el token cifrado y una reconexion lo deja ACTIVE sin duplicar', async () => {
    const first = await save();
    expect(first.tokenEnc).not.toContain('TOKEN-1');
    expect(crypto.decrypt(first.tokenEnc)).toBe('TOKEN-1');
    await service.markInvalid(first);

    const again = await save({ token: 'TOKEN-2' });
    expect(again.id).toBe(first.id);
    expect(again.status).toBe('ACTIVE');
    expect(service.token(again)).toBe('TOKEN-2');
    expect(await prisma.socialConnection.count()).toBe(1);
  });

  it('replace deja una sola conexion del proveedor y no toca las de otro', async () => {
    await save({ provider: 'THREADS', externalId: 'th' });
    await service.replace({
      provider: 'META',
      externalId: 'm1',
      displayName: 'Viejo',
      token: 'A',
      tokenExpiresAt: null,
      renewable: false,
    });
    const meta = await service.replace({
      provider: 'META',
      externalId: 'm2',
      displayName: 'Nuevo',
      token: 'B',
      tokenExpiresAt: null,
      renewable: false,
    });

    expect(await prisma.socialConnection.count()).toBe(2);
    expect((await service.latest('META'))?.id).toBe(meta.id);
    // Meta no se renueva: no hay fecha de renovacion
    expect(meta.tokenRefreshedAt).toBeNull();
  });

  it('replace pasa las cuentas a la conexion nueva antes de borrar la vieja', async () => {
    const meta = (externalId: string) => ({
      provider: 'META' as const,
      externalId,
      displayName: externalId,
      token: 'T',
      tokenExpiresAt: null,
      renewable: false,
    });
    const old = await service.replace(meta('m1'));
    await prisma.socialAccount.create({
      data: {
        network: 'FACEBOOK',
        externalId: 'p1',
        name: 'Pagina',
        connectionId: old.id,
      },
    });

    const fresh = await service.replace(meta('m2'));

    const account = await prisma.socialAccount.findFirstOrThrow();
    expect(account.connectionId).toBe(fresh.id);
    expect(await prisma.socialConnection.count()).toBe(1);
  });

  it('varios rechazos a la vez dejan INVALID y mandan un solo aviso', async () => {
    const conn = await save({ displayName: 'kalendox' });

    await Promise.all([
      service.markInvalid(conn),
      service.markInvalid(conn),
      service.markInvalid(conn),
    ]);

    expect(
      (
        await prisma.socialConnection.findUniqueOrThrow({
          where: { id: conn.id },
        })
      ).status,
    ).toBe('INVALID');
    expect(notifyAdmin).toHaveBeenCalledTimes(1);
    expect(notifyAdmin.mock.calls[0]![0]).toBe(
      'Threads: hay que reconectar @kalendox',
    );
  });

  it('el aviso de Meta no nombra a nadie', async () => {
    const conn = await save({ provider: 'META', renewable: false });
    await service.markInvalid(conn);
    expect(notifyAdmin.mock.calls[0]![0]).toBe('Meta: hay que reconectar');
  });

  describe('refreshDue', () => {
    const refreshFn = vi.fn<ConnectionRefresher['refresh']>();
    const refresher: ConnectionRefresher = {
      provider: 'THREADS',
      refreshWhenLeftMs: 15 * DAY,
      minAgeMs: DAY,
      refresh: refreshFn,
      isTokenRejected: (e) => e instanceof Error && e.message === 'rechazado',
    };

    beforeAll(() => service.registerRefresher(refresher));
    beforeEach(() => refreshFn.mockReset());

    const age = (expiresInDays: number, refreshedDaysAgo: number) =>
      prisma.socialConnection.updateMany({
        data: {
          tokenExpiresAt: new Date(Date.now() + expiresInDays * DAY),
          tokenRefreshedAt: new Date(Date.now() - refreshedDaysAgo * DAY),
        },
      });

    it('renueva solo los que vencen pronto y son de su proveedor', async () => {
      await save({ externalId: 'a' });
      await save({ externalId: 'b' });
      await service.replace({
        provider: 'META',
        externalId: 'm',
        displayName: 'm',
        token: 'M',
        tokenExpiresAt: new Date(Date.now() + DAY),
        renewable: false,
      });
      await age(10, 50);
      await prisma.socialConnection.updateMany({
        where: { externalId: 'b' },
        data: { tokenExpiresAt: new Date(Date.now() + 50 * DAY) },
      });
      refreshFn.mockResolvedValue({
        token: 'NUEVO',
        expiresAt: new Date(Date.now() + 60 * DAY),
      });

      expect(await service.refreshDue()).toBe(1);

      expect(refreshFn).toHaveBeenCalledTimes(1);
      expect(refreshFn.mock.calls[0]![0]).toBe('TOKEN-1');
      const a = await service.find('THREADS', 'a');
      expect(service.token(a!)).toBe('NUEVO');
    });

    it('renueva tambien una conexion que nunca se renovo (tokenRefreshedAt nulo)', async () => {
      await save({
        renewable: false,
        tokenExpiresAt: new Date(Date.now() + 5 * DAY),
      });
      refreshFn.mockResolvedValue({
        token: 'NUEVO',
        expiresAt: new Date(Date.now() + 60 * DAY),
      });

      expect(await service.refreshDue()).toBe(1);
      expect(
        (await service.find('THREADS', 'u1'))!.tokenRefreshedAt,
      ).not.toBeNull();
    });

    it('sin ningun refresher registrado falla en voz alta en vez de no renovar nada', async () => {
      const bare = new ConnectionsService(prisma, crypto, {
        notifyAdmin,
      } as unknown as MailService);
      await expect(bare.refreshDue()).rejects.toThrow(/ConnectionRefresher/);
    });

    it('rechazo del token deja INVALID; un fallo pasajero se reintenta', async () => {
      await save();
      await age(5, 50);

      refreshFn.mockRejectedValueOnce(new Error('timeout'));
      expect(await service.refreshDue()).toBe(0);
      expect((await service.find('THREADS', 'u1'))!.status).toBe('ACTIVE');
      expect(notifyAdmin).not.toHaveBeenCalled();

      refreshFn.mockRejectedValueOnce(new Error('rechazado'));
      expect(await service.refreshDue()).toBe(0);
      expect((await service.find('THREADS', 'u1'))!.status).toBe('INVALID');
      expect(notifyAdmin).toHaveBeenCalledTimes(1);
    });
  });
});
