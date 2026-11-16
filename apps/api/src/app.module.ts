import { Module } from '@nestjs/common';
import { AuthModule } from './modules/auth/auth.module.js';
import { QueueModule } from './common/queue.module.js';
import { ConfigModule } from './config/config.module.js';
import { BrandsModule } from './modules/brands/brands.module.js';
import { CryptoModule } from './modules/crypto/crypto.module.js';
import { ErrorsModule } from './modules/errors/errors.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { MailModule } from './modules/mail/mail.module.js';
import { PrismaModule } from './modules/prisma/prisma.module.js';

@Module({
  imports: [
    ConfigModule,
    QueueModule,
    PrismaModule,
    MailModule,
    ErrorsModule,
    HealthModule,
    AuthModule,
    CryptoModule,
    BrandsModule,
  ],
})
export class AppModule {}
