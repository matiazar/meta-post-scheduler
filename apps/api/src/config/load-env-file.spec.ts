import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEnvFile } from './load-env-file.js';

describe('loadEnvFile', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sp-env-'));
    delete process.env.SP_TEST_VAR;
    delete process.env.SP_TEST_KEEP;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.SP_TEST_VAR;
    delete process.env.SP_TEST_KEEP;
  });

  it('bajo NODE_ENV=test carga .env.test y no .env', () => {
    writeFileSync(join(dir, '.env.test'), 'SP_TEST_VAR=from-test\n');
    writeFileSync(join(dir, '.env'), 'SP_TEST_VAR=from-dev\n');
    loadEnvFile(dir);
    expect(process.env.SP_TEST_VAR).toBe('from-test');
  });

  it('no pisa variables que ya estan en el entorno', () => {
    process.env.SP_TEST_KEEP = 'original';
    writeFileSync(join(dir, '.env.test'), 'SP_TEST_KEEP=otro\n');
    loadEnvFile(dir);
    expect(process.env.SP_TEST_KEEP).toBe('original');
  });

  it('si el archivo no existe no hace nada', () => {
    expect(() => loadEnvFile(dir)).not.toThrow();
  });
});
