import { defineConfig } from 'prisma/config';
import { loadEnvFile } from './src/config/load-env-file.js';

// Prisma 7 no lee .env solo: se carga igual que en la app (.env.test si NODE_ENV=test)
loadEnvFile();

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
