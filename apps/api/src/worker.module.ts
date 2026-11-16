import { Module } from '@nestjs/common';
import { QueueModule } from './common/queue.module.js';
import { ConfigModule } from './config/config.module.js';
import { ErrorsModule } from './modules/errors/errors.module.js';
import { MailProcessorModule } from './modules/mail/mail-processor.module.js';
import { PrismaModule } from './modules/prisma/prisma.module.js';
import { PublisherModule } from './modules/publisher/publisher.module.js';

/** Proceso worker: consume las colas de mails y de publicacion (tick + publish). */
@Module({
  imports: [
    ConfigModule,
    QueueModule,
    PrismaModule,
    ErrorsModule,
    MailProcessorModule,
    PublisherModule,
  ],
})
export class WorkerModule {}
