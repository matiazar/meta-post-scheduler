import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Carga `.env` (o `.env.test` si NODE_ENV=test) desde la carpeta de la API.
 * Si el archivo no existe no hace nada: las variables pueden venir del entorno.
 * Las variables ya presentes en el entorno no se pisan.
 */
export function loadEnvFile(cwd: string = process.cwd()): void {
  const file = resolve(
    cwd,
    process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
  );
  if (existsSync(file)) {
    process.loadEnvFile(file);
  }
}
