import type { TargetStatus } from '../../generated/prisma/client.js';
import { derivePostStatus } from './post-status.js';

const t = (status: TargetStatus, attempts = 0) => ({ status, attempts });

describe('derivePostStatus', () => {
  it('DRAFT y CANCELLED no se recalculan', () => {
    expect(derivePostStatus('DRAFT', [t('PUBLISHED')])).toBe('DRAFT');
    expect(derivePostStatus('CANCELLED', [t('FAILED')])).toBe('CANCELLED');
  });

  it('todos pendientes y sin intentos = SCHEDULED', () => {
    expect(derivePostStatus('SCHEDULED', [t('PENDING'), t('PENDING')])).toBe(
      'SCHEDULED',
    );
  });

  it('alguno en cola o publicando = PUBLISHING', () => {
    expect(derivePostStatus('SCHEDULED', [t('QUEUED'), t('PENDING')])).toBe(
      'PUBLISHING',
    );
    expect(
      derivePostStatus('SCHEDULED', [t('PUBLISHING'), t('PUBLISHED')]),
    ).toBe('PUBLISHING');
  });

  it('un pendiente esperando reintento (attempts > 0) = PUBLISHING', () => {
    expect(derivePostStatus('SCHEDULED', [t('PENDING', 1), t('PENDING')])).toBe(
      'PUBLISHING',
    );
  });

  it('pendiente tras reintentar con otro ya publicado = PUBLISHING', () => {
    expect(derivePostStatus('PARTIAL', [t('PENDING'), t('PUBLISHED')])).toBe(
      'PUBLISHING',
    );
  });

  it('todos publicados = PUBLISHED', () => {
    expect(
      derivePostStatus('PUBLISHING', [t('PUBLISHED'), t('PUBLISHED')]),
    ).toBe('PUBLISHED');
  });

  it('publicados y fallidos, sin pendientes = PARTIAL', () => {
    expect(
      derivePostStatus('PUBLISHING', [t('PUBLISHED'), t('FAILED', 4)]),
    ).toBe('PARTIAL');
  });

  it('todos fallidos = FAILED', () => {
    expect(
      derivePostStatus('PUBLISHING', [t('FAILED', 4), t('FAILED', 1)]),
    ).toBe('FAILED');
  });

  it('sin destinos no cambia el estado', () => {
    expect(derivePostStatus('SCHEDULED', [])).toBe('SCHEDULED');
  });
});
