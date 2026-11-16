import {
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';

export class InvalidCredentialsException extends UnauthorizedException {
  constructor() {
    // Mismo mensaje para email o contraseña incorrectos: no revela cual fallo
    super('Email o contraseña incorrectos');
  }
}

export class SessionRequiredException extends UnauthorizedException {
  constructor() {
    super('Sesión requerida');
  }
}

export class TooManyLoginAttemptsException extends HttpException {
  constructor(readonly retryAfterSeconds: number) {
    super(
      `Demasiados intentos fallidos. Probá de nuevo en ${Math.ceil(retryAfterSeconds / 60)} minutos`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
