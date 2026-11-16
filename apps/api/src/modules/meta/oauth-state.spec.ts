import { createOAuthState, verifyOAuthState } from './oauth-state.js';

const SECRET = 's'.repeat(32);

describe('oauth state', () => {
  it('un state recien creado valida con su nonce', () => {
    const { state, nonce } = createOAuthState(SECRET);
    expect(verifyOAuthState(SECRET, state, nonce)).toBe(true);
  });

  it('rechaza si falta la cookie o es de otro navegador', () => {
    const { state } = createOAuthState(SECRET);
    expect(verifyOAuthState(SECRET, state, undefined)).toBe(false);
    expect(verifyOAuthState(SECRET, state, 'otro-nonce')).toBe(false);
  });

  it('rechaza un state alterado o firmado con otro secreto', () => {
    const { state, nonce } = createOAuthState(SECRET);
    expect(verifyOAuthState(SECRET, `${state}x`, nonce)).toBe(false);
    expect(verifyOAuthState('t'.repeat(32), state, nonce)).toBe(false);
    const [n, , sig] = state.split('.');
    expect(
      verifyOAuthState(SECRET, `${n}.${Date.now() + 9e9}.${sig}`, nonce),
    ).toBe(false);
  });

  it('rechaza formatos invalidos', () => {
    expect(verifyOAuthState(SECRET, 'basura', 'x')).toBe(false);
    expect(verifyOAuthState(SECRET, '', 'x')).toBe(false);
  });

  it('vence a los 10 minutos', () => {
    const t0 = 1_000_000;
    const { state, nonce } = createOAuthState(SECRET, t0);
    expect(verifyOAuthState(SECRET, state, nonce, t0 + 9 * 60_000)).toBe(true);
    expect(verifyOAuthState(SECRET, state, nonce, t0 + 11 * 60_000)).toBe(
      false,
    );
  });
});
