import { Module } from '@nestjs/common';
import { CryptoModule } from '../crypto/crypto.module.js';
import { MailModule } from '../mail/mail.module.js';
import { MetaModule } from '../meta/meta.module.js';
import { ThreadsController } from './threads.controller.js';
import { ThreadsService } from './threads.service.js';

@Module({
  imports: [CryptoModule, MailModule, MetaModule],
  controllers: [ThreadsController],
  providers: [ThreadsService],
  exports: [ThreadsService],
})
export class ThreadsModule {}
