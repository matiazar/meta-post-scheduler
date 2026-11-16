import { slugify } from './slugify.js';

describe('slugify', () => {
  it.each([
    ['Kalendox', 'kalendox'],
    ['Envíos Box', 'envios-box'],
    ['  MercadoScanner  ', 'mercadoscanner'],
    ['Mi App -- 2.0!', 'mi-app-2-0'],
    ['Ñandú', 'nandu'],
  ])('%s -> %s', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it('devuelve vacio si no hay caracteres utiles', () => {
    expect(slugify('!!! ???')).toBe('');
    expect(slugify('日本')).toBe('');
  });

  it('limita el largo a 60 sin dejar guion final', () => {
    const slug = slugify(`${'a'.repeat(59)} b`);
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith('-')).toBe(false);
  });
});
