import Anthropic from '@anthropic-ai/sdk';
import { Module } from '@nestjs/common';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { BrandsModule } from '../brands/brands.module.js';
import { MediaModule } from '../media/media.module.js';
import { AiClient, ANTHROPIC_CLIENT } from './ai.client.js';
import { AiController } from './ai.controller.js';
import { AiService } from './ai.service.js';

@Module({
  imports: [BrandsModule, MediaModule],
  controllers: [AiController],
  providers: [
    {
      provide: ANTHROPIC_CLIENT,
      inject: [ENV],
      // Sin key no hay cliente: la API arranca y el endpoint responde 503
      useFactory: (env: Env) =>
        env.ANTHROPIC_API_KEY
          ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2 })
          : null,
    },
    AiClient,
    AiService,
  ],
})
export class AiModule {}
