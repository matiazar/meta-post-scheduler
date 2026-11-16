import type { Tone } from '@/components/ui/badge';
import type { PostStatus } from '@/lib/api/resources';

export const POST_STATUS: Record<PostStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Borrador', tone: 'neutral' },
  SCHEDULED: { label: 'Programado', tone: 'info' },
  PUBLISHING: { label: 'Publicando', tone: 'warning' },
  PUBLISHED: { label: 'Publicado', tone: 'success' },
  PARTIAL: { label: 'Parcial', tone: 'orange' },
  FAILED: { label: 'Falló', tone: 'danger' },
  CANCELLED: { label: 'Cancelado', tone: 'neutral' },
};
