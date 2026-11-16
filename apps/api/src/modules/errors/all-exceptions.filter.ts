import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { redactString } from '../../common/redact.js';
import { ErrorReporterService } from './error-reporter.service.js';

/**
 * Filtro global. Los HttpException (validacion, 401, 404 y excepciones de negocio) se
 * responden con su status; solo se reportan los 5xx (salvo 503 intencional). Todo lo que
 * no es HttpException es un 500 generico para el usuario y se reporta con el detalle tecnico.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly reporter: ErrorReporterService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      // 503 es una señal intencional (ej. /health con un componente caido), no un bug
      if (status >= 500 && status !== 503) {
        void this.reporter.report(exception, {
          method: request.method,
          url: request.originalUrl,
        });
      }
      response.status(status).json(exception.getResponse());
      return;
    }

    const message =
      exception instanceof Error ? exception.message : String(exception);
    this.logger.error(redactString(message));
    void this.reporter.report(exception, {
      method: request.method,
      url: request.originalUrl,
    });

    response
      .status(500)
      .json({ statusCode: 500, message: 'Error interno del servidor' });
  }
}
