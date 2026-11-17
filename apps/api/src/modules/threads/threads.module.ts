import { Module } from '@nestjs/common';
import { ConnectionsModule } from '../connections/connections.module.js';
import { MetaModule } from '../meta/meta.module.js';
import { ThreadsController } from './threads.controller.js';
import { ThreadsRefresher } from './threads.refresher.js';
import { ThreadsService } from './threads.service.js';

@Module({
  imports: [ConnectionsModule, MetaModule],
  controllers: [ThreadsController],
  providers: [ThreadsService, ThreadsRefresher],
  exports: [ThreadsService],
})
export class ThreadsModule {}
