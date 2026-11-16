import type {
  PostStatus,
  TargetStatus,
} from '../../generated/prisma/client.js';

export interface TargetState {
  status: TargetStatus;
  attempts: number;
}

/**
 * Estado del post derivado de sus destinos (DEC-07). DRAFT y CANCELLED los pone el
 * usuario y no se recalculan. Sin destinos no hay nada que derivar: queda como esta.
 */
export function derivePostStatus(
  current: PostStatus,
  targets: TargetState[],
): PostStatus {
  if (current === 'DRAFT' || current === 'CANCELLED') return current;
  if (targets.length === 0) return current;

  const has = (status: TargetStatus) =>
    targets.some((t) => t.status === status);

  if (targets.every((t) => t.status === 'PUBLISHED')) return 'PUBLISHED';
  if (has('QUEUED') || has('PUBLISHING')) return 'PUBLISHING';

  if (has('PENDING')) {
    // Todo pendiente y sin tocar = programado; si ya hubo intentos o resultados, esta en curso
    const untouched =
      !has('PUBLISHED') &&
      !has('FAILED') &&
      targets.every((t) => t.attempts === 0);
    return untouched ? 'SCHEDULED' : 'PUBLISHING';
  }

  // Sin pendientes: solo quedan PUBLISHED y FAILED
  return has('PUBLISHED') ? 'PARTIAL' : 'FAILED';
}
