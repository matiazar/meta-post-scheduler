import { S3Client } from '@aws-sdk/client-s3';
import { Module } from '@nestjs/common';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { S3_CLIENT, StorageService } from './storage.service.js';

@Module({
  providers: [
    {
      provide: S3_CLIENT,
      inject: [ENV],
      useFactory: (env: Env) =>
        new S3Client({
          region: 'auto',
          endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
          credentials: {
            accessKeyId: env.R2_ACCESS_KEY_ID,
            secretAccessKey: env.R2_SECRET_ACCESS_KEY,
          },
        }),
    },
    StorageService,
  ],
  exports: [StorageService],
})
export class StorageModule {}
