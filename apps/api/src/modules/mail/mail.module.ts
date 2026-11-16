import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MAIL_QUEUE, MailService } from './mail.service.js';

/** Cola y servicio para encolar mails. Lo usan la API y el worker. */
@Module({
  imports: [BullModule.registerQueue({ name: MAIL_QUEUE })],
  providers: [MailService],
  exports: [MailService, BullModule],
})
export class MailModule {}
