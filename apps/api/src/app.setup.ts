import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import type { Env } from './config/env.js';

/** Configuracion HTTP compartida por main.ts y los tests e2e, para que prueben lo mismo que corre. */
export function configureApp(app: NestExpressApplication, env: Env): void {
  app.disable('x-powered-by');
  app.use(cookieParser());
  app.enableCors({ origin: env.WEB_ORIGIN, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}
