/** El dato cifrado esta corrupto, fue alterado o se cifro con otra clave. No incluye el contenido. */
export class DecryptionFailedException extends Error {
  constructor() {
    super('No se pudo descifrar el dato: corrupto, alterado o clave distinta');
    this.name = 'DecryptionFailedException';
  }
}
