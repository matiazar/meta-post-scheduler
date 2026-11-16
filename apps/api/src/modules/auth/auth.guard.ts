import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import {
  IS_PUBLIC_KEY,
  SESSION_COOKIE,
  type SessionUser,
} from './auth.constants.js';
import { SessionRequiredException } from './auth.exceptions.js';
import { AuthService } from './auth.service.js';

export type AuthenticatedRequest = Request & { user?: SessionUser };

/** Guard global: toda ruta exige sesion valida salvo las marcadas con @Public(). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token: unknown = request.cookies?.[SESSION_COOKIE];
    if (typeof token !== 'string' || token.length === 0) {
      throw new SessionRequiredException();
    }
    request.user = await this.auth.verifySession(token);
    return true;
  }
}
