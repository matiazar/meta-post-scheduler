import type { SocialAccount } from '../../generated/prisma/client.js';
import type { Network } from '../../generated/prisma/enums.js';

export interface PublishInput {
  /** Id del PostTarget (la red guarda ahi su container para no publicar dos veces) */
  targetId: string;
  /** Id de la cuenta en la red (Pagina de FB, usuario IG Business, usuario de Threads...) */
  accountExternalId: string;
  caption: string;
  /** URLs publicas de las imagenes ya procesadas, en orden */
  imageUrls: string[];
  token: string;
  /** Container creado en un intento anterior (proteccion contra doble publicacion) */
  containerId: string | null;
  /** Cuando arranco el intento anterior: sirve para reconocer un post ya publicado */
  previousStartedAt: Date | null;
}

export interface PublishResult {
  externalId: string | null;
  permalink: string | null;
  /** La red dijo PUBLISHED pero no se encontro el post: hay que avisar para revisar a mano */
  unverified?: boolean;
}

/**
 * Contrato que cumple cada red (DEC-013). PublishService solo habla con esto:
 * agregar una red es sumar una clase que lo implemente, sin tocar el tick ni la cola.
 */
export interface NetworkPublisher {
  readonly network: Network;
  /**
   * Destino colgado en PUBLISHING (el worker murio a mitad): `fail` si la red pudo haber
   * publicado y reintentar duplicaria; `retry` si la red tiene proteccion contra duplicados.
   */
  readonly onHung: 'fail' | 'retry';
  /** Lanza PublishPermanentError si la conexion de esa cuenta no esta activa */
  assertConnected(account: SocialAccount): Promise<void>;
  /** Token con el que se publica en esa cuenta (ya descifrado) */
  tokenFor(account: SocialAccount): Promise<string>;
  /** La red rechazo el token (codigo 190): marca la conexion de esa cuenta como invalida y avisa */
  invalidateConnection(account: SocialAccount): Promise<void>;
  publish(input: PublishInput): Promise<PublishResult>;
}

/** Inyeccion de todas las redes disponibles (multi-provider) */
export const NETWORK_PUBLISHERS = 'NETWORK_PUBLISHERS';
