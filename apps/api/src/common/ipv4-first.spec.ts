import { getDefaultResultOrder } from 'node:dns';
import { describe, expect, it } from 'vitest';

describe('ipv4-first', () => {
  it('deja IPv4 como primera opcion al resolver DNS', async () => {
    await import('./ipv4-first.js');
    expect(getDefaultResultOrder()).toBe('ipv4first');
  });
});
