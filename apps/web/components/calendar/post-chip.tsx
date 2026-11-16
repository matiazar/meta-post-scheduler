import type { DragEvent } from 'react';
import type { Network, PostListItem } from '@/lib/api/resources';
import { POST_STATUS } from '@/lib/post-status';
import { isoToZoned } from '@/lib/tz';

const NETWORK_SHORT: Record<Network, string> = {
  FACEBOOK: 'FB',
  INSTAGRAM: 'IG',
};

interface Props {
  post: PostListItem;
  onOpen: (id: string) => void;
  /** Solo los programados y los borradores con fecha se pueden arrastrar */
  draggable: boolean;
  onDragStart: (post: PostListItem, event: DragEvent) => void;
  onDragEnd: () => void;
  dragging: boolean;
}

/** Un post en el calendario: color de la marca, hora, estado, redes y el comienzo del texto. */
export function PostChip({
  post,
  onOpen,
  draggable,
  onDragStart,
  onDragEnd,
  dragging,
}: Props) {
  const status = POST_STATUS[post.status];
  const time = isoToZoned(post.scheduledAt).time;
  const networks = [...new Set(post.targets.map((t) => t.network))];
  const summary = post.caption.trim() || 'Sin texto';

  return (
    <div
      draggable={draggable}
      onDragStart={(event) => onDragStart(post, event)}
      onDragEnd={onDragEnd}
      className={`transition-opacity duration-150 ease-out ${
        dragging ? 'opacity-40' : ''
      }`}
    >
      <button
        type="button"
        onClick={() => onOpen(post.id)}
        aria-label={`${post.brand.name}, ${status.label}${time ? `, ${time}` : ''}: ${summary}`}
        style={{ borderLeftColor: post.brand.color }}
        className={`flex w-full flex-col gap-0.5 rounded-md border border-line border-l-[3px] bg-surface px-1.5 py-1 text-left text-xs transition-colors hover:bg-surface-muted ${
          draggable ? 'cursor-grab active:cursor-grabbing' : ''
        }`}
      >
        <span className="flex items-center gap-1.5">
          <span
            className={`size-2 shrink-0 rounded-full ${status.dot}`}
            aria-hidden
          />
          {time && <span className="font-medium">{time}</span>}
          <span className="ml-auto flex gap-1 text-[10px] font-medium text-muted">
            {networks.map((n) => (
              <span key={n}>{NETWORK_SHORT[n]}</span>
            ))}
          </span>
        </span>
        <span className="truncate text-muted">{summary}</span>
      </button>
    </div>
  );
}
