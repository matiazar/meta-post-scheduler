export class InvalidEnvException extends Error {
  constructor(readonly variables: string[]) {
    super(
      `Variables de entorno invalidas o faltantes: ${variables.join(', ')}. Revisar .env contra .env.example`,
    );
    this.name = 'InvalidEnvException';
  }
}
