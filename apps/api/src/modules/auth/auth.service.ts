import { createHash, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare } from 'bcryptjs';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import type { SessionUser } from './auth.constants.js';
import {
  InvalidCredentialsException,
  SessionRequiredException,
} from './auth.exceptions.js';
import { LoginThrottleService } from './login-throttle.service.js';

function safeEqual(a: string, b: string): boolean {
  const hashA = createHash('sha256').update(a).digest();
  const hashB = createHash('sha256').update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly throttle: LoginThrottleService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Valida email y contraseña del admin y devuelve el token de sesion. */
  async login(
    email: string,
    password: string,
    clientKey: string,
  ): Promise<{ token: string; email: string }> {
    // Cuenta el intento antes de esperar a bcrypt: las peticiones en paralelo tambien cuentan
    this.throttle.registerAttempt(clientKey);

    // Siempre se compara la contraseña, aunque el email no coincida: mismo tiempo de respuesta
    const emailOk = safeEqual(
      email.trim().toLowerCase(),
      this.env.ADMIN_EMAIL.toLowerCase(),
    );
    const passwordOk = await compare(password, this.env.ADMIN_PASSWORD_HASH);

    if (!emailOk || !passwordOk) {
      throw new InvalidCredentialsException();
    }
    this.throttle.reset(clientKey);
    const adminEmail = this.env.ADMIN_EMAIL;
    return {
      token: await this.jwt.signAsync({ sub: adminEmail }),
      email: adminEmail,
    };
  }

  /** Verifica el token de la cookie. Lanza si falta, esta vencido o fue alterado. */
  async verifySession(token: string): Promise<SessionUser> {
    let payload: { sub?: unknown };
    try {
      payload = await this.jwt.verifyAsync<{ sub?: unknown }>(token);
    } catch {
      // Token vencido, alterado o malformado: para el usuario es "sin sesion"
      throw new SessionRequiredException();
    }
    if (
      typeof payload.sub !== 'string' ||
      payload.sub !== this.env.ADMIN_EMAIL
    ) {
      throw new SessionRequiredException();
    }
    return { email: payload.sub };
  }
}
