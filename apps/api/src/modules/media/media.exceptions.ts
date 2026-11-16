import { BadRequestException, NotFoundException } from '@nestjs/common';

export class UnsupportedImageException extends BadRequestException {
  constructor(filename: string, reason: string) {
    super(`"${filename}": ${reason}`);
  }
}

export class NoFilesException extends BadRequestException {
  constructor() {
    super('No se recibió ninguna imagen');
  }
}

export class MediaNotFoundException extends NotFoundException {
  constructor() {
    super('La imagen no existe');
  }
}
