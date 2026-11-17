import { Inject, Injectable } from '@nestjs/common';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { MetaGraphClient } from './meta-graph.client.js';

/**
 * Unico punto de acceso a la API de Threads (DEC-013). Es otro host que la Graph API de
 * Facebook, pero habla igual y falla igual: reutiliza el fetch con timeout y el mapeo de
 * errores. Los paths llevan la version (`/v1.0/...`) salvo los de OAuth (`/oauth/...`).
 */
@Injectable()
export class ThreadsGraphClient extends MetaGraphClient {
  constructor(@Inject(ENV) env: Env) {
    super(env);
    this.baseUrl = 'https://graph.threads.com';
  }
}
