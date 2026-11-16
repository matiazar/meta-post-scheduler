import { REDACTED, redact, redactString } from './redact.js';

describe('redact', () => {
  it('tapa campos sensibles por nombre, a cualquier profundidad', () => {
    const result = redact({
      user: 'matias',
      access_token: 'abc',
      nested: { password: 'p', Authorization: 'Bearer x', ok: 1 },
      list: [{ pageToken: 't' }],
    });
    expect(result).toEqual({
      user: 'matias',
      access_token: REDACTED,
      nested: { password: REDACTED, Authorization: REDACTED, ok: 1 },
      list: [{ pageToken: REDACTED }],
    });
  });

  it('tapa tokens dentro de URLs y textos', () => {
    const text = redactString(
      'GET /me?fields=id&access_token=EAAB123&x=1 con Bearer abc.def-ghi',
    );
    expect(text).not.toContain('EAAB123');
    expect(text).not.toContain('abc.def-ghi');
    expect(text).toContain('fields=id');
    expect(text).toContain('x=1');
  });

  it('tapa tokens en JSON y el code de OAuth, sin tapar texto comun', () => {
    const text = redactString(
      '{"access_token":"EAAB999","id":"1"} /cb?code=AUTHCODE&state=s status code=500',
    );
    expect(text).not.toContain('EAAB999');
    expect(text).not.toContain('AUTHCODE');
    expect(text).toContain('"id":"1"');
    expect(text).toContain('status code=500');
  });
});
