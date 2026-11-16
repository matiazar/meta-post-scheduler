'use client';

import {
  useState,
  type DragEvent,
  type Dispatch,
  type SetStateAction,
} from 'react';
import Image from 'next/image';
import {
  ArrowLeft,
  ArrowRight,
  ImageOff,
  ImagePlus,
  Loader2,
  X,
} from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { mediaApi, type AspectRatio, type FitMode } from '@/lib/api/resources';
import { MAX_IMAGE_BYTES, MAX_IMAGES } from '@/lib/validations/forms';
import { RATIO_CSS, type MediaItem } from './media-types';

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

interface Props {
  items: MediaItem[];
  onChange: Dispatch<SetStateAction<MediaItem[]>>;
  aspectRatio: AspectRatio;
  fitMode: FitMode;
  disabled?: boolean;
}

/** Separa los archivos que se pueden subir de los que no, con un motivo por cada rechazado. */
export function checkFiles(files: File[], free: number) {
  const accepted: File[] = [];
  const problems: string[] = [];
  for (const file of files) {
    if (!ACCEPTED.includes(file.type)) {
      problems.push(
        `"${file.name}" no es JPG, PNG ni WebP. Convertila e intentá de nuevo`,
      );
    } else if (file.size > MAX_IMAGE_BYTES) {
      problems.push(
        `"${file.name}" pesa más de 20 MB. Achicala y subila de nuevo`,
      );
    } else if (accepted.length >= free) {
      problems.push(
        `"${file.name}" no entró: un post admite hasta ${MAX_IMAGES} imágenes`,
      );
    } else {
      accepted.push(file);
    }
  }
  return { accepted, problems };
}

