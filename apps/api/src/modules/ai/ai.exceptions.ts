import {
  BadGatewayException,
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';

/** Falta ANTHROPIC_API_KEY: la API funciona, solo esta funcion queda apagada. */
export class AiNotConfiguredException extends ServiceUnavailableException {
  constructor() {
    super('La IA no está configurada. Falta la clave de Anthropic en el servidor');
  }
}

/** Fallo de red, de cuota o del proveedor. El detalle no sale (puede traer datos de la cuenta). */
export class AiRequestFailedException extends BadGatewayException {
  constructor() {
    super('No se pudo generar el texto. Probá de nuevo en un momento');
  }
}

/** El modelo rechazo el pedido por sus reglas de seguridad. */
export class AiRefusedException extends UnprocessableEntityException {
  constructor() {
    super('La IA no pudo generar texto para estas imágenes. Escribilo a mano');
  }
}

/** La respuesta no tiene la forma pedida (texto vacio, JSON roto, etc.). */
export class AiBadResponseException extends BadGatewayException {
  constructor() {
    super('La IA devolvió una respuesta que no se pudo usar. Probá de nuevo');
  }
}

export class AiRateLimitedException extends HttpException {
  constructor() {
    super(
      'Pediste muchos textos seguidos. Esperá un minuto y probá de nuevo',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
