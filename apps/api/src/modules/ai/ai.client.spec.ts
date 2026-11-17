import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../config/env.js';
import { AiClient, type AnthropicLike } from './ai.client.js';
import {
  AiBadResponseException,
  AiNotConfiguredException,
  AiRefusedException,
  AiRequestFailedException,
} from './ai.exceptions.js';

const env = { AI_MODEL: 'claude-test' } as Env;
const request = {
  system: 'sistema',
  text: 'pedido',
  images: [{ base64: 'QUJD' }],
  schema: { type: 'object' },
  maxTokens: 100,
};

function sdk(create: ReturnType<typeof vi.fn>): AnthropicLike {
  return { messages: { create } } as unknown as AnthropicLike;
}

function message(overrides: Record<string, unknown> = {}) {
  return {
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: '{"variants":[]}' }],
    ...overrides,
  };
}

async function caught(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    return error as Error;
  }
  throw new Error('no fallo');
}

describe('AiClient', () => {
  it('sin cliente no esta configurado y completeJson responde 503', async () => {
    const client = new AiClient(null, env);
    expect(client.configured).toBe(false);
    expect(await caught(client.completeJson(request))).toBeInstanceOf(
      AiNotConfiguredException,
    );
  });

  it('manda imagenes en base64, el texto y el schema, y devuelve el JSON', async () => {
    const create = vi.fn().mockResolvedValue(message());
    const client = new AiClient(sdk(create), env);

    await expect(client.completeJson(request)).resolves.toBe(
      '{"variants":[]}',
    );

    const [body] = create.mock.calls[0];
    expect(body.model).toBe('claude-test');
    expect(body.system).toBe('sistema');
    expect(body.output_config.format).toEqual({
      type: 'json_schema',
      schema: { type: 'object' },
    });
    expect(body.messages[0].content).toEqual([
      {
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJD' },
      },
      { type: 'text', text: 'pedido' },
    ]);
  });

  it('un rechazo del modelo se informa sin tocar el contenido', async () => {
    const create = vi
      .fn()
      .mockResolvedValue(message({ stop_reason: 'refusal', content: [] }));
    const client = new AiClient(sdk(create), env);
    expect(await caught(client.completeJson(request))).toBeInstanceOf(
      AiRefusedException,
    );
  });

  it('una respuesta cortada por largo o vacia es invalida', async () => {
    const cut = new AiClient(
      sdk(vi.fn().mockResolvedValue(message({ stop_reason: 'max_tokens' }))),
      env,
    );
    expect(await caught(cut.completeJson(request))).toBeInstanceOf(
      AiBadResponseException,
    );

    const empty = new AiClient(
      sdk(vi.fn().mockResolvedValue(message({ content: [] }))),
      env,
    );
    expect(await caught(empty.completeJson(request))).toBeInstanceOf(
      AiBadResponseException,
    );
  });

  it('un error del SDK se unifica y no expone el detalle', async () => {
    const create = vi
      .fn()
      .mockRejectedValue(new Error('401 invalid x-api-key sk-ant-SECRET'));
    const client = new AiClient(sdk(create), env);
    const error = await caught(client.completeJson(request));
    expect(error).toBeInstanceOf(AiRequestFailedException);
    expect(error.message).not.toContain('SECRET');
  });
});
