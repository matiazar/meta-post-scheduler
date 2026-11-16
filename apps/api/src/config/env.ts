import { z } from 'zod';
import { InvalidEnvException } from './config.exceptions.js';

/**
 * Variables de entorno de la API. Se valida todo al arrancar y falla si falta algo.
 * Cada etapa suma las suyas (auth, Meta, R2, etc.) a medida que las usa.
 */
export const envSchema = z.object({
  // Sin default: si falta en produccion, el reporte de errores quedaria apagado sin aviso
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  ADMIN_EMAIL: z.email(),
  MAIL_FROM: z.string().min(1),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive(),
  SMTP_USER: z.string().min(1),
  SMTP_PASS: z.string().min(1),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(raw: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    // Solo nombres de variables: nunca los valores (pueden ser secretos).
    const names = [
      ...new Set(result.error.issues.map((issue) => issue.path.join('.'))),
    ];
    throw new InvalidEnvException(names);
  }
  return result.data;
}
