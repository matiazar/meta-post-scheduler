import { z } from 'zod';

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Ingresá tu email')
    .email('El email no es válido'),
  password: z.string().min(1, 'Ingresá tu contraseña'),
});
export type LoginValues = z.infer<typeof loginSchema>;

export const brandSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Poné un nombre')
    .max(80, 'Máximo 80 caracteres'),
  slug: z
    .string()
    .trim()
    .max(60, 'Máximo 60 caracteres')
    .regex(/^([a-z0-9]+(-[a-z0-9]+)*)?$/, 'Solo minúsculas, números y guiones'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Elegí un color válido'),
  defaultHashtags: z.string().max(500, 'Máximo 500 caracteres'),
  signature: z.string().max(500, 'Máximo 500 caracteres'),
  active: z.boolean(),
});
export type BrandValues = z.infer<typeof brandSchema>;

export const ASPECT_RATIOS = ['SQUARE', 'PORTRAIT', 'LANDSCAPE'] as const;
export const FIT_MODES = ['CROP', 'PAD'] as const;
export const IG_CAPTION_LIMIT = 2200;
export const MAX_IMAGES = 10;
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

/** Cuenta caracteres como la API: un emoji vale 1. */
export function countChars(text: string): number {
  return Array.from(text).length;
}

export const composerSchema = z
  .object({
    caption: z
      .string()
      .max(10000, 'El texto es demasiado largo (máximo 10.000 caracteres)'),
    aspectRatio: z.enum(ASPECT_RATIOS),
    fitMode: z.enum(FIT_MODES),
    date: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, 'La fecha no es válida'),
    time: z.string().regex(/^(\d{2}:\d{2})?$/, 'La hora no es válida'),
  })
  .superRefine((value, ctx) => {
    if (value.date && !value.time) {
      ctx.addIssue({
        code: 'custom',
        path: ['time'],
        message: 'Falta la hora',
      });
    }
    if (value.time && !value.date) {
      ctx.addIssue({
        code: 'custom',
        path: ['date'],
        message: 'Falta la fecha',
      });
    }
  });
export type ComposerValues = z.infer<typeof composerSchema>;
