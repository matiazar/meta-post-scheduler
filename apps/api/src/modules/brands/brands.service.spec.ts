import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import {
  BrandHasPostsException,
  BrandNotFoundException,
} from './brands.exceptions.js';
import { BrandsService } from './brands.service.js';

function serviceWithTx(tx: Record<string, unknown>): BrandsService {
  const prisma = {
    $transaction: (fn: (t: unknown) => Promise<unknown>) => fn(tx),
  } as unknown as PrismaService;
  return new BrandsService(prisma);
}

describe('BrandsService.remove', () => {
  it('traduce la violacion de FK (post creado en carrera) a BrandHasPosts', async () => {
    const fkError = new Prisma.PrismaClientKnownRequestError('fk', {
      code: 'P2003',
      clientVersion: 'test',
    });
    const service = serviceWithTx({
      brand: {
        findUnique: () => Promise.resolve({ id: 'b1' }),
        delete: () => Promise.reject(fkError),
      },
      post: { count: () => Promise.resolve(0) },
    });
    await expect(service.remove('b1')).rejects.toThrow(BrandHasPostsException);
  });

  it('marca inexistente -> BrandNotFound; errores desconocidos se relanzan', async () => {
    const missing = serviceWithTx({
      brand: { findUnique: () => Promise.resolve(null) },
    });
    await expect(missing.remove('x')).rejects.toThrow(BrandNotFoundException);

    const boom = new Error('boom');
    const broken = serviceWithTx({
      brand: { findUnique: () => Promise.reject(boom) },
    });
    await expect(broken.remove('x')).rejects.toBe(boom);
  });
});
