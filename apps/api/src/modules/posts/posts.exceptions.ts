import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

export class PostNotFoundException extends NotFoundException {
  constructor() {
    super('El post no existe');
  }
}

/** Ya se publico, se esta publicando o se cancelo: no se puede modificar. */
export class PostNotEditableException extends ConflictException {
  constructor() {
    super(
      'El post ya no se puede modificar porque está publicándose, se publicó o se canceló',
    );
  }
}

/** Accion (cancelar, reintentar, eliminar...) que no corresponde al estado actual. */
export class PostActionNotAllowedException extends ConflictException {
  constructor(message: string) {
    super(message);
  }
}

export class ScheduledAtInPastException extends BadRequestException {
  constructor() {
    super('La fecha de publicación tiene que ser futura');
  }
}

export class TargetNotInBrandException extends BadRequestException {
  constructor() {
    super(
      'Todas las cuentas elegidas tienen que pertenecer a la marca del post',
    );
  }
}

export class CarouselSizeException extends BadRequestException {
  constructor() {
    super('Un post admite entre 1 y 10 imágenes');
  }
}

export class CaptionTooLongException extends BadRequestException {
  constructor(limit: number) {
    super(`El texto para Instagram supera el máximo de ${limit} caracteres`);
  }
}

export class UnknownMediaException extends BadRequestException {
  constructor() {
    super('Alguna de las imágenes indicadas no existe');
  }
}

/** Falta algo para poder programar (imagen, cuenta o fecha) o hay datos repetidos. */
export class InvalidPostException extends BadRequestException {
  constructor(message: string) {
    super(message);
  }
}
