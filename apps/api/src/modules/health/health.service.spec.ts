import type { Queue } from 'bullmq';
import type { PrismaService } from '../prisma/prisma.service.js';
import { HealthService } from './health.service.js';

function setup(opts: { dbOk: boolean; redisOk: boolean }) {
  const prisma = {
    $queryRaw: opts.dbOk
      ? vi.fn().mockResolvedValue([{ '?column?': 1 }])
      : vi.fn().mockRejectedValue(new Error('db caida')),
  } as unknown as PrismaService;
  const queue = {
    getJobCounts: opts.redisOk
      ? vi.fn().mockResolvedValue({ waiting: 0 })
      : vi.fn().mockRejectedValue(new Error('redis caido')),
  } as unknown as Queue;
  return new HealthService(prisma, queue);
}

describe('HealthService', () => {
  it('ok cuando DB y Redis responden', async () => {
    expect(await setup({ dbOk: true, redisOk: true }).check()).toEqual({
      status: 'ok',
      db: 'up',
      redis: 'up',
    });
  });

  it('error y detalle por componente cuando uno cae', async () => {
    expect(await setup({ dbOk: false, redisOk: true }).check()).toEqual({
      status: 'error',
      db: 'down',
      redis: 'up',
    });
    expect(await setup({ dbOk: true, redisOk: false }).check()).toMatchObject({
      status: 'error',
      redis: 'down',
    });
  });
});
