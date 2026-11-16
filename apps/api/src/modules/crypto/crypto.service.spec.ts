import { randomBytes } from 'node:crypto';
import { makeTestEnv } from '../../../test/helpers/test-env.js';
import { DecryptionFailedException } from './crypto.exceptions.js';
import { CryptoService } from './crypto.service.js';

const service = new CryptoService(makeTestEnv());

describe('CryptoService', () => {
  it('cifra y descifra de ida y vuelta', () => {
    const token = 'EAAB-token-de-prueba_123';
    expect(service.decrypt(service.encrypt(token))).toBe(token);
  });

  it('soporta texto vacio y caracteres no ASCII', () => {
    expect(service.decrypt(service.encrypt(''))).toBe('');
    expect(service.decrypt(service.encrypt('año ñandú 日本'))).toBe(
      'año ñandú 日本',
    );
  });

  it('el resultado no contiene el texto original y cambia en cada cifrado (IV aleatorio)', () => {
    const a = service.encrypt('secreto');
    const b = service.encrypt('secreto');
    expect(a).not.toContain('secreto');
    expect(a).not.toBe(b);
    expect(a.startsWith('v1:')).toBe(true);
  });

  it('detecta un dato alterado', () => {
    const payload = service.encrypt('secreto');
    const raw = Buffer.from(payload.slice(3), 'base64');
    raw[raw.length - 1] ^= 0xff;
    const tampered = `v1:${raw.toString('base64')}`;
    expect(() => service.decrypt(tampered)).toThrow(DecryptionFailedException);
  });

  it('no descifra con otra clave', () => {
    const other = new CryptoService(
      makeTestEnv({ TOKEN_ENC_KEY: randomBytes(32).toString('base64') }),
    );
    expect(() => other.decrypt(service.encrypt('secreto'))).toThrow(
      DecryptionFailedException,
    );
  });

  it.each(['', 'sin-version', 'v1:', 'v1:corto', 'v2:AAAA'])(
    'rechaza un formato invalido (%s)',
    (payload) => {
      expect(() => service.decrypt(payload)).toThrow(DecryptionFailedException);
    },
  );
});
