import { Module } from '@nestjs/common';
import { CryptoModule } from '../crypto/crypto.module.js';
import { MailModule } from '../mail/mail.module.js';
import { MetaController } from './meta.controller.js';
import { MetaGraphClient } from './meta-graph.client.js';
import { MetaService } from './meta.service.js';

@Module({
  imports: [CryptoModule, MailModule],
  controllers: [MetaController],
  providers: [MetaGraphClient, MetaService],
  exports: [MetaGraphClient, MetaService],
})
export class MetaModule {}
