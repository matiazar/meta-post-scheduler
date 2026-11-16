'use client';

import { useState } from 'react';
import Image from 'next/image';
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Heart,
  ImageIcon,
  MessageCircle,
  Send,
  ThumbsUp,
} from 'lucide-react';
import {
  mediaApi,
  type AspectRatio,
  type FitMode,
  type Network,
} from '@/lib/api/resources';
import { RATIO_CSS, type MediaItem } from './media-types';

export interface PreviewAccount {
  name: string;
  username: string | null;
  pictureUrl: string | null;
}

interface Props {
  network: Network;
  account: PreviewAccount | null;
  caption: string;
  items: MediaItem[];
  aspectRatio: AspectRatio;
  fitMode: FitMode;
}

function Avatar({ account }: { account: PreviewAccount | null }) {
  if (account?.pictureUrl) {
    return (
      <Image
        src={account.pictureUrl}
        alt=""
        width={32}
        height={32}
        unoptimized
        className="size-8 rounded-full object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex size-8 items-center justify-center rounded-full bg-surface-muted text-xs font-medium text-muted"
    >
      {(account?.name ?? '?').slice(0, 1).toUpperCase()}
    </span>
  );
}

function Pictures({
  items,
  aspectRatio,
  fitMode,
}: Pick<Props, 'items' | 'aspectRatio' | 'fitMode'>) {
  const [index, setIndex] = useState(0);
  const current = Math.min(index, Math.max(items.length - 1, 0));
  const item = items[current];

  if (!item) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-1 bg-surface-muted p-4 text-center text-xs text-muted"
        style={{ aspectRatio: RATIO_CSS[aspectRatio] }}
      >
        <ImageIcon className="size-6" aria-hidden />
        Subí una imagen para ver cómo queda
      </div>
    );
  }

  return (
    <div
      className="relative bg-surface-muted"
      style={{ aspectRatio: RATIO_CSS[aspectRatio] }}
    >
      <Image
        key={item.mediaId}
        src={mediaApi.previewUrl(item.mediaId, aspectRatio, fitMode)}
        alt={`Imagen ${current + 1} de ${items.length}: ${item.filename}`}
        fill
        unoptimized
        sizes="360px"
        className="object-cover"
      />
      {items.length > 1 && (
        <>
          {current > 0 && (
            <button
              type="button"
              aria-label="Imagen anterior"
              onClick={() => setIndex(current - 1)}
              className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
            >
              <ChevronLeft className="size-4" aria-hidden />
            </button>
          )}
          {current < items.length - 1 && (
            <button
              type="button"
              aria-label="Imagen siguiente"
              onClick={() => setIndex(current + 1)}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
            >
              <ChevronRight className="size-4" aria-hidden />
            </button>
          )}
          <span className="absolute top-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
            {current + 1}/{items.length}
          </span>
        </>
      )}
    </div>
  );
}

/** Aproximacion de como se ve el post en el feed. Los textos largos se cortan como en la red. */
export function FeedPreview({
  network,
  account,
  caption,
  items,
  aspectRatio,
  fitMode,
}: Props) {
  const handle = account?.username ?? account?.name ?? 'tu_cuenta';
  const text = caption.trim();

  if (network === 'INSTAGRAM') {
    return (
      <article
        aria-label="Vista previa de Instagram"
        className="overflow-hidden rounded-lg border border-line bg-surface text-sm"
      >
        <header className="flex items-center gap-2 p-2.5">
          <Avatar account={account} />
          <span className="font-semibold">{handle}</span>
        </header>
        <Pictures items={items} aspectRatio={aspectRatio} fitMode={fitMode} />
        <div className="flex items-center gap-3 px-3 pt-2.5" aria-hidden>
          <Heart className="size-5" />
          <MessageCircle className="size-5" />
          <Send className="size-5" />
          <Bookmark className="ml-auto size-5" />
        </div>
        <p className="line-clamp-3 px-3 pt-1.5 pb-3 whitespace-pre-line">
          <span className="font-semibold">{handle}</span>{' '}
          {text || <span className="text-muted">Tu texto va acá</span>}
        </p>
      </article>
    );
  }

  return (
    <article
      aria-label="Vista previa de Facebook"
      className="overflow-hidden rounded-lg border border-line bg-surface text-sm"
    >
      <header className="flex items-center gap-2 p-2.5">
        <Avatar account={account} />
        <div className="leading-tight">
          <p className="font-semibold">{account?.name ?? 'Tu Página'}</p>
          <p className="text-xs text-muted">Ahora · Público</p>
        </div>
      </header>
      <p className="line-clamp-4 px-3 pb-2.5 whitespace-pre-line">
        {text || <span className="text-muted">Tu texto va acá</span>}
      </p>
      <Pictures items={items} aspectRatio={aspectRatio} fitMode={fitMode} />
      <div
        className="flex items-center gap-4 border-t border-line px-3 py-2 text-xs text-muted"
        aria-hidden
      >
        <span className="flex items-center gap-1">
          <ThumbsUp className="size-4" /> Me gusta
        </span>
        <span className="flex items-center gap-1">
          <MessageCircle className="size-4" /> Comentar
        </span>
      </div>
    </article>
  );
}
