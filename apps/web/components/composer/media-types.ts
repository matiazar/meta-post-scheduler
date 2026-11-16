import type { AspectRatio } from '@/lib/api/resources';

/** Una imagen ya subida que forma parte del post. */
export interface MediaItem {
  mediaId: string;
  filename: string;
}

/** Proporcion CSS de cada formato (el mismo que genera la API). */
export const RATIO_CSS: Record<AspectRatio, string> = {
  SQUARE: '1 / 1',
  PORTRAIT: '4 / 5',
  LANDSCAPE: '1.91 / 1',
};
