import { Module } from '@nestjs/common';
import { CryptoModule } from '../crypto/crypto.module.js';
import { MailModule } from '../mail/mail.module.js';
import { ConnectionsService } from './connections.service.js';

@Module({
  imports: [CryptoModule, MailModule],
  providers: [ConnectionsService],
  exports: [ConnectionsService],
})
export class ConnectionsModule {}
