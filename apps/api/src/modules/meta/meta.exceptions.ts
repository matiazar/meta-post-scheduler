import { ConflictException, BadRequestException } from '@nestjs/common';

/** Error devuelto por la Graph API (o fallo de red). Nunca incluye tokens ni la URL pedida. */
export class MetaApiException extends Error {
  constructor(
    message: string,
    readonly code: number | null,
    readonly subcode: number | null,
    readonly isTransient: boolean,
    /** Limite diario de IG: no consume intentos (se reintenta mas tarde) */
    readonly isDailyLimit = false,
    readonly httpStatus: number | null = null,
  ) {
    super(message);
    this.name = 'MetaApiException';
  }
}

export class MetaConnectionInvalidException extends ConflictException {
  constructor() {
    super(
      'La conexión con Meta no está activa. Reconectá desde Ajustes > Meta',
    );
  }
}

export class AccountWithoutTokenException extends ConflictException {
  constructor() {
    super(
      'La cuenta no tiene un token disponible. Sincronizá con Meta o reconectá',
    );
  }
}

export class OAuthStateInvalidException extends BadRequestException {
  constructor() {
    super('La solicitud de conexión no es válida o venció. Intentá de nuevo');
  }
}
