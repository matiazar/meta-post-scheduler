import { describe, expect, it, vi } from 'vitest';
import type { Brand } from '../../generated/prisma/client.js';
import type { BrandsService } from '../brands/brands.service.js';
import { BrandNotFoundException } from '../brands/brands.exceptions.js';
import type { MediaService } from '../media/media.service.js';
import { MediaNotFoundException } from '../media/media.exceptions.js';
import type { AiClient } from './ai.client.js';
import {
  AiBadResponseException,
  AiNotConfiguredException,
  AiRateLimitedException,
} from './ai.exceptions.js';
import { AiService, cleanHashtag } from './ai.service.js';

const brand = {
  id: 'b1',
  name: 'Kalendox',
  description: 'Software de turnos para estudios de yoga',
  tone: 'cercano, sin emojis',
  defaultHashtags: '#kalendox #yoga',
  signature: '',
} as unknown as Brand;

function setup(
  options: {
    configured?: boolean;
    reply?: string;
    brandResult?: Brand | Error;
    mediaResult?: Buffer[] | Error;
  } = {},
) {
  const completeJson = vi
    .fn()
    .mockResolvedValue(
      options.reply ??
        JSON.stringify({
          variants: [{ text: 'Hola', hashtags: ['turnos'] }],
        }),
    );
  const client = {
    configured: options.configured ?? true,
    completeJson,
  } as unknown as AiClient;
  const get = vi.fn().mockImplementation(() => {
    const result = options.brandResult ?? brand;
    return result instanceof Error
      ? Promise.reject(result)
      : Promise.resolve(result);
  });
  const readForAnalysis = vi.fn().mockImplementation(() => {
    const result = options.mediaResult ?? [Buffer.from('ABC')];
    return result instanceof Error
      ? Promise.reject(result)
      : Promise.resolve(result);
  });
  const service = new AiService(
    client,
    { get } as unknown as BrandsService,
    { readForAnalysis } as unknown as MediaService,
  );
  return { service, completeJson, get, readForAnalysis };
}

async function caught(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    return error as Error;
  }
  throw new Error('no fallo');
}

describe('cleanHashtag', () => {
  it('saca el # y los signos, conserva tildes y ñ', () => {
    expect(cleanHashtag('#Café-Ñandú!')).toBe('CaféÑandú');
    expect(cleanHashtag('##yoga online')).toBe('yogaonline');
  });
});

describe('AiService.suggestCopy', () => {
  it('sin clave de IA responde 503 y no toca marcas ni imagenes', async () => {
    const { service, get, readForAnalysis } = setup({ configured: false });
    const error = await caught(
      service.suggestCopy({ brandId: 'b1', mediaIds: ['m1'] }),
    );
    expect(error).toBeInstanceOf(AiNotConfiguredException);
    expect(get).not.toHaveBeenCalled();
    expect(readForAnalysis).not.toHaveBeenCalled();
  });

  it('manda la marca, las imagenes (maximo 4) y la indicacion al modelo', async () => {
    const { service, completeJson, readForAnalysis } = setup();
    await service.suggestCopy({
      brandId: 'b1',
      mediaIds: ['m1', 'm2', 'm3', 'm4', 'm5'],
      network: 'FACEBOOK',
      hint: ' promo de abril ',
    });

    expect(readForAnalysis).toHaveBeenCalledWith(['m1', 'm2', 'm3', 'm4']);
    const [request] = completeJson.mock.calls[0];
    expect(request.images).toEqual([
      { base64: Buffer.from('ABC').toString('base64') },
    ]);
    expect(request.text).toContain('Marca: Kalendox');
    expect(request.text).toContain('Software de turnos para estudios de yoga');
    expect(request.text).toContain('cercano, sin emojis');
    expect(request.text).toContain('Red: Facebook');
    expect(request.text).toContain('Cantidad de imágenes: 4');
    expect(request.text).toContain('Indicación del usuario: promo de abril');
  });

  it('limpia hashtags: sin #, sin repetidos, sin los fijos de la marca, con tope por red', async () => {
    const reply = JSON.stringify({
      variants: [
        {
          text: ' Primer texto ',
          hashtags: [
            '#yoga',
            'Turnos',
            '#turnos',
            'KALENDOX',
            'agenda online',
            'a1',
            'a2',
            'a3',
            'a4',
          ],
        },
      ],
    });
    const { service } = setup({ reply });
    const ig = await service.suggestCopy({ brandId: 'b1', mediaIds: ['m1'] });
    // yoga y kalendox son fijos de la marca; turnos repetido
    expect(ig.variants[0].hashtags).toEqual([
      'Turnos',
      'agendaonline',
      'a1',
      'a2',
      'a3',
      'a4',
    ]);
    expect(ig.variants[0].text).toBe('Primer texto');

    const fb = await service.suggestCopy({
      brandId: 'b1',
      mediaIds: ['m1'],
      network: 'FACEBOOK',
    });
    expect(fb.variants[0].hashtags).toHaveLength(3);
  });

  it('descarta variantes vacias, corta el texto largo y devuelve a lo sumo 3', async () => {
    const reply = JSON.stringify({
      variants: [
        { text: '   ', hashtags: [] },
        { text: 'x'.repeat(2500), hashtags: [] },
        { text: 'dos', hashtags: [] },
        { text: 'tres', hashtags: [] },
        { text: 'cuatro', hashtags: [] },
      ],
    });
    const { service } = setup({ reply });
    const result = await service.suggestCopy({
      brandId: 'b1',
      mediaIds: ['m1'],
    });
    expect(result.variants).toHaveLength(3);
    expect(result.variants[0].text).toHaveLength(1800);
    expect(result.variants.map((v) => v.text)).not.toContain('cuatro');
  });

  it('una respuesta que no es JSON o no tiene la forma pedida es invalida', async () => {
    for (const reply of ['no es json', '{"variants":[]}', '{"x":1}']) {
      const { service } = setup({ reply });
      const error = await caught(
        service.suggestCopy({ brandId: 'b1', mediaIds: ['m1'] }),
      );
      expect(error).toBeInstanceOf(AiBadResponseException);
    }
  });

  it('una marca o imagen inexistente corta antes de llamar al modelo', async () => {
    const noBrand = setup({ brandResult: new BrandNotFoundException() });
    expect(
      await caught(noBrand.service.suggestCopy({ brandId: 'x', mediaIds: ['m'] })),
    ).toBeInstanceOf(BrandNotFoundException);
    expect(noBrand.completeJson).not.toHaveBeenCalled();

    const noMedia = setup({ mediaResult: new MediaNotFoundException() });
    expect(
      await caught(noMedia.service.suggestCopy({ brandId: 'b1', mediaIds: ['x'] })),
    ).toBeInstanceOf(MediaNotFoundException);
    expect(noMedia.completeJson).not.toHaveBeenCalled();
  });

  it('limita a 10 pedidos por minuto', async () => {
    const { service, completeJson } = setup();
    for (let i = 0; i < 10; i++) {
      await service.suggestCopy({ brandId: 'b1', mediaIds: ['m1'] });
    }
    const error = await caught(
      service.suggestCopy({ brandId: 'b1', mediaIds: ['m1'] }),
    );
    expect(error).toBeInstanceOf(AiRateLimitedException);
    expect(completeJson).toHaveBeenCalledTimes(10);
  });
});
