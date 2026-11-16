import { Module } from '@nestjs/common';
import { QueueModule } from './common/queue.module.js';
import { ConfigModule } from './config/config.module.js';
import { ErrorsModule } from './modules/errors/errors.module.js';
import { MailProcessorModule } from './modules/mail/mail-processor.module.js';
import { PrismaModule } from './modules/prisma/prisma.module.js';

/** Proceso worker: consume colas. Se suman tick y processors de publicacion en la etapa 6. */
@Module({
  imports: [
    ConfigModule,
    QueueModule,
    PrismaModule,
    ErrorsModule,
    MailProcessorModule,
  ],
})
export class WorkerModule {}
