import { ServiceUnavailableException } from '@nestjs/common';

export class ThreadsNotConfiguredException extends ServiceUnavailableException {
  constructor() {
    super(
      'Threads no está configurado: faltan THREADS_APP_ID, THREADS_APP_SECRET y THREADS_REDIRECT_URI en el .env',
    );
  }
}
