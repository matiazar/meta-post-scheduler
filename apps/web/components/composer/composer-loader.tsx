'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  accountsApi,
  brandsApi,
  postsApi,
  type PostView,
} from '@/lib/api/resources';
import { POST_STATUS } from '@/lib/post-status';
import { useApiData } from '@/lib/use-api-data';
import { Composer } from './composer';

function Skeleton() {
  return (
    <div className="mt-5 flex flex-col gap-4" aria-busy="true">
      <div className="h-40 animate-pulse rounded-lg bg-surface-muted" />
      <div className="h-56 animate-pulse rounded-lg bg-surface-muted" />
    </div>
  );
}

function LoadError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="mt-5 rounded-lg bg-danger-soft p-4 text-sm text-danger"
    >
      {message}
      <div className="mt-3 flex gap-2">
        <Button variant="secondary" onClick={onRetry}>
          Reintentar
        </Button>
        <Link
          href="/"
          className="inline-flex h-9 items-center rounded-md px-3.5 text-sm text-foreground hover:bg-surface-muted"
        >
          Volver al calendario
        </Link>
      </div>
    </div>
  );
}

function NotEditable({ post }: { post: PostView }) {
  const info = POST_STATUS[post.status];
  return (
    <div className="mt-5 rounded-lg border border-line bg-surface p-5 text-sm">
      <Badge tone={info.tone}>{info.label}</Badge>
      <p className="mt-2">
        Este post ya no se puede editar: solo los borradores y los programados
        que todavía no empezaron a publicarse.
      </p>
      <Link href="/" className="mt-3 inline-block text-accent underline">
        Volver al calendario
      </Link>
    </div>
  );
}

const EDITABLE = ['DRAFT', 'SCHEDULED'];

/** Carga marcas, cuentas y (al editar) el post, y muestra el composer cuando estan. */
export function ComposerLoader({ postId }: { postId?: string }) {
  const brands = useApiData(brandsApi.list);
  const accounts = useApiData(accountsApi.list);
  const loadPost = useCallback(
    () => (postId ? postsApi.get(postId) : Promise.resolve(null)),
    [postId],
  );
  const post = useApiData(loadPost);

  if (brands.loading || accounts.loading || post.loading) return <Skeleton />;
  if (brands.error || !brands.data) {
    return (
      <LoadError
        message={brands.error ?? 'No se pudieron cargar las marcas'}
        onRetry={() => void brands.refresh()}
      />
    );
  }
  if (accounts.error || !accounts.data) {
    return (
      <LoadError
        message={accounts.error ?? 'No se pudieron cargar las cuentas'}
        onRetry={() => void accounts.refresh()}
      />
    );
  }
  if (post.error) {
    return (
      <LoadError message={post.error} onRetry={() => void post.refresh()} />
    );
  }
  if (post.data && !EDITABLE.includes(post.data.status)) {
    return <NotEditable post={post.data} />;
  }

  return (
    <Composer
      brands={brands.data}
      accounts={accounts.data}
      post={post.data ?? undefined}
    />
  );
}
