import { Prisma } from '../generated/prisma/client.js';

/** true si el error es un error conocido de Prisma con ese codigo (P2002 unico, P2025 no existe, P2003 FK). */
export function isPrismaError(error: unknown, code: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
  );
}
