import type { Tone } from '@/components/ui/badge';
import type { PostStatus, TargetStatus } from '@/lib/api/resources';

/** `dot` es el color del puntito de estado en los chips del calendario. */
export const POST_STATUS: Record<
  PostStatus,
  { label: string; tone: Tone; dot: string }
> = {
  DRAFT: { label: 'Borrador', tone: 'neutral', dot: 'bg-muted' },
  SCHEDULED: { label: 'Programado', tone: 'info', dot: 'bg-info' },
  PUBLISHING: {
    label: 'Publicando',
    tone: 'warning',
    dot: 'bg-warning animate-pulse',
  },
  PUBLISHED: { label: 'Publicado', tone: 'success', dot: 'bg-success' },
  PARTIAL: { label: 'Parcial', tone: 'orange', dot: 'bg-orange' },
  FAILED: { label: 'Falló', tone: 'danger', dot: 'bg-danger' },
  CANCELLED: { label: 'Cancelado', tone: 'neutral', dot: 'bg-muted' },
};

export const TARGET_STATUS: Record<
  TargetStatus,
  { label: string; tone: Tone }
> = {
  PENDING: { label: 'Pendiente', tone: 'neutral' },
  QUEUED: { label: 'En cola', tone: 'info' },
  PUBLISHING: { label: 'Publicando', tone: 'warning' },
  PUBLISHED: { label: 'Publicado', tone: 'success' },
  FAILED: { label: 'Falló', tone: 'danger' },
};
