import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

export class BrandNotFoundException extends NotFoundException {
  constructor() {
    super('La marca no existe');
  }
}

export class SocialAccountNotFoundException extends NotFoundException {
  constructor() {
    super('La cuenta social no existe');
  }
}

export class BrandSlugTakenException extends ConflictException {
  constructor(slug: string) {
    super(`Ya existe una marca con el identificador "${slug}"`);
  }
}

export class BrandHasPostsException extends ConflictException {
  constructor() {
    super(
      'La marca tiene posts y no se puede eliminar. Desactivala en su lugar',
    );
  }
}

export class InvalidBrandSlugException extends BadRequestException {
  constructor() {
    super(
      'No se pudo generar un identificador a partir del nombre. Indicá uno con letras y números',
    );
  }
}
