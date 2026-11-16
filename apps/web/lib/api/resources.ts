import { api } from './client';

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
