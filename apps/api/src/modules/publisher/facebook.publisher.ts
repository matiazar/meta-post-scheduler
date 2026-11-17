import { Injectable, Logger } from '@nestjs/common';
import { MetaApiException } from '../meta/meta.exceptions.js';
import { MetaGraphClient } from '../meta/meta-graph.client.js';
import { MetaService } from '../meta/meta.service.js';
import { MetaNetworkPublisher } from './meta-network.publisher.js';
import { PublishOutcomeUnknownError } from './publisher.exceptions.js';
import type { PublishInput, PublishResult } from './publisher.types.js';

interface PhotoResponse {
  id: string;
  post_id?: string;
}

/** Publica en una Pagina de Facebook: una foto, o un post con varias fotos adjuntas. */
@Injectable()
export class FacebookPublisher extends MetaNetworkPublisher {
  readonly network = 'FACEBOOK' as const;
  /** FB no tiene proteccion contra duplicados: si el worker murio, el post pudo haber salido */
  readonly onHung = 'fail' as const;
  private readonly logger = new Logger(FacebookPublisher.name);

  constructor(
    private readonly graph: MetaGraphClient,
    meta: MetaService,
  ) {
    super(meta);
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    const { accountExternalId: pageId, imageUrls, caption, token } = input;
    let postId: string;

    if (imageUrls.length === 1) {
      postId = await this.finalCall(async () => {
        const res = await this.graph.post<PhotoResponse>(
          `/${pageId}/photos`,
          { url: imageUrls[0], message: caption },
          token,
        );
        return res.post_id ?? res.id;
      });
    } else {
      // Subir las fotos sin publicar es seguro de repetir: si falla alguna, el reintento las vuelve a subir
      const photoIds: string[] = [];
      for (const url of imageUrls) {
        const res = await this.graph.post<PhotoResponse>(
          `/${pageId}/photos`,
          { url, published: false },
          token,
        );
        photoIds.push(res.id);
      }
      const params: Record<string, string> = { message: caption };
      photoIds.forEach((id, i) => {
        params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id });
      });
      postId = await this.finalCall(async () => {
        const res = await this.graph.post<{ id: string }>(
          `/${pageId}/feed`,
          params,
          token,
        );
        return res.id;
      });
    }

    return {
      externalId: postId,
      permalink: await this.permalink(postId, token),
    };
  }

  /**
   * La llamada que de verdad publica: si no hay respuesta (timeout o red), no se sabe
   * si el post salio y reintentar podria duplicarlo.
   */
  private async finalCall(call: () => Promise<string>): Promise<string> {
    try {
      return await call();
    } catch (error) {
      if (
        error instanceof MetaApiException &&
        error.isTransient &&
        error.code === null &&
        error.httpStatus === null
      ) {
        throw new PublishOutcomeUnknownError();
      }
      throw error;
    }
  }

  private async permalink(
    postId: string,
    token: string,
  ): Promise<string | null> {
    try {
      const res = await this.graph.get<{ permalink_url?: string }>(
        `/${postId}`,
        { fields: 'permalink_url' },
        token,
      );
      if (!res.permalink_url) return null;
      return res.permalink_url.startsWith('http')
        ? res.permalink_url
        : `https://www.facebook.com${res.permalink_url}`;
    } catch (error) {
      // El post ya salio: sin link se sigue igual
      this.logger.warn(
        `No se pudo leer el link del post de FB: ${error instanceof Error ? error.message : 'error'}`,
      );
      return null;
    }
  }
}
