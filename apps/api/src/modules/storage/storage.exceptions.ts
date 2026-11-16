import { ServiceUnavailableException } from '@nestjs/common';

/** R2 no respondio o rechazo la operacion. 503: es un fallo externo esperado, no un bug (no se reporta por mail). */
export class StorageException extends ServiceUnavailableException {
  constructor(action: string) {
    super(
      `No se pudo ${action} la imagen en el almacenamiento. Probá de nuevo`,
    );
  }
}
