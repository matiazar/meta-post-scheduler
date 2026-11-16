'use client';

import { useCallback, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ExternalLink, ImageOff, Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { mediaApi, postsApi } from '@/lib/api/resources';
import { POST_STATUS, TARGET_STATUS } from '@/lib/post-status';
import { formatZoned } from '@/lib/tz';
import { useApiData } from '@/lib/use-api-data';

const NETWORK_LABEL = { FACEBOOK: 'Facebook', INSTAGRAM: 'Instagram' } as const;
const CANCELLABLE = ['DRAFT', 'SCHEDULED', 'PUBLISHING'];
const EDITABLE = ['DRAFT', 'SCHEDULED'];

/** El permalink viene de Meta: solo se enlaza si es https. */
function safeLink(url: string | null): string | null {
  return url && url.startsWith('https://') ? url : null;
}

interface Props {
  postId: string;
  /** Algo cambio en el servidor: el calendario tiene que recargar */
  onChanged: () => void;
  onClose: () => void;
}

type Pending = 'cancel' | 'remove' | null;

export function PostDetail({ postId, onChanged, onClose }: Props) {
  const toast = useToast();
  const load = useCallback(() => postsApi.get(postId), [postId]);
  const { data: post, error, loading, refresh } = useApiData(load);
  const [confirm, setConfirm] = useState<Pending>(null);
  const [busy, setBusy] = useState<'retry' | 'cancel' | 'remove' | null>(null);

  if (loading) {
    return <div className="h-48 animate-pulse rounded-lg bg-surface-muted" />;
  }
  if (error || !post) {
    return (
      <div
        role="alert"
        className="rounded-lg bg-danger-soft p-4 text-sm text-danger"
      >
        {error ?? 'No se pudo cargar el post'}
        <div className="mt-3">
          <Button variant="secondary" onClick={() => void refresh()}>
            Reintentar
          </Button>
        </div>
      </div>
    );
  }

  async function run(
    action: 'retry' | 'cancel' | 'remove',
    call: () => Promise<unknown>,
    success: string,
  ) {
    setBusy(action);
    try {
      await call();
      toast.success(success);
      onChanged();
      if (action === 'remove') onClose();
      else await refresh();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : 'No se pudo completar la acción',
      );
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  }

  const status = POST_STATUS[post.status];
  return (
    <div className="flex flex-col gap-5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={status.tone}>{status.label}</Badge>
        <span className="flex items-center gap-1.5">
          <span
            className="size-3 rounded-full"
            style={{ backgroundColor: post.brand.color }}
            aria-hidden
          />
          {post.brand.name}
        </span>
        {post.scheduledAt && (
          <span className="text-muted">
            {formatZoned(post.scheduledAt)} (Tucumán)
          </span>
        )}
      </div>

      {post.media.length > 0 && (
        <ul className="grid grid-cols-4 gap-2">
          {post.media.map((m) => (
            <li
              key={m.mediaId}
              className="relative overflow-hidden rounded-md bg-surface-muted"
              style={{ aspectRatio: '1 / 1' }}
            >
              <Image
                src={mediaApi.previewUrl(
                  m.mediaId,
                  post.aspectRatio,
                  post.fitMode,
                )}
                alt={m.filename}
                fill
                unoptimized
                sizes="96px"
                className="object-cover"
              />
              <ImageOff
                className="absolute inset-0 -z-10 m-auto size-4 text-muted"
                aria-hidden
              />
            </li>
          ))}
        </ul>
      )}

      <p className="whitespace-pre-line">
        {post.caption.trim() || <span className="text-muted">Sin texto</span>}
      </p>

      <section aria-label="Destinos">
        <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">
          Destinos
        </h3>
        {post.targets.length === 0 ? (
          <p className="mt-2 text-muted">Todavía no tiene cuentas elegidas.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {post.targets.map((t) => {
              const ts = TARGET_STATUS[t.status];
              const link = safeLink(t.permalink);
              return (
                <li key={t.id} className="rounded-lg border border-line p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{t.accountName}</span>
                    <Badge tone={t.network === 'FACEBOOK' ? 'info' : 'orange'}>
                      {NETWORK_LABEL[t.network]}
                    </Badge>
                    <Badge tone={ts.tone}>{ts.label}</Badge>
                  </div>
                  {t.lastError && (
                    <p
                      role="alert"
                      className="mt-2 rounded-md bg-danger-soft p-2 text-xs text-danger"
                    >
                      {t.lastError}
                    </p>
                  )}
                  {t.status === 'PENDING' &&
                    t.nextAttemptAt &&
                    t.attempts > 0 && (
                      <p className="mt-2 text-xs text-muted">
                        Se vuelve a intentar el {formatZoned(t.nextAttemptAt)}.
                      </p>
                    )}
                  {t.status === 'PUBLISHED' && t.publishedAt && (
                    <p className="mt-2 text-xs text-muted">
                      Publicado el {formatZoned(t.publishedAt)}.
                    </p>
                  )}
                  {link && (
                    <a
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-xs text-accent hover:underline"
                    >
                      Ver publicación
                      <ExternalLink className="size-3" aria-hidden />
                    </a>
                  )}
                  {t.attemptLog.length > 0 && (
                    <details className="mt-2 text-xs">
                      <summary className="cursor-pointer text-muted">
                        Historial de intentos ({t.attemptLog.length})
                      </summary>
                      <ol className="mt-1.5 flex flex-col gap-1">
                        {t.attemptLog.map((a) => (
                          <li key={a.startedAt} className="flex gap-2">
                            <span className="shrink-0 text-muted">
                              {formatZoned(a.startedAt)}
                            </span>
                            <span
                              className={a.ok ? 'text-success' : 'text-danger'}
                            >
                              {a.ok
                                ? 'Publicó bien'
                                : (a.errorMessage ?? 'Falló sin detalle')}
                            </span>
                          </li>
                        ))}
                      </ol>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        {EDITABLE.includes(post.status) && (
          <Link
            href={`/posts/${post.id}`}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-accent px-3.5 text-sm font-medium text-accent-foreground hover:bg-accent-hover"
          >
            <Pencil className="size-4" aria-hidden />
            Editar
          </Link>
        )}
        {(post.status === 'FAILED' || post.status === 'PARTIAL') && (
          <Button
            loading={busy === 'retry'}
            onClick={() =>
              void run(
                'retry',
                () => postsApi.retry(post.id),
                'Reintento en marcha: se publica en el próximo minuto',
              )
            }
          >
            Reintentar fallidos
          </Button>
        )}
        {CANCELLABLE.includes(post.status) && (
          <Button variant="secondary" onClick={() => setConfirm('cancel')}>
            Cancelar publicación
          </Button>
        )}
        {(post.status === 'DRAFT' || post.status === 'CANCELLED') && (
          <Button variant="ghost" onClick={() => setConfirm('remove')}>
            Eliminar
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={confirm === 'cancel'}
        title="¿Cancelar la publicación?"
        description="El post no se publica y queda como cancelado. No se puede volver a abrir: si lo querés de nuevo, tenés que crear otro."
        confirmLabel="Cancelar publicación"
        loading={busy === 'cancel'}
        onConfirm={() =>
          void run(
            'cancel',
            () => postsApi.cancel(post.id),
            'Publicación cancelada',
          )
        }
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'remove'}
        title="¿Eliminar el post?"
        description="Se borra el post y sus imágenes procesadas. Esto no se puede deshacer."
        confirmLabel="Eliminar post"
        loading={busy === 'remove'}
        onConfirm={() =>
          void run('remove', () => postsApi.remove(post.id), 'Post eliminado')
        }
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
