/**
 * Errores internos del publicador (no salen por HTTP: los atrapa PublishService
 * y decide si el destino se reintenta o queda FAILED).
 */

/** Reintentar no sirve: imagen faltante, cuenta sin token, rechazo definitivo de Meta. */
export class PublishPermanentError extends Error {
  constructor(
    message: string,
    readonly code: string | null = null,
  ) {
    super(message);
    this.name = 'PublishPermanentError';
  }
}

/** Fallo pasajero: se reintenta con espera (container con error, demora de Meta...). */
export class PublishTransientError extends Error {
  constructor(
    message: string,
    readonly code: string | null = null,
  ) {
    super(message);
    this.name = 'PublishTransientError';
  }
}

/**
 * Facebook no respondio al publicar: no se sabe si el post salio. Reintentar podria
 * duplicarlo, por eso el destino queda FAILED para revisar a mano en la Pagina.
 */
export class PublishOutcomeUnknownError extends Error {
  constructor() {
    super(
      'Meta no respondió al publicar y no se sabe si el post salió. Revisá manualmente en la Página',
    );
    this.name = 'PublishOutcomeUnknownError';
  }
}
