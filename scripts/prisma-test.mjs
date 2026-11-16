// Corre un comando de Prisma contra la base de TEST (.env.test). Uso:
//   node scripts/prisma-test.mjs migrate deploy
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Uso: node scripts/prisma-test.mjs <comando de prisma>');
  process.exit(1);
}

const result = spawnSync('npx', ['prisma', ...args], {
  cwd: resolve(import.meta.dirname, '../apps/api'),
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, NODE_ENV: 'test' },
});
process.exit(result.status ?? 1);
