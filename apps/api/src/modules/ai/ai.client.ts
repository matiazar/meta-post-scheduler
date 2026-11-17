import Anthropic from '@anthropic-ai/sdk';
import { Inject, Injectable } from '@nestjs/common';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import {
  AiBadResponseException,
  AiNotConfiguredException,
  AiRefusedException,
  AiRequestFailedException,
} from './ai.exceptions.js';

export const ANTHROPIC_CLIENT = 'ANTHROPIC_CLIENT';

/** Solo lo que usamos del SDK: facilita mockearlo en los tests. */
export type AnthropicLike = Pick<Anthropic, 'messages'>;

export interface AiImage {
  /** JPEG en base64 (sin el prefijo data:) */
  base64: string;
}

export interface JsonCompletionRequest {
  system: string;
  text: string;
  images: AiImage[];
  /** JSON Schema de la respuesta (salida estructurada) */
  schema: Record<string, unknown>;
  maxTokens: number;
}

/** 60 s: con imagenes el modelo tarda mas que con texto solo */
const TIMEOUT_MS = 60_000;

/** Unico punto de acceso al modelo de IA (DEC-011), igual que MetaGraphClient para Meta. */
@Injectable()
export class AiClient {
  private readonly model: string;

  constructor(
    @Inject(ANTHROPIC_CLIENT) private readonly client: AnthropicLike | null,
    @Inject(ENV) env: Env,
  ) {
    this.model = env.AI_MODEL;
  }

  get configured(): boolean {
    return this.client !== null;
  }

  /**
   * Manda las imagenes y el texto y devuelve el JSON (como texto) que cumple el schema.
   * Los errores del SDK se unifican: el mensaje original puede traer datos de la cuenta.
   */
  async completeJson(request: JsonCompletionRequest): Promise<string> {
    if (!this.client) throw new AiNotConfiguredException();

    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create(
        {
          model: this.model,
          max_tokens: request.maxTokens,
          system: request.system,
          messages: [
            {
              role: 'user',
              content: [
                ...request.images.map(
                  (image): Anthropic.ImageBlockParam => ({
                    type: 'image',
                    source: {
                      type: 'base64',
                      media_type: 'image/jpeg',
                      data: image.base64,
                    },
                  }),
                ),
                { type: 'text', text: request.text },
              ],
            },
          ],
          output_config: {
            effort: 'medium',
            format: { type: 'json_schema', schema: request.schema },
          },
        },
        { timeout: TIMEOUT_MS },
      );
    } catch {
      throw new AiRequestFailedException();
    }

    if (response.stop_reason === 'refusal') throw new AiRefusedException();
    // Cortada por largo: el JSON queda incompleto y no sirve
    if (response.stop_reason === 'max_tokens') throw new AiBadResponseException();

    const block = response.content.find(
      (item): item is Anthropic.TextBlock => item.type === 'text',
    );
    if (!block?.text.trim()) throw new AiBadResponseException();
    return block.text;
  }
}
