import sharp from 'sharp';
import { ImageProcessor, InvalidImageError } from './image-processor.js';

const processor = new ImageProcessor();

function solid(
  width: number,
  height: number,
  format: 'jpeg' | 'png' | 'webp' = 'jpeg',
  color = { r: 200, g: 30, b: 30, alpha: 1 },
): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 4, background: color } })
    [format]()
    .toBuffer();
}

async function centerPixel(buffer: Buffer, x?: number, y?: number) {
  const { data, info } = await sharp(buffer)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const px = x ?? Math.floor(info.width / 2);
  const py = y ?? Math.floor(info.height / 2);
  const i = (py * info.width + px) * info.channels;
  return [data[i], data[i + 1], data[i + 2]];
}

describe('ImageProcessor.inspect', () => {
  it.each(['jpeg', 'png', 'webp'] as const)('acepta %s', async (format) => {
    const info = await processor.inspect(await solid(40, 20, format));
    expect(info).toEqual({ format, width: 40, height: 20 });
  });

  it('informa el tamano con la rotacion EXIF aplicada', async () => {
    const rotated = await sharp(await solid(40, 20))
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    expect(await processor.inspect(rotated)).toMatchObject({
      width: 20,
      height: 40,
    });
  });

  it('rechaza formatos no soportados (GIF, HEIC) y basura', async () => {
    const gif = await sharp({
      create: { width: 4, height: 4, channels: 3, background: '#fff' },
    })
      .gif()
      .toBuffer();
    await expect(processor.inspect(gif)).rejects.toMatchObject({
      reason: 'unsupported',
    });
    const heicLike = Buffer.concat([
      Buffer.from([0, 0, 0, 24]),
      Buffer.from('ftypheic'),
      Buffer.alloc(32),
    ]);
    await expect(processor.inspect(heicLike)).rejects.toBeInstanceOf(
      InvalidImageError,
    );
    await expect(
      processor.inspect(Buffer.from('esto no es una imagen')),
    ).rejects.toBeInstanceOf(InvalidImageError);
  });
});

describe('ImageProcessor.process', () => {
  it.each([
    ['SQUARE', 1000, 1000],
    ['PORTRAIT', 800, 1000],
    ['LANDSCAPE', 1910, 1000],
  ] as const)(
    'CROP %s: recorta a la proporcion exacta sin agrandar',
    async (aspect, w, h) => {
      const src = await solid(w + 300, h + 200);
      const out = await processor.process(src, aspect, 'CROP');
      const meta = await sharp(out.buffer).metadata();
      expect(meta.format).toBe('jpeg');
      expect(out.width).toBe(meta.width);
      expect(out.height).toBe(meta.height);
      const ratio = { SQUARE: 1, PORTRAIT: 0.8, LANDSCAPE: 1.91 }[aspect];
      expect(out.width / out.height).toBeCloseTo(ratio, 2);
      expect(out.width).toBeLessThanOrEqual(1440);
    },
  );

  it('limita el ancho a 1440 px', async () => {
    const out = await processor.process(
      await solid(3000, 3000),
      'SQUARE',
      'CROP',
    );
    expect(out.width).toBe(1440);
    expect(out.height).toBe(1440);
  });

  it('no agranda una imagen chica', async () => {
    const out = await processor.process(
      await solid(300, 300),
      'SQUARE',
      'CROP',
    );
    expect(out.width).toBe(300);
  });

  it('CROP de una foto apaisada a 4:5 quita los costados y conserva el centro', async () => {
    // Franja roja al centro, azul a los costados: tras recortar solo queda lo central
    const centerBar = await sharp({
      create: { width: 200, height: 400, channels: 3, background: '#ff0000' },
    })
      .png()
      .toBuffer();
    const src = await sharp({
      create: { width: 1000, height: 400, channels: 3, background: '#0000ff' },
    })
      .composite([{ input: centerBar, left: 400, top: 0 }])
      .png()
      .toBuffer();
    const out = await processor.process(src, 'PORTRAIT', 'CROP');
    expect(out.width).toBe(320);
    expect(out.height).toBe(400);
    expect(await centerPixel(out.buffer)).toEqual([
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
    ]);
    const [r, , b] = await centerPixel(out.buffer, 160, 200);
    expect(r).toBeGreaterThan(200);
    expect(b).toBeLessThan(60);
  });

  it('PAD conserva toda la imagen y rellena con el color pedido', async () => {
    const src = await solid(1000, 500, 'png', { r: 255, g: 0, b: 0, alpha: 1 });
    const out = await processor.process(src, 'SQUARE', 'PAD', '#00ff00');
    expect(out.width).toBe(out.height);
    expect(out.width).toBe(1000);
    const [tr, tg, tb] = await centerPixel(out.buffer, 500, 10);
    expect(tg).toBeGreaterThan(200);
    expect(tr).toBeLessThan(60);
    expect(tb).toBeLessThan(60);
    const [cr] = await centerPixel(out.buffer);
    expect(cr).toBeGreaterThan(200);
  });

  it('PAD usa blanco por defecto', async () => {
    const out = await processor.process(
      await solid(1000, 500),
      'SQUARE',
      'PAD',
    );
    const [r, g, b] = await centerPixel(out.buffer, 500, 5);
    expect(Math.min(r, g, b)).toBeGreaterThan(240);
  });

  it('aplica la rotacion EXIF antes de recortar', async () => {
    const rotated = await sharp(await solid(400, 200))
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    const out = await processor.process(rotated, 'PORTRAIT', 'PAD');
    // Tras girar es 200x400 (4:5 -> lienzo 320x400): la imagen no queda de costado
    expect(out.width).toBe(320);
    expect(out.height).toBe(400);
  });

  it('una PNG con transparencia sale con fondo opaco, no negro', async () => {
    const src = await solid(500, 500, 'png', { r: 0, g: 0, b: 0, alpha: 0 });
    const out = await processor.process(src, 'SQUARE', 'CROP');
    const [r, g, b] = await centerPixel(out.buffer);
    expect(Math.min(r, g, b)).toBeGreaterThan(240);
  });

  it('descarta los metadatos EXIF (ubicacion, camara) de la salida', async () => {
    const src = await sharp(await solid(100, 100))
      .withExif({ IFD0: { Copyright: 'secreto' } })
      .jpeg()
      .toBuffer();
    const out = await processor.process(src, 'SQUARE', 'CROP');
    expect((await sharp(out.buffer).metadata()).exif).toBeUndefined();
  });

  it('rechaza una imagen invalida', async () => {
    await expect(
      processor.process(Buffer.from('nope'), 'SQUARE', 'CROP'),
    ).rejects.toBeInstanceOf(InvalidImageError);
  });
});
