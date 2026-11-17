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
  // Auth (etapa 1): un solo admin, contrasena como hash bcrypt, sesion en JWT
  ADMIN_PASSWORD_HASH: z.string().regex(/^\$2[aby]\$\d{2}\$.{53}$/),
  JWT_SECRET: z.string().min(32),
  // Origen exacto (sin barra final ni ruta): el navegador lo compara tal cual en CORS
  WEB_ORIGIN: z
    .url()
    .refine(
      (v) => new URL(v).origin === v,
      'debe ser un origen sin barra final ni ruta',
    ),
  // Clave AES-256 (32 bytes en base64) para cifrar los tokens de Meta en la DB (etapa 2)
  TOKEN_ENC_KEY: z
    .string()
    .refine(
      (v) =>
        /^[A-Za-z0-9+/]+={0,2}$/.test(v) &&
        Buffer.from(v, 'base64').length === 32,
      'debe ser una clave de 32 bytes en base64',
    ),
  // Meta (etapa 3). La app se crea a mano en developers.facebook.com (ver checklist del README)
  META_APP_ID: z.string().min(1),
  META_APP_SECRET: z.string().min(1),
  META_GRAPH_VERSION: z.string().regex(/^v\d+\.\d+$/, 'ej. v24.0'),
  // Debe coincidir exacto con la Redirect URI cargada en la app de Meta
  META_REDIRECT_URI: z.url(),
  // Cloudflare R2 (etapa 4). Bucket con acceso publico: IG y FB descargan la imagen por URL
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1),
  R2_PUBLIC_BASE_URL: z.url(),
  // IA para copy y hashtags (etapa 11). Opcional: sin key la API arranca y el endpoint responde 503
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  AI_MODEL: z.string().min(1).default('claude-sonnet-5-5'),
  // Threads (etapa 12). Login propio: App ID y secreto del caso de uso Threads (no los de Meta).
  // Opcionales: sin las tres, la API arranca y conectar Threads responde 503
  THREADS_APP_ID: z.string().min(1).optional(),
  THREADS_APP_SECRET: z.string().min(1).optional(),
  THREADS_REDIRECT_URI: z.url().optional(),
});

export type Env = z.infer<typeof envSchema>;

const THREADS_VARS = [
  'THREADS_APP_ID',
  'THREADS_APP_SECRET',
  'THREADS_REDIRECT_URI',
] as const;

export function parseEnv(raw: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(raw);
  // Threads va completo o no va: a medias seria una conexion que falla recien al usarla
  const threadsSet = THREADS_VARS.filter((name) => Boolean(raw[name]));
  if (
    result.success &&
    threadsSet.length > 0 &&
    threadsSet.length < THREADS_VARS.length
  ) {
    throw new InvalidEnvException(
      THREADS_VARS.filter((name) => !raw[name]),
    );
  }
  if (!result.success) {
    // Solo nombres de variables: nunca los valores (pueden ser secretos).
    const names = [
      ...new Set(result.error.issues.map((issue) => issue.path.join('.'))),
    ];
    throw new InvalidEnvException(names);
  }
  return result.data;
}
