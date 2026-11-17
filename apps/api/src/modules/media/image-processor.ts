import { Injectable } from '@nestjs/common';
import sharp, { type Metadata } from 'sharp';
import type { AspectRatio, FitMode } from '../../generated/prisma/client.js';

export const MAX_WIDTH = 1440;
const MAX_INPUT_PIXELS = 100_000_000;
const JPEG_QUALITY = 90;
/** Lado mayor de las imagenes que se mandan a la IA (mas grande no mejora la lectura y cuesta mas) */
export const AI_MAX_SIDE = 1568;

/** Proporcion ancho/alto de cada opcion del post (IG acepta de 4:5 a 1.91:1) */
export const RATIOS: Record<AspectRatio, number> = {
  SQUARE: 1,
  PORTRAIT: 4 / 5,
  LANDSCAPE: 1.91,
};

export type SupportedFormat = 'jpeg' | 'png' | 'webp';

export interface ImageInfo {
  format: SupportedFormat;
  /** Dimensiones ya con la rotacion EXIF aplicada */
  width: number;
  height: number;
}

export interface ProcessedImage {
  buffer: Buffer;
  width: number;
  height: number;
}

export class InvalidImageError extends Error {
  constructor(readonly reason: 'unsupported' | 'corrupt') {
    super(reason);
  }
}

const SUPPORTED: readonly string[] = ['jpeg', 'png', 'webp'];

/** Procesamiento de imagenes con sharp (DEC-06). Sin acceso a red ni a disco. */
@Injectable()
export class ImageProcessor {
  /** Valida que sea JPEG/PNG/WebP real (por contenido, no por extension) y lee su tamano. */
  async inspect(input: Buffer): Promise<ImageInfo> {
    let meta: Metadata;
    try {
      meta = await sharp(input, {
        limitInputPixels: MAX_INPUT_PIXELS,
      }).metadata();
    } catch {
      throw new InvalidImageError('corrupt');
    }
    if (!meta.format || !SUPPORTED.includes(meta.format)) {
      throw new InvalidImageError('unsupported');
    }
    if (!meta.width || !meta.height) throw new InvalidImageError('corrupt');
    // Orientaciones EXIF 5 a 8 giran 90 grados: ancho y alto se intercambian
    const rotated = (meta.orientation ?? 1) >= 5;
    return {
      format: meta.format as SupportedFormat,
      width: rotated ? meta.height : meta.width,
      height: rotated ? meta.width : meta.height,
    };
  }

  /**
   * Re-codifica el original sin metadatos (GPS, camara, etc.) en el mismo formato.
   * El original queda en un bucket publico, asi que no debe llevar datos personales.
   * Aplica la rotacion EXIF a los pixeles (sin el tag la foto quedaria de costado) y
   * pasa a sRGB para no perder los colores al descartar el perfil ICC.
   */
  async stripMetadata(input: Buffer, format: SupportedFormat): Promise<Buffer> {
    const pipeline = sharp(input, {
      limitInputPixels: MAX_INPUT_PIXELS,
    })
      .rotate()
      .toColourspace('srgb');
    try {
      switch (format) {
        case 'jpeg':
          return await pipeline.jpeg({ quality: 95 }).toBuffer();
        case 'png':
          return await pipeline.png().toBuffer();
        case 'webp':
          return await pipeline.webp({ quality: 95 }).toBuffer();
      }
    } catch {
      // Cabecera valida pero datos truncados o dañados: recien falla al decodificar
      throw new InvalidImageError('corrupt');
    }
  }

  /**
   * Version liviana para analizar con IA: JPEG sRGB, lado mayor <= maxSide, sin agrandar.
   * No se publica ni se guarda: solo reduce lo que se manda al modelo.
   */
  async shrink(input: Buffer, maxSide = AI_MAX_SIDE): Promise<Buffer> {
    try {
      return await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
        .rotate()
        .resize(maxSide, maxSide, { fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' })
        .toColourspace('srgb')
        .jpeg({ quality: 85 })
        .toBuffer();
    } catch {
      throw new InvalidImageError('corrupt');
    }
  }

  /**
   * JPEG sRGB calidad 90, ancho maximo 1440, con la proporcion pedida.
   * CROP: recorte centrado. PAD: la imagen entera sobre un lienzo del color indicado.
   * Nunca agranda la imagen. Los metadatos (GPS, etc.) no se copian.
   */
  async process(
    input: Buffer,
    aspectRatio: AspectRatio,
    fitMode: FitMode,
    padColor = '#ffffff',
  ): Promise<ProcessedImage> {
    const { width, height } = await this.inspect(input);
    const ratio = RATIOS[aspectRatio];
    const wider = width / height > ratio;

    // Lienzo mas chico posible que contiene (PAD) o cabe dentro (CROP) de la imagen
    let canvasW: number;
    if (fitMode === 'CROP') {
      canvasW = wider ? Math.round(height * ratio) : width;
    } else {
      canvasW = wider ? width : Math.round(height * ratio);
    }
    const outW = Math.min(MAX_WIDTH, canvasW);
    const outH = Math.round(outW / ratio);

    const { data, info } = await sharp(input, {
      limitInputPixels: MAX_INPUT_PIXELS,
    })
      .rotate()
      .resize(outW, outH, {
        fit: fitMode === 'CROP' ? 'cover' : 'contain',
        position: 'centre',
        background: padColor,
        withoutEnlargement: false,
      })
      .flatten({ background: padColor })
      .toColourspace('srgb')
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer({ resolveWithObject: true });
    return { buffer: data, width: info.width, height: info.height };
  }
}
