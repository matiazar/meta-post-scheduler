import { API_URL, api } from './client';

export type Network = 'FACEBOOK' | 'INSTAGRAM';

export interface Brand {
  id: string;
  name: string;
  slug: string;
  color: string;
  defaultHashtags: string;
  signature: string;
  active: boolean;
}

export interface BrandInput {
  name: string;
  slug?: string;
  color?: string;
  defaultHashtags?: string;
  signature?: string;
  active?: boolean;
}

export interface SocialAccount {
  id: string;
  brandId: string | null;
  network: Network;
  externalId: string;
  name: string;
  username: string | null;
  pictureUrl: string | null;
  active: boolean;
}

export interface MetaStatus {
  connected: boolean;
  status: 'ACTIVE' | 'INVALID' | null;
  fbUserName: string | null;
  tokenExpiresAt: string | null;
  lastSyncedAt: string | null;
}

export interface SyncResult {
  facebook: number;
  instagram: number;
  deactivated: number;
  missingPermissions: string[];
}

export type AspectRatio = 'SQUARE' | 'PORTRAIT' | 'LANDSCAPE';
export type FitMode = 'CROP' | 'PAD';
export type PostStatus =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'PUBLISHING'
  | 'PUBLISHED'
  | 'PARTIAL'
  | 'FAILED'
  | 'CANCELLED';

export interface MediaView {
  id: string;
  filename: string;
  width: number;
  height: number;
  sizeBytes: number;
  mime: string;
  originalUrl: string;
}

/** Las fechas llegan como texto ISO 8601 en UTC. */
export interface PostView {
  id: string;
  brand: { id: string; name: string; slug: string; color: string };
  caption: string;
  scheduledAt: string | null;
  aspectRatio: AspectRatio;
  fitMode: FitMode;
  status: PostStatus;
  media: { mediaId: string; position: number; filename: string }[];
  targets: {
    id: string;
    socialAccountId: string;
    network: Network;
    accountName: string;
    username: string | null;
    captionOverride: string | null;
    status: TargetStatus;
    attempts: number;
    nextAttemptAt: string | null;
    lastError: string | null;
    lastErrorCode: string | null;
    permalink: string | null;
    publishedAt: string | null;
    attemptLog: {
      startedAt: string;
      finishedAt: string | null;
      ok: boolean;
      errorCode: string | null;
      errorMessage: string | null;
    }[];
  }[];
}

export type TargetStatus =
  'PENDING' | 'QUEUED' | 'PUBLISHING' | 'PUBLISHED' | 'FAILED';

/** Un post del calendario (la API recorta el texto a 140 caracteres). */
export interface PostListItem {
  id: string;
  brand: { id: string; name: string; color: string };
  caption: string;
  scheduledAt: string | null;
  status: PostStatus;
  aspectRatio: AspectRatio;
  thumbnailUrl: string | null;
  mediaCount: number;
  targets: { network: Network; accountName: string; status: TargetStatus }[];
}

export interface PostInput {
  caption: string;
  aspectRatio: AspectRatio;
  fitMode: FitMode;
  mediaIds: string[];
  targets: { socialAccountId: string; captionOverride?: string }[];
}

export const authApi = {
  login: (email: string, password: string) =>
    api<{ email: string }>('/auth/login', {
      method: 'POST',
      body: { email, password },
    }),
  logout: () => api<void>('/auth/logout', { method: 'POST' }),
};

export const brandsApi = {
  list: () => api<Brand[]>('/brands'),
  create: (input: BrandInput) =>
    api<Brand>('/brands', { method: 'POST', body: input }),
  update: (id: string, input: Partial<BrandInput>) =>
    api<Brand>(`/brands/${id}`, { method: 'PATCH', body: input }),
  remove: (id: string) => api<void>(`/brands/${id}`, { method: 'DELETE' }),
};

export const accountsApi = {
  list: () => api<SocialAccount[]>('/social-accounts'),
  assignBrand: (id: string, brandId: string | null) =>
    api<SocialAccount>(`/social-accounts/${id}`, {
      method: 'PATCH',
      body: { brandId },
    }),
};

export const metaApi = {
  status: () => api<MetaStatus>('/meta/status'),
  connectUrl: () => api<{ url: string }>('/meta/connect-url'),
  sync: () => api<SyncResult>('/meta/sync', { method: 'POST' }),
};

export const mediaApi = {
  /** Sube hasta 10 imagenes juntas (campo `files`). */
  upload: (files: File[]) => {
    const form = new FormData();
    for (const file of files) form.append('files', file);
    return api<MediaView[]>('/media', { method: 'POST', body: form });
  },
  /** La imagen tal como se publicara (JPEG al vuelo). Se pide con la cookie de sesion. */
  previewUrl: (id: string, aspectRatio: AspectRatio, fitMode: FitMode) =>
    `${API_URL}/media/${encodeURIComponent(id)}/preview?aspectRatio=${aspectRatio}&fitMode=${fitMode}`,
};

export const postsApi = {
  /** Posts con fecha en [from, to) (ISO UTC, hasta 100 dias), opcionalmente de una marca. */
  range: (from: string, to: string, brandId?: string) =>
    api<PostListItem[]>(
      `/posts?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${
        brandId ? `&brandId=${encodeURIComponent(brandId)}` : ''
      }`,
    ),
  /** Borradores (con o sin fecha). */
  drafts: (brandId?: string) =>
    api<PostListItem[]>(
      `/posts?status=DRAFT${brandId ? `&brandId=${encodeURIComponent(brandId)}` : ''}`,
    ),
  cancel: (id: string) =>
    api<PostView>(`/posts/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
    }),
  retry: (id: string) =>
    api<PostView>(`/posts/${encodeURIComponent(id)}/retry`, { method: 'POST' }),
  remove: (id: string) =>
    api<void>(`/posts/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  get: (id: string) => api<PostView>(`/posts/${encodeURIComponent(id)}`),
  create: (input: PostInput & { brandId: string; scheduledAt?: string }) =>
    api<PostView>('/posts', { method: 'POST', body: input }),
  update: (
    id: string,
    input: Partial<PostInput> & { scheduledAt?: string | null },
  ) =>
    api<PostView>(`/posts/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: input,
    }),
  schedule: (id: string, scheduledAt: string) =>
    api<PostView>(`/posts/${encodeURIComponent(id)}/schedule`, {
      method: 'POST',
      body: { scheduledAt },
    }),
  publishNow: (id: string) =>
    api<PostView>(`/posts/${encodeURIComponent(id)}/publish-now`, {
      method: 'POST',
    }),
};
