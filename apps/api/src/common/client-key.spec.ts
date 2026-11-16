import { clientKeyFromIp } from './client-key.js';

describe('clientKeyFromIp', () => {
  it('deja las IPv4 tal cual', () => {
    expect(clientKeyFromIp('203.0.113.7')).toBe('203.0.113.7');
  });

  it('convierte IPv4 mapeadas en IPv6 a su IPv4', () => {
    expect(clientKeyFromIp('::ffff:203.0.113.7')).toBe('203.0.113.7');
  });

  it('agrupa por /64: distintas direcciones del mismo /64 dan la misma clave', () => {
    const a = clientKeyFromIp('2001:db8:abcd:12::1');
    const b = clientKeyFromIp('2001:0db8:abcd:0012:ffff:ffff:ffff:ffff');
    expect(a).toBe('2001:0db8:abcd:0012::/64');
    expect(b).toBe(a);
  });

  it('IPv6 de /64 distintos dan claves distintas', () => {
    expect(clientKeyFromIp('2001:db8:abcd:12::1')).not.toBe(
      clientKeyFromIp('2001:db8:abcd:13::1'),
    );
  });

  it('maneja formas comprimidas, loopback y zona', () => {
    expect(clientKeyFromIp('::1')).toBe('0000:0000:0000:0000::/64');
    expect(clientKeyFromIp('fe80::1%eth0')).toBe('fe80:0000:0000:0000::/64');
  });

  it('sin IP usa una clave comun', () => {
    expect(clientKeyFromIp(undefined)).toBe('unknown');
  });
});
