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
