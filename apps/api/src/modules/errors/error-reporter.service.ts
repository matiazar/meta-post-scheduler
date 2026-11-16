import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { redact, redactString } from '../../common/redact.js';
import { MailService } from '../mail/mail.service.js';

const THROTTLE_MS = 10 * 60 * 1000;
const MAX_SIGNATURES = 500;

/**
 * Reporta errores no controlados por mail al admin.
 * Solo en produccion. Redacta tokens, aplica throttle por firma de error y
 * nunca lanza: si el reporte falla, se loguea y la app sigue.
 */
@Injectable()
export class ErrorReporterService {
  private readonly logger = new Logger(ErrorReporterService.name);
  private readonly lastSent = new Map<string, number>();

  constructor(
    private readonly mail: MailService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async report(
    error: unknown,
    context: Record<string, unknown> = {},
    now: number = Date.now(),
  ): Promise<void> {
    if (this.env.NODE_ENV !== 'production') return;
    let signature: string | undefined;
    try {
      const err = error instanceof Error ? error : new Error(String(error));
      const stack = redactString(err.stack ?? err.message);
      // Firma sin el mensaje (puede traer ids variables): nombre + primer frame
      const firstFrame = stack
        .split('\n')
        .find((line) => line.trim().startsWith('at '));
      signature = `${err.name}|${firstFrame?.trim() ?? ''}`;
      if (this.isThrottled(signature, now)) return;

      const subject =
        `[social-publisher] ${err.name}: ${redactString(err.message)}`.slice(
          0,
          200,
        );
      const body = `${stack}\n\nContexto:\n${JSON.stringify(redact(context), null, 2)}`;
      await this.mail.notifyAdmin(subject, body);
    } catch (reportError) {
      // No se pudo encolar: liberar la firma para que el proximo intento si reporte
      if (signature !== undefined) this.lastSent.delete(signature);
      const message =
        reportError instanceof Error
          ? reportError.message
          : String(reportError);
      this.logger.error(
        `No se pudo reportar el error: ${redactString(message)}`,
      );
    }
  }

  private isThrottled(signature: string, now: number): boolean {
    const last = this.lastSent.get(signature);
    if (last !== undefined && now - last < THROTTLE_MS) return true;
    if (this.lastSent.size >= MAX_SIGNATURES) {
      for (const [key, time] of this.lastSent) {
        if (now - time >= THROTTLE_MS) this.lastSent.delete(key);
      }
    }
    this.lastSent.set(signature, now);
    return false;
  }
}
