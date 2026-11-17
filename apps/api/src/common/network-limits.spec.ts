import {
  CAPTION_LIMITS,
  captionLength,
  countChars,
  countThreadsChars,
} from './network-limits.js';

describe('network-limits', () => {
  it('cada red tiene su tope (Facebook sin tope propio)', () => {
    expect(CAPTION_LIMITS).toEqual({
      FACEBOOK: null,
      INSTAGRAM: 2200,
      THREADS: 500,
    });
  });

  it('countChars cuenta puntos de codigo: un emoji vale 1', () => {
    expect(countChars('hola')).toBe(4);
    expect(countChars('😀😀')).toBe(2);
  });

  it('Threads cuenta los emojis por sus bytes UTF-8 y el resto de a 1', () => {
    expect(countThreadsChars('hola ñandú')).toBe(10);
    expect(countThreadsChars('😀')).toBe(4);
    expect(countThreadsChars('a😀b')).toBe(6);
  });

  it('captionLength elige el conteo segun la red', () => {
    expect(captionLength('INSTAGRAM', '😀')).toBe(1);
    expect(captionLength('FACEBOOK', '😀')).toBe(1);
    expect(captionLength('THREADS', '😀')).toBe(4);
  });
});
