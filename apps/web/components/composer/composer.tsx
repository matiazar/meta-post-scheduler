'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Send,
  Square,
  RectangleHorizontal,
  RectangleVertical,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Field, Input, Select, describedBy } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import {
  postsApi,
  type AiNetwork,
  type Brand,
  type PostInput,
  type PostStatus,
  type PostView,
  type SocialAccount,
} from '@/lib/api/resources';
import { POST_STATUS } from '@/lib/post-status';
import { isFuture, isoToZoned, sameMinute, zonedToIso } from '@/lib/tz';
import {
  IG_CAPTION_LIMIT,
  composerSchema,
  countChars,
  type ComposerValues,
} from '@/lib/validations/forms';
import { AiSuggest } from './ai-suggest';
import { CaptionEditor, type CaptionTab } from './caption-editor';
import { ChoiceCard } from './choice-card';
import { FeedPreview } from './feed-preview';
import { ImagePicker } from './image-picker';
import type { MediaItem } from './media-types';

const NETWORK_LABEL = { FACEBOOK: 'Facebook', INSTAGRAM: 'Instagram' } as const;

type Action = 'save' | 'schedule' | 'publish';

interface Props {
  brands: Brand[];
  accounts: SocialAccount[];
  /** Si viene, se edita ese post; si no, se crea uno nuevo */
  post?: PostView;
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-line bg-surface p-4 md:p-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function Composer({ brands, accounts, post }: Props) {
  const router = useRouter();
  const toast = useToast();

  const [postId, setPostId] = useState<string | null>(post?.id ?? null);
  const [status, setStatus] = useState<PostStatus>(post?.status ?? 'DRAFT');
  const [savedIso, setSavedIso] = useState<string | null>(
    post?.scheduledAt ?? null,
  );
  const [brandId, setBrandId] = useState(post?.brand.id ?? '');
  const [items, setItems] = useState<MediaItem[]>(() =>
    post
      ? [...post.media]
          .sort((a, b) => a.position - b.position)
          .map((m) => ({ mediaId: m.mediaId, filename: m.filename }))
      : [],
  );
  const [selected, setSelected] = useState<string[]>(
    post?.targets.map((t) => t.socialAccountId) ?? [],
  );
  const [overrides, setOverrides] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      (post?.targets ?? [])
        .filter((t) => t.captionOverride)
        .map((t) => [t.socialAccountId, t.captionOverride ?? '']),
    ),
  );
  const [previewNetwork, setPreviewNetwork] = useState<
    'INSTAGRAM' | 'FACEBOOK'
  >('INSTAGRAM');
  const [busy, setBusy] = useState<Action | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [confirmPublish, setConfirmPublish] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    clearErrors,
    control,
    formState: { errors },
  } = useForm<ComposerValues>({
    resolver: zodResolver(composerSchema),
    defaultValues: {
      caption: post?.caption ?? '',
      aspectRatio: post?.aspectRatio ?? 'SQUARE',
      fitMode: post?.fitMode ?? 'CROP',
      ...isoToZoned(post?.scheduledAt ?? null),
    },
  });
  const caption = useWatch({ control, name: 'caption' });
  const aspectRatio = useWatch({ control, name: 'aspectRatio' });
  const fitMode = useWatch({ control, name: 'fitMode' });
  const date = useWatch({ control, name: 'date' });

  const activeBrands = brands.filter((b) => b.active || b.id === brandId);
  const brand = brands.find((b) => b.id === brandId);
  const brandAccounts = accounts.filter(
    (a) => a.brandId === brandId && (a.active || selected.includes(a.id)),
  );
  const chosen = brandAccounts.filter((a) => selected.includes(a.id));
  const tabs: CaptionTab[] = chosen.map((a) => ({
    accountId: a.id,
    label: `${NETWORK_LABEL[a.network]} · ${a.name}`,
    network: a.network,
  }));
  // Para que red escribe la IA: ambas si hay una cuenta de cada una; si no, la que haya (Instagram si no hay)
  const hasFacebook = chosen.some((a) => a.network === 'FACEBOOK');
  const hasInstagram = chosen.some((a) => a.network === 'INSTAGRAM');
  const aiNetwork: AiNetwork =
    hasFacebook && hasInstagram ? 'BOTH' : hasFacebook ? 'FACEBOOK' : 'INSTAGRAM';
  const suggestion =
    brand && (brand.signature.trim() || brand.defaultHashtags.trim())
      ? [brand.signature.trim(), brand.defaultHashtags.trim()]
          .filter(Boolean)
          .join('\n')
      : null;

  function effectiveCaption(accountId: string): string {
    const own = overrides[accountId];
    return own && own.trim() ? own : caption;
  }

  const previewAccount =
    chosen.find((a) => a.network === previewNetwork) ?? null;
  const previewCaption = previewAccount
    ? effectiveCaption(previewAccount.id)
    : caption;

  function changeBrand(id: string) {
    setBrandId(id);
    setSelected([]);
    setOverrides({});
    setProblems([]);
  }

  function toggleAccount(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  }

  /** Lo que falta o esta mal para esa accion, en castellano y con como arreglarlo. */
  function checkAction(action: Action, values: ComposerValues): string[] {
    const found: string[] = [];
    if (!brandId) found.push('Elegí una marca para el post.');
    for (const account of chosen) {
      if (account.network !== 'INSTAGRAM') continue;
      const count = countChars(effectiveCaption(account.id));
      if (count > IG_CAPTION_LIMIT) {
        found.push(
          `El texto de ${account.name} tiene ${count} caracteres y Instagram admite hasta ${IG_CAPTION_LIMIT}. Acortalo o usá un texto propio más corto para esa cuenta.`,
        );
      }
    }
    if (action === 'save' && status !== 'SCHEDULED') return found;

    if (items.length === 0) found.push('Subí al menos una imagen.');
    if (chosen.length === 0) found.push('Elegí al menos una cuenta.');
    const needsDate =
      action === 'schedule' || (action === 'save' && status === 'SCHEDULED');
    if (needsDate) {
      const iso =
        values.date && values.time
          ? zonedToIso(values.date, values.time)
          : null;
      if (!iso) {
        found.push('Elegí la fecha y la hora de publicación.');
      } else if (!sameMinute(iso, savedIso) && !isFuture(iso)) {
        found.push(
          'La fecha y hora tienen que ser futuras. Si querés publicar ya, usá "Publicar ahora".',
        );
      }
    }
    return found;
  }

  async function perform(action: Action, values: ComposerValues) {
    const found = checkAction(action, values);
    setProblems(found);
    if (found.length > 0) return;

    setBusy(action);
    let createdNow = false;
    try {
      const iso =
        values.date && values.time
          ? zonedToIso(values.date, values.time)
          : null;
      const content: PostInput = {
        caption: values.caption,
        aspectRatio: values.aspectRatio,
        fitMode: values.fitMode,
        mediaIds: items.map((i) => i.mediaId),
        targets: chosen.map((a) => {
          const own = overrides[a.id];
          return {
            socialAccountId: a.id,
            ...(own && own.trim() ? { captionOverride: own } : {}),
          };
        }),
      };

      let saved: PostView;
      if (postId) {
        // En un post programado la fecha solo se manda si cambio (la API exige que sea futura)
        const keepDate =
          status === 'SCHEDULED' &&
          (sameMinute(iso, savedIso) || action === 'publish');
        const dateChange = keepDate ? {} : { scheduledAt: iso };
        saved = await postsApi.update(postId, { ...content, ...dateChange });
      } else {
        saved = await postsApi.create({
          ...content,
          brandId,
          ...(iso ? { scheduledAt: iso } : {}),
        });
        createdNow = true;
      }
      setPostId(saved.id);
      setStatus(saved.status);
      setSavedIso(saved.scheduledAt);

      if (action === 'save') {
        toast.success(
          createdNow || status === 'DRAFT'
            ? 'Borrador guardado'
            : 'Cambios guardados',
        );
        if (createdNow) router.replace(`/posts/${saved.id}`);
        return;
      }
      if (action === 'schedule') {
        await postsApi.schedule(saved.id, iso ?? '');
        toast.success('Post programado');
      } else {
        await postsApi.publishNow(saved.id);
        toast.success('Listo: se publica en el próximo minuto');
      }
      router.push('/');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'No se pudo completar la acción';
      setProblems([
        createdNow
          ? `El borrador quedó guardado, pero no se pudo continuar: ${message}`
          : message,
      ]);
    } finally {
      setBusy(null);
    }
  }

  const run = (action: Action) =>
    handleSubmit(
      (values) => perform(action, values),
      () => setProblems(['Revisá los campos marcados en rojo.']),
    )();

  const noBrands = !post && activeBrands.length === 0;
  const locked = busy !== null;

  if (noBrands) {
    return (
      <p className="mt-6 rounded-lg border border-dashed border-line p-6 text-center text-sm text-muted">
        Todavía no tenés marcas activas. Creá una en{' '}
        <Link href="/settings/brands" className="text-accent underline">
          Marcas
        </Link>{' '}
        y asignale sus cuentas para poder armar posts.
      </p>
    );
  }

  const statusInfo = POST_STATUS[status];
  const publishNames = chosen.map((a) => a.name).join(', ');

  return (
    <form
      noValidate
      onSubmit={(event) => event.preventDefault()}
      className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]"
    >
      <fieldset disabled={locked} className="flex min-w-0 flex-col gap-4">
        <legend className="sr-only">Datos del post</legend>

        <Section title="1. Marca y cuentas">
          <div className="flex items-center gap-2">
            <Badge tone={statusInfo.tone}>{statusInfo.label}</Badge>
            {post && (
              <span className="flex items-center gap-2 text-sm">
                <span
                  className="size-3 rounded-full"
                  style={{ backgroundColor: post.brand.color }}
                  aria-hidden
                />
                {post.brand.name}
              </span>
            )}
          </div>
          {!post && (
            <div className="mt-3 max-w-xs">
              <Field label="Marca" htmlFor="brand">
                <Select
                  id="brand"
                  disabled={postId !== null}
                  value={brandId}
                  onChange={(event) => changeBrand(event.target.value)}
                >
                  <option value="">Elegí una marca</option>
                  {activeBrands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          )}

          {brandId && (
            <div className="mt-4">
              <p className="text-sm font-medium" id="accounts-label">
                Cuentas donde se publica
              </p>
              {brandAccounts.length === 0 ? (
                <p className="mt-2 rounded-md border border-dashed border-line p-4 text-sm text-muted">
                  Esta marca no tiene cuentas activas. Asignale una desde{' '}
                  <Link
                    href="/settings/brands"
                    className="text-accent underline"
                  >
                    Marcas
                  </Link>
                  .
                </p>
              ) : (
                <ul
                  aria-labelledby="accounts-label"
                  className="mt-2 grid gap-2 xl:grid-cols-2"
                >
                  {brandAccounts.map((account) => (
                    <li key={account.id}>
                      <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-line p-2.5 text-sm transition-colors hover:bg-surface-muted has-[:checked]:border-accent has-[:checked]:bg-info-soft has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent">
                        <input
                          type="checkbox"
                          className="size-4 accent-[var(--accent)]"
                          checked={selected.includes(account.id)}
                          onChange={() => toggleAccount(account.id)}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">
                            {account.name}
                          </span>
                          <span className="mt-1 flex flex-wrap items-center gap-1.5">
                            <Badge
                              tone={
                                account.network === 'FACEBOOK'
                                  ? 'info'
                                  : 'orange'
                              }
                            >
                              {NETWORK_LABEL[account.network]}
                            </Badge>
                            {!account.active && <Badge>Desactivada</Badge>}
                            {account.username && (
                              <span className="truncate text-xs text-muted">
                                @{account.username}
                              </span>
                            )}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Section>

        <Section
          title="2. Imágenes"
          hint="Hasta 10. Con más de una se publica un carrusel."
        >
          <ImagePicker
            items={items}
            onChange={setItems}
            aspectRatio={aspectRatio}
            fitMode={fitMode}
            disabled={locked}
          />
        </Section>

        <Section
          title="3. Texto"
          hint="El texto base va a todas las cuentas. Podés poner uno propio para cada una."
        >
          <AiSuggest
            key={brandId}
            brandId={brandId}
            mediaIds={items.map((item) => item.mediaId)}
            network={aiNetwork}
            brandHasContext={Boolean(
              brand?.description.trim() || brand?.tone.trim(),
            )}
            caption={caption}
            onApply={(text) =>
              setValue('caption', text, { shouldValidate: true })
            }
          />
          <CaptionEditor
            caption={caption}
            onCaptionChange={(value) =>
              setValue('caption', value, { shouldValidate: true })
            }
            tabs={tabs}
            overrides={overrides}
            onOverrideChange={(id, value) =>
              setOverrides((current) => ({ ...current, [id]: value }))
            }
            suggestion={suggestion}
            error={errors.caption?.message}
          />
        </Section>

        <Section
          title="4. Formato de las imágenes"
          hint="Se genera una versión de cada imagen con este formato. La vista previa muestra lo que se publica."
        >
          <fieldset>
            <legend className="text-sm font-medium">Proporción</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <ChoiceCard
                {...register('aspectRatio')}
                value="SQUARE"
                title="Cuadrado 1:1"
                description="El clásico del feed"
                icon={<Square className="mt-0.5 size-4 shrink-0" aria-hidden />}
              />
              <ChoiceCard
                {...register('aspectRatio')}
                value="PORTRAIT"
                title="Vertical 4:5"
                description="Ocupa más pantalla en Instagram"
                icon={
                  <RectangleVertical
                    className="mt-0.5 size-4 shrink-0"
                    aria-hidden
                  />
                }
              />
              <ChoiceCard
                {...register('aspectRatio')}
                value="LANDSCAPE"
                title="Horizontal 1.91:1"
                description="Ideal para Facebook"
                icon={
                  <RectangleHorizontal
                    className="mt-0.5 size-4 shrink-0"
                    aria-hidden
                  />
                }
              />
            </div>
          </fieldset>
          <fieldset className="mt-4">
            <legend className="text-sm font-medium">
              Si la imagen no tiene esa proporción
            </legend>
            <div className="mt-2 grid gap-2 xl:grid-cols-2">
              <ChoiceCard
                {...register('fitMode')}
                value="CROP"
                title="Recortar"
                description="Llena todo el cuadro y corta los bordes"
              />
              <ChoiceCard
                {...register('fitMode')}
                value="PAD"
                title="Rellenar"
                description="Muestra la imagen entera con bordes blancos"
              />
            </div>
          </fieldset>
        </Section>

        <Section
          title="5. Fecha y hora"
          hint="Hora de Tucumán (UTC−3). Para un borrador es opcional."
        >
          <div className="flex flex-wrap items-start gap-3">
            <div className="w-44">
              <Field label="Fecha" htmlFor="date" error={errors.date?.message}>
                <Input
                  id="date"
                  type="date"
                  aria-invalid={errors.date ? true : undefined}
                  aria-describedby={describedBy('date', errors.date?.message)}
                  {...register('date', {
                    onChange: () => clearErrors(['date', 'time']),
                  })}
                />
              </Field>
            </div>
            <div className="w-32">
              <Field label="Hora" htmlFor="time" error={errors.time?.message}>
                <Input
                  id="time"
                  type="time"
                  aria-invalid={errors.time ? true : undefined}
                  aria-describedby={describedBy('time', errors.time?.message)}
                  {...register('time', {
                    onChange: () => clearErrors(['date', 'time']),
                  })}
                />
              </Field>
            </div>
            {date && status !== 'SCHEDULED' && (
              <Button
                variant="ghost"
                className="mt-6"
                onClick={() => {
                  setValue('date', '');
                  setValue('time', '');
                  clearErrors(['date', 'time']);
                }}
              >
                Quitar fecha
              </Button>
            )}
          </div>
        </Section>

        {problems.length > 0 && (
          <div
            id="composer-problems"
            role="alert"
            tabIndex={-1}
            className="rounded-lg bg-danger-soft p-4 text-sm text-danger"
          >
            <ul className="list-disc pl-4">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            loading={busy === 'save'}
            onClick={() => void run('save')}
          >
            {status === 'SCHEDULED' ? 'Guardar cambios' : 'Guardar borrador'}
          </Button>
          {status !== 'SCHEDULED' && (
            <Button
              loading={busy === 'schedule'}
              onClick={() => void run('schedule')}
            >
              Programar
            </Button>
          )}
          <Button
            variant="secondary"
            loading={busy === 'publish'}
            onClick={() => {
              const found = checkAction('publish', getValues());
              setProblems(found);
              if (found.length === 0) setConfirmPublish(true);
            }}
          >
            <Send className="size-4" aria-hidden />
            Publicar ahora
          </Button>
        </div>
      </fieldset>

      <aside
        aria-label="Vista previa"
        className="lg:sticky lg:top-6 lg:self-start"
      >
        <div
          role="group"
          aria-label="Red de la vista previa"
          className="mb-3 inline-flex rounded-md border border-line bg-surface p-0.5 text-sm"
        >
          {(['INSTAGRAM', 'FACEBOOK'] as const).map((network) => (
            <button
              key={network}
              type="button"
              aria-pressed={previewNetwork === network}
              onClick={() => setPreviewNetwork(network)}
              className={`rounded px-3 py-1 transition-colors ${
                previewNetwork === network
                  ? 'bg-surface-muted font-medium'
                  : 'text-muted hover:text-foreground'
              }`}
            >
              {NETWORK_LABEL[network]}
            </button>
          ))}
        </div>
        <FeedPreview
          network={previewNetwork}
          account={previewAccount}
          caption={previewCaption}
          items={items}
          aspectRatio={aspectRatio}
          fitMode={fitMode}
        />
        <p className="mt-2 text-xs text-muted">
          Es una aproximación: cada red puede mostrar el post con pequeñas
          diferencias.
        </p>
      </aside>

      <ConfirmDialog
        open={confirmPublish}
        title="¿Publicar ahora?"
        description={`Se publica en ${publishNames || 'las cuentas elegidas'} dentro del próximo minuto. Una vez publicado no se puede deshacer desde acá.`}
        confirmLabel="Publicar ahora"
        confirmVariant="primary"
        loading={busy === 'publish'}
        onConfirm={() => {
          setConfirmPublish(false);
          void run('publish');
        }}
        onCancel={() => setConfirmPublish(false)}
      />
    </form>
  );
}
