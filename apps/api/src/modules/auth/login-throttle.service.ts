import { Injectable } from '@nestjs/common';
import { TooManyLoginAttemptsException } from './auth.exceptions.js';

export const MAX_FAILED_LOGINS = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const MAX_TRACKED_KEYS = 1000;

interface Entry {
  count: number;
  firstAt: number;
}

/**
 * Limita los intentos de login por clave (IP): 5 intentos cada 15 minutos.
 * El intento se cuenta ANTES de verificar la contrasena (que es lenta), asi las
 * peticiones en paralelo no pueden pasar todas el chequeo a la vez. Un login correcto
 * borra el contador (`reset`). En memoria: se reinicia con la API, suficiente para
 * un panel de un solo usuario. El mapa tiene un tope fijo de claves.
 */
@Injectable()
export class LoginThrottleService {
  private readonly entries = new Map<string, Entry>();

  get trackedKeys(): number {
    return this.entries.size;
  }

  /** Cuenta un intento. Lanza si la clave ya agoto sus intentos en la ventana. */
  registerAttempt(key: string, now: number = Date.now()): void {
    const entry = this.entries.get(key);
    if (!entry || now - entry.firstAt >= LOGIN_WINDOW_MS) {
      this.makeRoom(now);
      this.entries.set(key, { count: 1, firstAt: now });
      return;
    }
    if (entry.count >= MAX_FAILED_LOGINS) {
      throw new TooManyLoginAttemptsException(
        Math.ceil((entry.firstAt + LOGIN_WINDOW_MS - now) / 1000),
      );
    }
    entry.count += 1;
  }

  reset(key: string): void {
    this.entries.delete(key);
  }

  private makeRoom(now: number): void {
    if (this.entries.size < MAX_TRACKED_KEYS) return;
    for (const [key, entry] of this.entries) {
      if (now - entry.firstAt >= LOGIN_WINDOW_MS) this.entries.delete(key);
    }
    // Tope duro: si siguen todas vigentes, se descarta la mas antigua (orden de insercion)
    while (this.entries.size >= MAX_TRACKED_KEYS) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
  }
}
