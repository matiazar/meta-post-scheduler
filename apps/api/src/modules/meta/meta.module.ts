import { Module } from '@nestjs/common';
import { ConnectionsModule } from '../connections/connections.module.js';
import { CryptoModule } from '../crypto/crypto.module.js';
import { MetaController } from './meta.controller.js';
import { MetaGraphClient } from './meta-graph.client.js';
import { MetaService } from './meta.service.js';
import { ThreadsGraphClient } from './threads-graph.client.js';

@Module({
  imports: [CryptoModule, ConnectionsModule],
  controllers: [MetaController],
  providers: [MetaGraphClient, ThreadsGraphClient, MetaService],
  exports: [MetaGraphClient, ThreadsGraphClient, MetaService],
})
export class MetaModule {}
