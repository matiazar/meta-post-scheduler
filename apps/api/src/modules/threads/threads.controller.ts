import {
  Controller,
  Get,
  Inject,
  Logger,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { Public } from '../auth/public.decorator.js';
import { OAuthStateInvalidException } from '../meta/meta.exceptions.js';
import { verifyOAuthState } from '../meta/oauth-state.js';
import { ThreadsService, type ThreadsStatusItem } from './threads.service.js';

export const THREADS_OAUTH_COOKIE = 'sp_threads_oauth_state';

@Controller('threads')
export class ThreadsController {
  private readonly logger = new Logger(ThreadsController.name);
  private readonly cookieOptions: CookieOptions;

  constructor(
    private readonly threads: ThreadsService,
    @Inject(ENV) private readonly env: Env,
  ) {
    this.cookieOptions = {
      httpOnly: true,
      // Lax: el callback llega por una navegacion de Threads hacia la API
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
      path: '/threads',
    };
  }

  @Get('status')
  async status(): Promise<{
    configured: boolean;
    connections: ThreadsStatusItem[];
  }> {
    return {
      configured: this.threads.configured,
      connections: await this.threads.status(),
    };
  }

  /** Devuelve la URL de Threads; la web navega a ella. Requiere sesion. */
  @Get('connect-url')
  connectUrl(@Res({ passthrough: true }) res: Response): { url: string } {
    const { url, nonce } = this.threads.buildAuthUrl();
    res.cookie(THREADS_OAUTH_COOKIE, nonce, {
      ...this.cookieOptions,
      maxAge: 10 * 60 * 1000,
    });
    return { url };
  }

  /**
   * Publico a proposito (lo llama el navegador al volver de Threads). Se protege
   * con el `state` firmado + la cookie del navegador que inicio la conexion.
   */
  @Public()
  @Get('callback')
  async callback(
    @Query() query: Record<string, unknown>,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const str = (v: unknown): string | undefined =>
      typeof v === 'string' && v.length > 0 && v.length <= 2048 ? v : undefined;
    const state = str(query.state);
    const code = str(query.code);
    const cookies = req.cookies as Record<string, string | undefined>;
    const valid =
      state !== undefined &&
      verifyOAuthState(
        this.env.JWT_SECRET,
        state,
        cookies[THREADS_OAUTH_COOKIE],
      );
    // La cookie vale una sola vez
    res.clearCookie(THREADS_OAUTH_COOKIE, this.cookieOptions);
    if (!valid) throw new OAuthStateInvalidException();

    const back = (status: string): void =>
      res.redirect(`${this.env.WEB_ORIGIN}/settings/threads?status=${status}`);

    if (query.error !== undefined || !code) {
      back('denied');
      return;
    }
    try {
      await this.threads.connect(code);
      back('ok');
    } catch (error) {
      this.logger.error(
        `Fallo la conexion con Threads: ${error instanceof Error ? error.message : 'error'}`,
      );
      back('error');
    }
  }
}
