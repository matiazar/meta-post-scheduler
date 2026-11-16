import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { redisConnectionFromUrl } from './redis-connection.js';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        connection: redisConnectionFromUrl(env.REDIS_URL),
      }),
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
