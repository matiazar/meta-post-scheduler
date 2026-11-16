import { Injectable } from '@nestjs/common';
import { TooManyLoginAttemptsException } from './auth.exceptions.js';

export const MAX_FAILED_LOGINS = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_TRACKED_KEYS = 1000;

interface Entry {
  count: number;
  firstAt: number;
}

/**
 * Limita intentos fallidos de login por clave (IP): 5 fallos cada 15 minutos.
 * En memoria: se reinicia con la API, suficiente para un panel de un solo usuario.
 */
@Injectable()
export class LoginThrottleService {
  private readonly entries = new Map<string, Entry>();

  assertAllowed(key: string, now: number = Date.now()): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    if (now - entry.firstAt >= LOGIN_WINDOW_MS) {
      this.entries.delete(key);
      return;
    }
    if (entry.count >= MAX_FAILED_LOGINS) {
      throw new TooManyLoginAttemptsException(
        Math.ceil((entry.firstAt + LOGIN_WINDOW_MS - now) / 1000),
      );
    }
  }

  recordFailure(key: string, now: number = Date.now()): void {
    const entry = this.entries.get(key);
    if (!entry || now - entry.firstAt >= LOGIN_WINDOW_MS) {
      this.prune(now);
      this.entries.set(key, { count: 1, firstAt: now });
      return;
    }
    entry.count += 1;
  }

  reset(key: string): void {
    this.entries.delete(key);
  }

  private prune(now: number): void {
    if (this.entries.size < MAX_TRACKED_KEYS) return;
    for (const [key, entry] of this.entries) {
      if (now - entry.firstAt >= LOGIN_WINDOW_MS) this.entries.delete(key);
    }
  }
}
