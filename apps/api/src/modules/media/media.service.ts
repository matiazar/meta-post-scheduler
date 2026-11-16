import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import { Injectable } from '@nestjs/common';
import type {
  AspectRatio,
  FitMode,
  Media,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import {
  ImageProcessor,
  InvalidImageError,
  type ImageInfo,
  type ProcessedImage,
} from './image-processor.js';
import {
  MediaNotFoundException,
  NoFilesException,
  UnsupportedImageException,
} from './media.exceptions.js';

export interface MediaView {
  id: string;
  filename: string;
  width: number;
  height: number;
  sizeBytes: number;
  mime: string;
  originalUrl: string;
  createdAt: Date;
}

export interface UploadedFile {
  originalname: string;
  buffer: Buffer;
  size: number;
}

const EXTENSIONS = { jpeg: 'jpg', png: 'png', webp: 'webp' } as const;
const MIME = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
} as const;

/** Nombre solo para mostrar: sin ruta, sin caracteres de control, largo acotado. */
export function cleanFilename(name: string): string {
  const base = basename(name.replaceAll('\\', '/'));
  // Se descartan caracteres de control (codigos 0-31 y 127)
  const cleaned = base
    .split('')
    .filter((ch) => ch.charCodeAt(0) > 31 && ch.charCodeAt(0) !== 127)
    .join('');
  return cleaned.slice(0, 200) || 'imagen';
}

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly images: ImageProcessor,
  ) {}

  /**
   * Valida TODAS las imagenes antes de guardar nada: si una falla, no se sube ninguna.
   * Las keys llevan UUID (no adivinables) y la extension sale del formato real, no del nombre.
   */
  async upload(files: UploadedFile[]): Promise<MediaView[]> {
    if (files.length === 0) throw new NoFilesException();

    const checked: { file: UploadedFile; info: ImageInfo; name: string }[] = [];
    for (const file of files) {
      const name = cleanFilename(file.originalname);
      try {
        checked.push({
          file,
          info: await this.images.inspect(file.buffer),
          name,
        });
      } catch (error) {
        if (error instanceof InvalidImageError) {
          throw new UnsupportedImageException(
            name,
            error.reason === 'unsupported'
              ? 'formato no soportado. Usá JPG, PNG o WebP (las fotos HEIC de iPhone hay que convertirlas antes)'
              : 'el archivo está dañado o no es una imagen',
          );
        }
        throw error;
      }
    }

    const now = new Date();
    const prefix = `originals/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const stored: string[] = [];
    try {
      const rows: Omit<Media, 'id' | 'createdAt' | 'updatedAt'>[] = [];
      for (const { file, info, name } of checked) {
        const key = `${prefix}/${randomUUID()}.${EXTENSIONS[info.format]}`;
        await this.storage.put(key, file.buffer, MIME[info.format]);
        stored.push(key);
        rows.push({
          originalKey: key,
          originalFilename: name,
          width: info.width,
          height: info.height,
          sizeBytes: file.size,
          mime: MIME[info.format],
        });
      }
      const created = await this.prisma.$transaction(
        rows.map((data) => this.prisma.media.create({ data })),
      );
      return created.map((m) => this.toView(m));
    } catch (error) {
      // Rollback de lo ya subido: sin esto quedarian archivos huerfanos en R2
      await Promise.allSettled(stored.map((key) => this.storage.delete(key)));
      throw error;
    }
  }

  async get(id: string): Promise<MediaView> {
    return this.toView(await this.findOrThrow(id));
  }

  /** Imagen ya procesada (misma salida que se publicara), sin guardarla. */
  async preview(
    id: string,
    aspectRatio: AspectRatio,
    fitMode: FitMode,
    padColor?: string,
  ): Promise<ProcessedImage> {
    const media = await this.findOrThrow(id);
    const original = await this.storage.get(media.originalKey);
    return this.images.process(original, aspectRatio, fitMode, padColor);
  }

  private async findOrThrow(id: string): Promise<Media> {
    const media = await this.prisma.media.findUnique({ where: { id } });
    if (!media) throw new MediaNotFoundException();
    return media;
  }

  private toView(media: Media): MediaView {
    return {
      id: media.id,
      filename: media.originalFilename,
      width: media.width,
      height: media.height,
      sizeBytes: media.sizeBytes,
      mime: media.mime,
      originalUrl: this.storage.publicUrl(media.originalKey),
      createdAt: media.createdAt,
    };
  }
}
