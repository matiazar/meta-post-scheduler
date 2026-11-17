import type { Tone } from '@/components/ui/badge';
import type { Network } from '@/lib/api/resources';

/** Datos de cada red en un solo lugar: sumar una red es sumar una fila en cada tabla. */
export const NETWORKS: Network[] = ['FACEBOOK', 'INSTAGRAM', 'THREADS'];

export const NETWORK_LABEL: Record<Network, string> = {
  FACEBOOK: 'Facebook',
  INSTAGRAM: 'Instagram',
  THREADS: 'Threads',
};

export const NETWORK_SHORT: Record<Network, string> = {
  FACEBOOK: 'FB',
  INSTAGRAM: 'IG',
  THREADS: 'TH',
};

export const NETWORK_TONE: Record<Network, Tone> = {
  FACEBOOK: 'info',
  INSTAGRAM: 'orange',
  THREADS: 'neutral',
};

/** Tope de caracteres del texto por red (null = sin tope propio). Igual que en la API. */
export const CAPTION_LIMITS: Record<Network, number | null> = {
  FACEBOOK: null,
  INSTAGRAM: 2200,
  THREADS: 500,
};

/** Cuenta caracteres como la API: un emoji vale 1. */
export function countChars(text: string): number {
  return Array.from(text).length;
}

/** Threads cuenta los emojis como sus bytes UTF-8 (un emoji vale hasta 4). */
export function countThreadsChars(text: string): number {
  let total = 0;
  for (const char of text) {
    total += /\p{Extended_Pictographic}/u.test(char)
      ? new TextEncoder().encode(char).length
      : 1;
  }
  return total;
}

/** Largo del texto segun como lo cuenta cada red. */
export function captionLength(network: Network, text: string): number {
  return network === 'THREADS' ? countThreadsChars(text) : countChars(text);
}