function Thumb({
  item,
  aspectRatio,
  fitMode,
}: {
  item: MediaItem;
  aspectRatio: AspectRatio;
  fitMode: FitMode;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const src = mediaApi.previewUrl(item.mediaId, aspectRatio, fitMode);
  return (
    <div
      className="relative w-full overflow-hidden rounded-md bg-surface-muted"
      style={{ aspectRatio: RATIO_CSS[aspectRatio] }}
    >
      {failedSrc === src ? (
        <div className="flex size-full flex-col items-center justify-center gap-1 p-2 text-center text-xs text-muted">
          <ImageOff className="size-5" aria-hidden />
          No se pudo cargar la vista previa
        </div>
      ) : (
        <Image
          src={src}
          alt={item.filename}
          fill
          unoptimized
          sizes="160px"
          className="object-cover"
          onError={() => setFailedSrc(src)}
          draggable={false}
        />
      )}
    </div>
  );
}

export function ImagePicker({
  items,
  onChange,
  aspectRatio,
  fitMode,
  disabled = false,
}: Props) {
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const [zoneActive, setZoneActive] = useState(false);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const free = MAX_IMAGES - items.length;
  const zoneBlocked = disabled || uploading || free === 0;

  async function upload(files: File[]) {
    if (files.length === 0) return;
    const { accepted, problems } = checkFiles(files, free);
    for (const problem of problems) toast.error(problem);
    if (accepted.length === 0) return;
    setUploading(true);
    try {
      const created = await mediaApi.upload(accepted);
      // Forma funcional: durante la subida el usuario pudo reordenar o quitar imagenes
      onChange((current) => [
        ...current,
        ...created.map((m) => ({ mediaId: m.id, filename: m.filename })),
      ]);
      setAnnouncement(
        created.length === 1
          ? '1 imagen agregada'
          : `${created.length} imágenes agregadas`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'No se pudieron subir las imágenes. Intentá de nuevo',
      );
    } finally {
      setUploading(false);
    }
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= items.length || from === to) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
    setAnnouncement(`"${moved.filename}" ahora está en la posición ${to + 1}`);
  }

  function remove(index: number) {
    const removed = items[index];
    onChange(items.filter((_, i) => i !== index));
    setAnnouncement(`"${removed.filename}" quitada`);
  }

  function onZoneDrop(event: DragEvent) {
    event.preventDefault();
    setZoneActive(false);
    if (zoneBlocked) return;
    void upload(Array.from(event.dataTransfer.files));
  }

  return (
    <div>
      <label
        onDragOver={(event) => {
          // Solo archivos del sistema: el reordenar usa otro drag
          if (event.dataTransfer.types.includes('Files')) {
            event.preventDefault();
            if (!zoneBlocked) setZoneActive(true);
          }
        }}
        onDragLeave={() => setZoneActive(false)}
        onDrop={onZoneDrop}
        className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-4 py-6 text-center text-sm transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${
          zoneActive
            ? 'border-accent bg-info-soft'
            : 'border-line bg-surface hover:bg-surface-muted'
        } ${zoneBlocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
      >
        <input
          type="file"
          multiple
          accept={ACCEPTED.join(',')}
          disabled={zoneBlocked}
          className="sr-only"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = '';
            void upload(files);
          }}
        />
        {uploading ? (
          <>
            <Loader2 className="size-5 animate-spin text-muted" aria-hidden />
            <span>Subiendo imágenes…</span>
          </>
        ) : (
          <>
            <ImagePlus className="size-5 text-muted" aria-hidden />
            <span className="font-medium">
              {free === 0
                ? `Llegaste al máximo de ${MAX_IMAGES} imágenes`
                : 'Arrastrá imágenes acá o hacé click para elegirlas'}
            </span>
            <span className="text-xs text-muted">
              JPG, PNG o WebP · hasta 20 MB cada una · {items.length} de{' '}
              {MAX_IMAGES}
            </span>
          </>
        )}
      </label>

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {items.length > 0 && (
        <>
          <ol className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {items.map((item, index) => (
              <li
                key={item.mediaId}
                draggable={!disabled}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'move';
                  // Firefox no arranca el drag sin datos
                  event.dataTransfer.setData('text/plain', item.mediaId);
                  setDragFrom(index);
                }}
                onDragOver={(event) => {
                  if (dragFrom === null) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  setDragOver(index);
                }}
                onDrop={(event) => {
                  if (dragFrom === null) return;
                  event.preventDefault();
                  move(dragFrom, index);
                  setDragFrom(null);
                  setDragOver(null);
                }}
                onDragEnd={() => {
                  setDragFrom(null);
                  setDragOver(null);
                }}
                className={`relative flex flex-col gap-1.5 rounded-lg border bg-surface p-1.5 transition-[opacity,border-color] duration-150 ease-out ${
                  dragFrom === index ? 'opacity-40' : ''
                } ${
                  dragOver === index && dragFrom !== index
                    ? 'border-accent'
                    : 'border-line'
                } ${disabled ? '' : 'cursor-grab active:cursor-grabbing'}`}
              >
                <Thumb
                  item={item}
                  aspectRatio={aspectRatio}
                  fitMode={fitMode}
                />
                <span
                  className="absolute top-3 left-3 flex size-5 items-center justify-center rounded-full bg-black/70 text-xs font-medium text-white"
                  aria-hidden
                >
                  {index + 1}
                </span>
                <div className="flex items-center justify-between gap-1">
                  <div className="flex gap-0.5">
                    <button
                      type="button"
                      disabled={disabled || index === 0}
                      onClick={() => move(index, index - 1)}
                      aria-label={`Mover "${item.filename}" a la izquierda`}
                      className="rounded p-1 text-muted hover:bg-surface-muted hover:text-foreground disabled:opacity-30"
                    >
                      <ArrowLeft className="size-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      disabled={disabled || index === items.length - 1}
                      onClick={() => move(index, index + 1)}
                      aria-label={`Mover "${item.filename}" a la derecha`}
                      className="rounded p-1 text-muted hover:bg-surface-muted hover:text-foreground disabled:opacity-30"
                    >
                      <ArrowRight className="size-4" aria-hidden />
                    </button>
                  </div>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => remove(index)}
                    aria-label={`Quitar "${item.filename}"`}
                    className="rounded p-1 text-muted hover:bg-danger-soft hover:text-danger disabled:opacity-30"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-xs text-muted">
            La primera es la portada. Reordenalas arrastrando o con las flechas.
            En Instagram todas se ajustan al formato de la primera.
          </p>
        </>
      )}
    </div>
  );
}
