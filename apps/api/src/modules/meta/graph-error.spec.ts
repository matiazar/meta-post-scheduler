import { mapGraphError } from './graph-error.js';

const body = (code: number, subcode?: number, message = 'msg') => ({
  error: { message, code, error_subcode: subcode },
});

describe('mapGraphError', () => {
  it.each([1, 2, 4, 17, 32, 613])('codigo %i es transitorio', (code) => {
    expect(mapGraphError(400, body(code)).isTransient).toBe(true);
  });

  it.each([2207001, 2207003, 2207008, 2207027, 2207032])(
    'subcode %i es transitorio',
    (subcode) => {
      expect(mapGraphError(400, body(100, subcode)).isTransient).toBe(true);
    },
  );

  it.each([190, 10, 200, 100])('codigo %i es permanente', (code) => {
    const error = mapGraphError(400, body(code));
    expect(error.isTransient).toBe(false);
    expect(error.isDailyLimit).toBe(false);
    expect(error.code).toBe(code);
  });

  it('un subcode de IG no listado es permanente', () => {
    expect(mapGraphError(400, body(100, 2207026)).isTransient).toBe(false);
  });

  it('el limite diario de IG no es transitorio ni permanente: se marca aparte', () => {
    const bySubcode = mapGraphError(400, body(4, 2207042));
    expect(bySubcode.isDailyLimit).toBe(true);
    expect(bySubcode.isTransient).toBe(false);
    expect(mapGraphError(400, body(9)).isDailyLimit).toBe(true);
  });

  it('un 5xx es transitorio aunque no traiga cuerpo', () => {
    const error = mapGraphError(503, null);
    expect(error.isTransient).toBe(true);
    expect(error.message).toContain('503');
  });

  it('usa el mensaje de Meta y ignora cuerpos con forma inesperada', () => {
    expect(
      mapGraphError(400, body(100, undefined, 'Invalid param')).message,
    ).toBe('Invalid param');
    const weird = mapGraphError(400, { error: { code: 'x', message: 5 } });
    expect(weird.code).toBeNull();
    expect(weird.message).toContain('400');
  });
});
