import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Los e2e comparten una sola base de test y la vacian entre tests: un archivo a la vez
    fileParallelism: false,
  },
});
