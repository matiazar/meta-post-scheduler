export interface PublishInput {
  /** Id del PostTarget (el IG guarda ahi su container) */
  targetId: string;
  /** Id de la Pagina (FB) o del usuario IG Business */
  accountExternalId: string;
  caption: string;
  /** URLs publicas de las imagenes ya procesadas, en orden */
  imageUrls: string[];
  token: string;
}

export interface InstagramPublishInput extends PublishInput {
  /** Container creado en un intento anterior (proteccion contra doble publicacion) */
  igContainerId: string | null;
  /** Cuando arranco el intento anterior: sirve para reconocer un post ya publicado */
  previousStartedAt: Date | null;
}

export interface PublishResult {
  externalId: string | null;
  permalink: string | null;
  /** IG dijo PUBLISHED pero no se encontro el post: hay que avisar para revisar a mano */
  unverified?: boolean;
}
