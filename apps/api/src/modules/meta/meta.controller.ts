import {
  Controller,
  Get,
  HttpCode,
  Inject,
  Logger,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { Public } from '../auth/public.decorator.js';
import { OAuthStateInvalidException } from './meta.exceptions.js';
import {
  MetaService,
  type MetaStatus,
  type SyncResult,
} from './meta.service.js';
import { verifyOAuthState } from './oauth-state.js';

export const OAUTH_COOKIE = 'sp_oauth_state';

@Controller('meta')
export class MetaController {
  private readonly logger = new Logger(MetaController.name);
  private readonly cookieOptions: CookieOptions;

  constructor(
    private readonly meta: MetaService,
    @Inject(ENV) private readonly env: Env,
  ) {
    this.cookieOptions = {
      httpOnly: true,
      // Lax: el callback llega por una navegacion de Facebook hacia la API
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
      path: '/meta',
    };
  }

  @Get('status')
  status(): Promise<MetaStatus> {
    return this.meta.status();
  }

  /** Devuelve la URL de Facebook; la web navega a ella. Requiere sesion. */
  @Get('connect-url')
  connectUrl(@Res({ passthrough: true }) res: Response): { url: string } {
    const { url, nonce } = this.meta.buildAuthUrl();
    res.cookie(OAUTH_COOKIE, nonce, {
      ...this.cookieOptions,
      maxAge: 10 * 60 * 1000,
    });
    return { url };
  }

  @Post('sync')
  @HttpCode(200)
  sync(): Promise<SyncResult> {
    return this.meta.sync();
  }

  /**
   * Publico a proposito (lo llama el navegador al volver de Facebook). Se protege
   * con el `state` firmado + la cookie del navegador que inicio la conexion.
   */
  @Public()
  @Get('callback')
  async callback(
    @Query() query: Record<string, unknown>,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    // Facebook agrega parametros variables (error_reason, etc.): se leen a mano, sin DTO estricto
    const str = (v: unknown): string | undefined =>
      typeof v === 'string' && v.length > 0 && v.length <= 2048 ? v : undefined;
    const state = str(query.state);
    const code = str(query.code);
    const cookies = req.cookies as Record<string, string | undefined>;
    const valid =
      state !== undefined &&
      verifyOAuthState(this.env.JWT_SECRET, state, cookies[OAUTH_COOKIE]);
    // La cookie vale una sola vez
    res.clearCookie(OAUTH_COOKIE, this.cookieOptions);
    if (!valid) throw new OAuthStateInvalidException();

    const back = (status: string): void =>
      res.redirect(`${this.env.WEB_ORIGIN}/settings/meta?status=${status}`);

    if (query.error !== undefined || !code) {
      // El usuario cancelo el dialogo o Meta rechazo la solicitud
      back('denied');
      return;
    }
    try {
      const result = await this.meta.connect(code);
      back(result.missingPermissions.length > 0 ? 'permissions' : 'ok');
    } catch (error) {
      this.logger.error(
        `Fallo la conexion con Meta: ${error instanceof Error ? error.message : 'error'}`,
      );
      back('error');
    }
  }
}
