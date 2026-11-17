import { MediaNotFoundException } from './media.exceptions.js';
import type { ImageProcessor } from './image-processor.js';
import { cleanFilename, MediaService } from './media.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { StorageService } from '../storage/storage.service.js';

describe('cleanFilename', () => {
  it.each([
    ['foto.jpg', 'foto.jpg'],
    ['../../etc/passwd', 'passwd'],
    ['C:\\Users\\x\\foto.png', 'foto.png'],
    ['a\u0000b\nc.jpg', 'abc.jpg'],
    ['', 'imagen'],
    ['///', 'imagen'],
  ])('%j -> %j', (input, expected) => {
    expect(cleanFilename(input)).toBe(expected);
  });

  it('limita el largo a 200', () => {
    expect(cleanFilename('a'.repeat(500)).length).toBe(200);
  });
});

describe('MediaService.readForAnalysis', () => {
  function setup(rows: { id: string; originalKey: string }[]) {
    const findMany = vi.fn().mockResolvedValue(rows);
    const get = vi
      .fn()
      .mockImplementation((key: string) => Promise.resolve(Buffer.from(key)));
    const shrink = vi
      .fn()
      .mockImplementation((buffer: Buffer) =>
        Promise.resolve(Buffer.from(`min:${buffer.toString()}`)),
      );
    const service = new MediaService(
      { media: { findMany } } as unknown as PrismaService,
      { get } as unknown as StorageService,
      { shrink } as unknown as ImageProcessor,
    );
    return { service, findMany, get, shrink };
  }

  it('devuelve las imagenes reducidas en el orden pedido, no en el de la base', async () => {
    const { service } = setup([
      { id: 'b', originalKey: 'kb' },
      { id: 'a', originalKey: 'ka' },
    ]);
    const out = await service.readForAnalysis(['a', 'b']);
    expect(out.map((buffer) => buffer.toString())).toEqual(['min:ka', 'min:kb']);
  });

  it('si falta alguna imagen falla entera sin leer nada del storage', async () => {
    const { service, get } = setup([{ id: 'a', originalKey: 'ka' }]);
    await expect(service.readForAnalysis(['a', 'b'])).rejects.toBeInstanceOf(
      MediaNotFoundException,
    );
    expect(get).not.toHaveBeenCalled();
  });
});
