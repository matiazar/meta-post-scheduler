import { loadEnvFile } from '../../src/config/load-env-file.js';
import type { PrismaService } from '../../src/modules/prisma/prisma.service.js';

/**
 * URL de la base de TEST (de .env.test). Se niega a seguir si la base no termina en `_test`:
 * estos tests borran todas las tablas y jamas deben tocar la base de desarrollo.
 */
export function testDatabaseUrl(): string {
  process.env.NODE_ENV = 'test';
  loadEnvFile();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Falta DATABASE_URL en apps/api/.env.test');
  const dbName = new URL(url).pathname.replace(/^\//, '');
  if (!dbName.endsWith('_test')) {
    throw new Error(
      `Los tests e2e con DB exigen una base que termine en "_test" (llego "${dbName}")`,
    );
  }
  return url;
}

/** Vacia todas las tablas del modelo. Orden: de hijos a padres. */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  await prisma.$transaction([
    prisma.publishAttempt.deleteMany(),
    prisma.postTarget.deleteMany(),
    prisma.postMedia.deleteMany(),
    prisma.post.deleteMany(),
    prisma.media.deleteMany(),
    prisma.socialAccount.deleteMany(),
    prisma.brand.deleteMany(),
    prisma.socialConnection.deleteMany(),
  ]);
}
