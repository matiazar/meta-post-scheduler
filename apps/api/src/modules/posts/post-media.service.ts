import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { AspectRatio, FitMode } from '../../generated/prisma/client.js';
import { ImageProcessor } from '../media/image-processor.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { UnknownMediaException } from './posts.exceptions.js';

export interface GeneratedMedia {
  mediaId: string;
  processedKey: string;
  publicUrl: string;
  width: number;
  height: number;
}

/** Genera y borra las versiones JPEG procesadas de un post (DEC-06). */
@Injectable()
export class PostMediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly images: ImageProcessor,
  ) {}

  /** Comprueba que todos los ids existan (sin descargar nada). */
  async assertExist(mediaIds: string[]): Promise<void> {
    if (mediaIds.length === 0) return;
    const found = await this.prisma.media.count({
      where: { id: { in: mediaIds } },
    });
    if (found !== new Set(mediaIds).size) throw new UnknownMediaException();
  }

  /**
   * Procesa cada original con la proporcion y modo del post y sube el JPEG a R2.
   * Una por una (sharp usa mucha memoria con fotos grandes). Si algo falla, borra lo ya subido.
   */
  async generate(
    mediaIds: string[],
    aspectRatio: AspectRatio,
    fitMode: FitMode,
  ): Promise<GeneratedMedia[]> {
    if (mediaIds.length === 0) return [];
    const rows = await this.prisma.media.findMany({
      where: { id: { in: mediaIds } },
      select: { id: true, originalKey: true },
    });
    const keyById = new Map(rows.map((r) => [r.id, r.originalKey]));
    if (keyById.size !== new Set(mediaIds).size) {
      throw new UnknownMediaException();
    }

    const now = new Date();
    const prefix = `processed/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const done: GeneratedMedia[] = [];
    try {
      for (const mediaId of mediaIds) {
        const original = await this.storage.get(keyById.get(mediaId)!);
        const out = await this.images.process(original, aspectRatio, fitMode);
        const processedKey = `${prefix}/${randomUUID()}.jpg`;
        await this.storage.put(processedKey, out.buffer, 'image/jpeg');
        done.push({
          mediaId,
          processedKey,
          publicUrl: this.storage.publicUrl(processedKey),
          width: out.width,
          height: out.height,
        });
      }
      return done;
    } catch (error) {
      await this.deleteKeys(done.map((d) => d.processedKey));
      throw error;
    }
  }

  /** Borrado a mejor esfuerzo: un huerfano en R2 no justifica fallar una operacion ya hecha. */
  async deleteKeys(keys: (string | null)[]): Promise<void> {
    await Promise.allSettled(
      keys
        .filter((k): k is string => k !== null)
        .map((key) => this.storage.delete(key)),
    );
  }
}
