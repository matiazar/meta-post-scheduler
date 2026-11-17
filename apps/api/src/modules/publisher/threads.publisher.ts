import { Injectable, Logger } from '@nestjs/common';
import type { SocialAccount } from '../../generated/prisma/client.js';
import { MetaApiException } from '../meta/meta.exceptions.js';
import { ThreadsGraphClient } from '../meta/threads-graph.client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ThreadsService } from '../threads/threads.service.js';
import {
  IG_POLL_INTERVAL_MS,
  IG_POLL_TIMEOUT_MS,
} from './publisher.constants.js';
import {
  PublishPermanentError,
  PublishTransientError,
} from './publisher.exceptions.js';
import type {
  NetworkPublisher,
  PublishInput,
  PublishResult,
} from './publisher.types.js';

type ContainerState =
  'FINISHED' | 'IN_PROGRESS' | 'PUBLISHED' | 'EXPIRED' | 'ERROR' | 'MISSING';

interface RecentThread {
  id: string;
  text?: string;
  timestamp?: string;
  permalink?: string;
}

const CONTAINER_BAD = 'THREADS_CONTAINER_BAD';
const API = '/v1.0';

/**
 * Publica en Threads con el flujo de containers (igual que Instagram): el container se
 * guarda en el PostTarget apenas se crea, asi un reintento lo reanuda en vez de publicar
 * dos veces. Texto de hasta 500 caracteres y una o varias imagenes (carrusel de 2 a 20).
 */
@Injectable()
export class ThreadsPublisher implements NetworkPublisher {
  readonly network = 'THREADS' as const;
  /** El container guardado evita duplicar: se puede reintentar */
  readonly onHung = 'retry' as const;
  private readonly logger = new Logger(ThreadsPublisher.name);
  /** Publicos para poder acelerarlos en los tests */
  pollIntervalMs = IG_POLL_INTERVAL_MS;
  pollTimeoutMs = IG_POLL_TIMEOUT_MS;

  constructor(
    private readonly graph: ThreadsGraphClient,
    private readonly prisma: PrismaService,
    private readonly threads: ThreadsService,
  ) {}

  async assertConnected(account: SocialAccount): Promise<void> {
    if (!(await this.threads.hasActiveConnection(account))) {
      throw new PublishPermanentError(
        'La conexión con Threads no está activa. Reconectá desde Ajustes > Threads',
        'THREADS_DISCONNECTED',
      );
    }
  }

  tokenFor(account: SocialAccount): Promise<string> {
    return this.threads.tokenForAccount(account);
  }

  invalidateConnection(account: SocialAccount): Promise<void> {
    return this.threads.markInvalid(account);
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    const { token, targetId, accountExternalId: userId } = input;
    let containerId = input.containerId;

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
      `${API}/${userId}/threads_publish`,
      { creation_id: containerId },
      token,
    );
    return {
      externalId: published.id,
      permalink: await this.permalink(published.id, token),
    };
  }

  private async createContainer(input: PublishInput): Promise<string> {
    const { accountExternalId: userId, imageUrls, caption, token } = input;

    if (imageUrls.length === 1) {
      const res = await this.graph.post<{ id: string }>(
        `${API}/${userId}/threads`,
        { media_type: 'IMAGE', image_url: imageUrls[0], text: caption },
        token,
      );
      return res.id;
    }

    const children: string[] = [];
    for (const url of imageUrls) {
      const child = await this.graph.post<{ id: string }>(
        `${API}/${userId}/threads`,
        { media_type: 'IMAGE', image_url: url, is_carousel_item: true },
        token,
      );
      await this.waitFinished(child.id, token);
      children.push(child.id);
    }
    const parent = await this.graph.post<{ id: string }>(
      `${API}/${userId}/threads`,
      { media_type: 'CAROUSEL', children: children.join(','), text: caption },
      token,
    );
    return parent.id;
  }

  private async containerState(
    containerId: string,
    token: string,
  ): Promise<ContainerState> {
    try {
      const res = await this.graph.get<{ status?: string }>(
        `${API}/${containerId}`,
        { fields: 'status,error_message' },
        token,
      );
      return (res.status ?? 'IN_PROGRESS') as ContainerState;
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
          'Threads no pudo procesar la imagen',
          CONTAINER_BAD,
        );
      }
      if (Date.now() >= deadline) {
        throw new PublishTransientError(
          'Threads sigue procesando la imagen',
          'THREADS_PROCESSING_TIMEOUT',
        );
      }
      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
    }
  }

  /**
   * El container ya figura como PUBLISHED: un intento anterior publico pero no llego a
   * guardar el resultado. Se busca el post entre los ultimos para no publicar de nuevo.
   */
  private async recoverPublished(input: PublishInput): Promise<PublishResult> {
    const reference =
      input.previousStartedAt ?? new Date(Date.now() - 3_600_000);
    const since = reference.getTime() - 60_000;
    const res = await this.graph.get<{ data: RecentThread[] }>(
      `${API}/${input.accountExternalId}/threads`,
      { fields: 'id,text,timestamp,permalink', limit: 10 },
      input.token,
    );
    const wanted = input.caption.trim();
    const found = res.data.find(
      (post) =>
        (post.text ?? '').trim() === wanted &&
        post.timestamp !== undefined &&
        new Date(post.timestamp).getTime() >= since,
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
        `${API}/${mediaId}`,
        { fields: 'permalink' },
        token,
      );
      return res.permalink ?? null;
    } catch (error) {
      // El post ya salio: sin link se sigue igual
      this.logger.warn(
        `No se pudo leer el link del post de Threads: ${error instanceof Error ? error.message : 'error'}`,
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
