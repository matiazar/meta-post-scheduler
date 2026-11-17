import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { Brand } from '../../generated/prisma/client.js';
import { BrandsService } from '../brands/brands.service.js';
import { MediaService } from '../media/media.service.js';
import { AiClient } from './ai.client.js';
import {
  AiBadResponseException,
  AiNotConfiguredException,
  AiRateLimitedException,
} from './ai.exceptions.js';
import {
  AI_MAX_IMAGES,
  type AiNetwork,
  type SuggestCopyDto,
} from './dto/suggest-copy.dto.js';
import {
  SOCIAL_COPY_SCHEMA,
  SOCIAL_COPY_SYSTEM_PROMPT,
} from './social-copy.prompt.js';

export interface CopyVariant {
  /** Texto del post, sin hashtags ni firma */
  text: string;
  /** Sin el simbolo # */
  hashtags: string[];
}

export interface SuggestedCopy {
  variants: CopyVariant[];
}

/**
 * Largo maximo del texto por red. IG/FB dejan lugar para la firma y los hashtags fijos de la
 * marca dentro de los 2200 de Instagram; Threads tiene 500 en total y cuenta los emojis como bytes.
 */
const MAX_TEXT_CHARS: Record<AiNetwork, number> = {
  INSTAGRAM: 1800,
  FACEBOOK: 1800,
  BOTH: 1800,
  THREADS: 400,
};
const MAX_VARIANTS = 3;
const MAX_HASHTAGS: Record<AiNetwork, number> = {
  INSTAGRAM: 10,
  BOTH: 10,
  FACEBOOK: 3,
  THREADS: 1,
};
const NETWORK_LABEL: Record<AiNetwork, string> = {
  INSTAGRAM: 'Instagram (máximo 2200 caracteres)',
  FACEBOOK: 'Facebook',
  THREADS: 'Threads (máximo 500 caracteres en total, texto corto)',
  BOTH: 'Instagram y Facebook (respetá el límite de Instagram: 2200 caracteres)',
};
/** Tope de pedidos por minuto: cada uno cuesta plata y el panel es de un solo usuario */
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;
const MAX_OUTPUT_TOKENS = 4000;

const responseSchema = z.object({
  variants: z
    .array(z.object({ text: z.string(), hashtags: z.array(z.string()) }))
    .min(1),
});

/** Hashtag limpio: sin #, sin espacios ni signos (acepta letras con tilde y ñ). */
export function cleanHashtag(raw: string): string {
  return raw.replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, '');
}

@Injectable()
export class AiService {
  private readonly recent: number[] = [];

  constructor(
    private readonly client: AiClient,
    private readonly brands: BrandsService,
    private readonly media: MediaService,
  ) {}

  /** Mira las imagenes y escribe 3 variantes de texto con hashtags, con la voz de la marca. */
  async suggestCopy(dto: SuggestCopyDto): Promise<SuggestedCopy> {
    if (!this.client.configured) throw new AiNotConfiguredException();
    this.checkRate();

    const brand = await this.brands.get(dto.brandId);
    const ids = dto.mediaIds.slice(0, AI_MAX_IMAGES);
    const buffers = await this.media.readForAnalysis(ids);
    const network = dto.network ?? 'INSTAGRAM';

    const raw = await this.client.completeJson({
      system: SOCIAL_COPY_SYSTEM_PROMPT,
      text: this.buildRequestText(brand, network, ids.length, dto.hint),
      images: buffers.map((buffer) => ({ base64: buffer.toString('base64') })),
      schema: SOCIAL_COPY_SCHEMA,
      maxTokens: MAX_OUTPUT_TOKENS,
    });
    return this.parse(raw, brand, network);
  }

  private buildRequestText(
    brand: Brand,
    network: AiNetwork,
    imageCount: number,
    hint?: string,
  ): string {
    return [
      `Marca: ${brand.name}`,
      `Descripción: ${brand.description.trim() || '(sin descripción)'}`,
      `Tono: ${brand.tone.trim() || '(sin tono definido)'}`,
      `Hashtags fijos de la marca (la app los agrega, no los repitas): ${brand.defaultHashtags.trim() || '(ninguno)'}`,
      `Red: ${NETWORK_LABEL[network]}`,
      `Cantidad de imágenes: ${imageCount}`,
      `Largo máximo de cada texto: ${MAX_TEXT_CHARS[network]} caracteres`,
      `Indicación del usuario: ${hint?.trim() || '(ninguna)'}`,
    ].join('\n');
  }

  /** La salida estructurada fija la forma; aca se validan los limites y se limpian los hashtags. */
  private parse(raw: string, brand: Brand, network: AiNetwork): SuggestedCopy {
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new AiBadResponseException();
    }
    const parsed = responseSchema.safeParse(json);
    if (!parsed.success) throw new AiBadResponseException();

    const fixed = new Set(
      brand.defaultHashtags
        .split(/\s+/)
        .map((tag) => cleanHashtag(tag).toLowerCase())
        .filter(Boolean),
    );
    const variants: CopyVariant[] = [];
    for (const item of parsed.data.variants) {
      const text = item.text.trim();
      if (!text) continue;
      const seen = new Set<string>();
      const hashtags: string[] = [];
      for (const tag of item.hashtags.map(cleanHashtag)) {
        const key = tag.toLowerCase();
        if (!tag || seen.has(key) || fixed.has(key)) continue;
        seen.add(key);
        hashtags.push(tag);
        if (hashtags.length === MAX_HASHTAGS[network]) break;
      }
      variants.push({ text: text.slice(0, MAX_TEXT_CHARS[network]), hashtags });
      if (variants.length === MAX_VARIANTS) break;
    }
    if (variants.length === 0) throw new AiBadResponseException();
    return { variants };
  }

  private checkRate(): void {
    const now = Date.now();
    while (this.recent.length > 0 && now - this.recent[0] > RATE_WINDOW_MS) {
      this.recent.shift();
    }
    if (this.recent.length >= RATE_LIMIT) throw new AiRateLimitedException();
    this.recent.push(now);
  }
}
