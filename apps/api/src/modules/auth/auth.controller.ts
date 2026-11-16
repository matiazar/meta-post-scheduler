import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { CookieOptions, Response } from 'express';
import { clientKeyFromIp } from '../../common/client-key.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { SESSION_COOKIE, SESSION_TTL_SECONDS } from './auth.constants.js';
import { SessionRequiredException } from './auth.exceptions.js';
import type { AuthenticatedRequest } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { Public } from './public.decorator.js';

@Controller('auth')
export class AuthController {
  private readonly cookieOptions: CookieOptions;

  constructor(
    private readonly auth: AuthService,
    @Inject(ENV) env: Env,
  ) {
    this.cookieOptions = {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
      path: '/',
    };
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ email: string }> {
    const { token, email } = await this.auth.login(
      dto.email,
      dto.password,
      clientKeyFromIp(req.ip),
    );
    res.cookie(SESSION_COOKIE, token, {
      ...this.cookieOptions,
      maxAge: SESSION_TTL_SECONDS * 1000,
    });
    return { email };
  }

  /** Publica a proposito: quien tiene la sesion vencida igual puede limpiar su cookie. */
  @Public()
  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response): void {
    res.clearCookie(SESSION_COOKIE, this.cookieOptions);
  }

  @Get('me')
  me(@Req() req: AuthenticatedRequest): { email: string } {
    if (!req.user) throw new SessionRequiredException();
    return { email: req.user.email };
  }
}
