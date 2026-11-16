import { Module } from '@nestjs/common';
import { QueueModule } from './common/queue.module.js';
import { ConfigModule } from './config/config.module.js';
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
  ],
})
export class AppModule {}
