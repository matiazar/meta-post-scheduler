import { Injectable, Logger } from '@nestjs/common';
import { MetaApiException } from '../meta/meta.exceptions.js';
import { MetaGraphClient } from '../meta/meta-graph.client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  IG_POLL_INTERVAL_MS,
  IG_POLL_TIMEOUT_MS,
} from './publisher.constants.js';
import { PublishTransientError } from './publisher.exceptions.js';
import type {
  InstagramPublishInput,
  PublishResult,
} from './publisher.types.js';

type ContainerState =
  'FINISHED' | 'IN_PROGRESS' | 'PUBLISHED' | 'EXPIRED' | 'ERROR' | 'MISSING';

interface RecentMedia {
  id: string;
  caption?: string;
  timestamp?: string;
  permalink?: string;
}

const CONTAINER_BAD = 'IG_CONTAINER_BAD';

/**
 * Publica en Instagram Business con el flujo de containers. El container padre se
 * guarda en el PostTarget apenas se crea: si el worker muere o hay un timeout, el
 * reintento lo reanuda en vez de crear uno nuevo (evita publicar dos veces).
 */
@Injectable()
export class InstagramPublisher {
  private readonly logger = new Logger(InstagramPublisher.name);
  /** Publicos para poder acelerarlos en los tests */
  pollIntervalMs = IG_POLL_INTERVAL_MS;
  pollTimeoutMs = IG_POLL_TIMEOUT_MS;

  constructor(
    private readonly graph: MetaGraphClient,
    private readonly prisma: PrismaService,
  ) {}

  async publish(input: InstagramPublishInput): Promise<PublishResult> {
    const { token, targetId, accountExternalId: igId } = input;
    let containerId = input.igContainerId;

    if (containerId) {
      const state = await this.containerState(containerId, token);
      if (state === 'PUBLISHED') return this.recoverPublished(input);
      if (state === 'EXPIRED' || state === 'ERROR' || state === 'MISSING') {
        containerId = null;
        await this.saveContainer(targetId, null);
      }
    }

    if (!containerId) {
      containerId = await this.createContainer(input);
      await this.saveContainer(targetId, containerId);
    }

    try {
      await this.waitFinished(containerId, token);
    } catch (error) {
      if (
        error instanceof PublishTransientError &&
        error.code === CONTAINER_BAD
      ) {
        await this.saveContainer(targetId, null);
      }
      throw error;
    }

    const published = await this.graph.post<{ id: string }>(
      `/${igId}/media_publish`,
      { creation_id: containerId },
      token,
    );
    return {
      externalId: published.id,
      permalink: await this.permalink(published.id, token),
    };
  }

  private async createContainer(input: InstagramPublishInput): Promise<string> {
    const { accountExternalId: igId, imageUrls, caption, token } = input;

    if (imageUrls.length === 1) {
      const res = await this.graph.post<{ id: string }>(
        `/${igId}/media`,
        { image_url: imageUrls[0], caption },
        token,
      );
      return res.id;
    }

    const children: string[] = [];
    for (const url of imageUrls) {
      const child = await this.graph.post<{ id: string }>(
        `/${igId}/media`,
        { image_url: url, is_carousel_item: true },
        token,
      );
      await this.waitFinished(child.id, token);
      children.push(child.id);
    }
    const parent = await this.graph.post<{ id: string }>(
      `/${igId}/media`,
      { media_type: 'CAROUSEL', children: children.join(','), caption },
      token,
    );
    return parent.id;
  }

  private async containerState(
    containerId: string,
    token: string,
  ): Promise<ContainerState> {
    try {
      const res = await this.graph.get<{ status_code?: string }>(
        `/${containerId}`,
        { fields: 'status_code' },
        token,
      );
      return (res.status_code ?? 'IN_PROGRESS') as ContainerState;
    } catch (error) {
      // Container inexistente: se crea uno nuevo. Cualquier otro error se reintenta mas tarde
      if (
        error instanceof MetaApiException &&
        !error.isTransient &&
        error.code === 100
      ) {
        return 'MISSING';
      }
      throw error;
    }
  }

  private async waitFinished(
    containerId: string,
    token: string,
  ): Promise<void> {
    const deadline = Date.now() + this.pollTimeoutMs;
    for (;;) {
      const state = await this.containerState(containerId, token);
      if (state === 'FINISHED') return;
      if (state === 'ERROR' || state === 'EXPIRED' || state === 'MISSING') {
        throw new PublishTransientError(
          'Instagram no pudo procesar la imagen',
          CONTAINER_BAD,
        );
      }
      if (Date.now() >= deadline) {
        throw new PublishTransientError(
          'Instagram sigue procesando la imagen',
          'IG_PROCESSING_TIMEOUT',
        );
      }
      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
    }
  }

  /**
   * El container ya figura como PUBLISHED: un intento anterior publico pero no llego a
   * guardar el resultado. Se busca el post entre los ultimos para no publicar de nuevo.
   */
  private async recoverPublished(
    input: InstagramPublishInput,
  ): Promise<PublishResult> {
    const reference =
      input.previousStartedAt ?? new Date(Date.now() - 3_600_000);
    const since = reference.getTime() - 60_000;
    const res = await this.graph.get<{ data: RecentMedia[] }>(
      `/${input.accountExternalId}/media`,
      { fields: 'id,caption,timestamp,permalink', limit: 10 },
      input.token,
    );
    const wanted = input.caption.trim();
    const found = res.data.find(
      (m) =>
        (m.caption ?? '').trim() === wanted &&
        m.timestamp !== undefined &&
        new Date(m.timestamp).getTime() >= since,
    );
    if (found) {
      return { externalId: found.id, permalink: found.permalink ?? null };
    }
    return { externalId: null, permalink: null, unverified: true };
  }

  private async permalink(
    mediaId: string,
    token: string,
  ): Promise<string | null> {
    try {
      const res = await this.graph.get<{ permalink?: string }>(
        `/${mediaId}`,
        { fields: 'permalink' },
        token,
      );
      return res.permalink ?? null;
    } catch (error) {
      // El post ya salio: sin link se sigue igual
      this.logger.warn(
        `No se pudo leer el link del post de IG: ${error instanceof Error ? error.message : 'error'}`,
      );
      return null;
    }
  }

  private async saveContainer(
    targetId: string,
    containerId: string | null,
  ): Promise<void> {
    await this.prisma.postTarget.update({
      where: { id: targetId },
      data: { igContainerId: containerId },
    });
  }
}
