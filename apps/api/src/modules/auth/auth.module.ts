import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { SESSION_TTL_SECONDS } from './auth.constants.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { LoginThrottleService } from './login-throttle.service.js';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        secret: env.JWT_SECRET,
        signOptions: { algorithm: 'HS256', expiresIn: SESSION_TTL_SECONDS },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    LoginThrottleService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AuthModule {}
