import type { Network } from '../generated/prisma/enums.js';

/**
 * Maximo de caracteres del texto por red (null = sin tope propio que validar).
 * Vive en common porque lo usan posts (validar al programar) y el publisher.
 */
export const CAPTION_LIMITS: Record<Network, number | null> = {
  FACEBOOK: null,
  INSTAGRAM: 2200,
  THREADS: 500,
};

/** Nombre de cada red para mensajes al usuario */
export const NETWORK_NAMES: Record<Network, string> = {
  FACEBOOK: 'Facebook',
  INSTAGRAM: 'Instagram',
  THREADS: 'Threads',
};

/** Cuenta caracteres como la API: un emoji vale 1. */
export function countChars(text: string): number {
  return Array.from(text).length;
}

/**
 * Threads cuenta los emojis como sus bytes UTF-8 (un emoji vale hasta 4). Se cuenta asi
 * para no aceptar un texto que Threads despues rechace.
 */
export function countThreadsChars(text: string): number {
  let total = 0;
  for (const char of text) {
    total += /\p{Extended_Pictographic}/u.test(char)
      ? Buffer.byteLength(char, 'utf8')
      : 1;
  }
  return total;
}

/** Largo del texto segun como lo cuenta cada red. */
export function captionLength(network: Network, text: string): number {
  return network === 'THREADS' ? countThreadsChars(text) : countChars(text);
}
