import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PUBLISH_QUEUE } from '../publisher/publisher.constants.js';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

@Module({
  imports: [BullModule.registerQueue({ name: PUBLISH_QUEUE })],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
