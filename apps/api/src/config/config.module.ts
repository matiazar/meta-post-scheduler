import { Global, Module } from '@nestjs/common';
import { parseEnv } from './env.js';
import { loadEnvFile } from './load-env-file.js';

export const ENV = 'ENV';

@Global()
@Module({
  providers: [
    {
      provide: ENV,
      useFactory: () => {
        loadEnvFile();
        return parseEnv(process.env);
      },
    },
  ],
  exports: [ENV],
})
export class ConfigModule {}
