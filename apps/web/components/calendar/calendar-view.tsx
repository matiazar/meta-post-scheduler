'use client';

import { useCallback, useEffect, useState, type DragEvent } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { brandsApi, postsApi, type PostListItem } from '@/lib/api/resources';
import {
  addDays,
  addMonths,
  dayOfMonth,
  dayTitle,
  monthGrid,
  monthTitle,
  sameMonth,
  weekDays,
  weekTitle,
  weekdayLabel,
} from '@/lib/calendar';
import { isoToZoned, zonedToIso } from '@/lib/tz';
import { useApiData } from '@/lib/use-api-data';
import { PostChip } from './post-chip';
import { PostDetail } from './post-detail';

type View = 'month' | 'week';

const REFRESH_MS = 60_000;
const MAX_CHIPS_IN_MONTH = 3;

function canDrag(post: PostListItem): boolean {
  return (
    post.scheduledAt !== null &&
    (post.status === 'SCHEDULED' || post.status === 'DRAFT')
  );
}

function groupByDay(posts: PostListItem[]): Map<string, PostListItem[]> {
  const byDay = new Map<string, PostListItem[]>();
  for (const post of posts) {
    if (!post.scheduledAt) continue;
    const { date } = isoToZoned(post.scheduledAt);
    byDay.set(date, [...(byDay.get(date) ?? []), post]);
  }
  return byDay;
}

interface BodyProps {
  days: string[];
  view: View;
  anchor: string;
  today: string;
  brandId: string;
  onOpenDay: (day: string) => void;
}

/**
 * Carga y dibuja un rango. Se monta de nuevo (key) al cambiar de rango o de marca,
 * asi nunca se ven posts del periodo anterior mientras llegan los nuevos.
 */
function CalendarBody({
  days,
  view,
  anchor,
  today,
  brandId,
  onOpenDay,
}: BodyProps) {
  const toast = useToast();
  const from = zonedToIso(days[0], '00:00') ?? '';
  const to = zonedToIso(addDays(days[days.length - 1], 1), '00:00') ?? '';
  const filter = brandId || undefined;

  const loadRange = useCallback(
    () => postsApi.range(from, to, filter),
    [from, to, filter],
  );
  const loadDrafts = useCallback(() => postsApi.drafts(filter), [filter]);
  const range = useApiData(loadRange);
  const drafts = useApiData(loadDrafts);
  const { refresh: refreshRange } = range;
  const { refresh: refreshDrafts } = drafts;

  const [openId, setOpenId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<PostListItem | null>(null);
  const [overDay, setOverDay] = useState<string | null>(null);

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshRange(), refreshDrafts()]);
  }, [refreshRange, refreshDrafts]);

  // Los estados cambian solos (el publicador trabaja aparte): se recarga cada minuto
  useEffect(() => {
    const timer = setInterval(() => void refreshAll(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [refreshAll]);

  async function drop(day: string) {
    const post = dragging;
    setDragging(null);
    setOverDay(null);
    if (!post?.scheduledAt) return;
    const current = isoToZoned(post.scheduledAt);
    if (current.date === day) return;
    // Cambia el dia y se conserva la hora
    const iso = zonedToIso(day, current.time);
    if (!iso) return;
    try {
      if (post.status === 'SCHEDULED') await postsApi.schedule(post.id, iso);
      else await postsApi.update(post.id, { scheduledAt: iso });
      toast.success(`Movido al ${dayTitle(day)}`);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : 'No se pudo cambiar la fecha del post',
      );
    }
    await refreshAll();
  }

  function onDragStart(post: PostListItem, event: DragEvent) {
    event.dataTransfer.effectAllowed = 'move';
    // Firefox no arranca el drag sin datos
    event.dataTransfer.setData('text/plain', post.id);
    setDragging(post);
  }

  if (range.loading || drafts.loading) {
    return (
      <div
        className="mt-4 h-96 animate-pulse rounded-lg bg-surface-muted"
        aria-busy="true"
      />
    );
  }
  if (range.error || !range.data) {
    return (
      <div
        role="alert"
        className="mt-4 rounded-lg bg-danger-soft p-4 text-sm text-danger"
      >
        {range.error ?? 'No se pudo cargar el calendario'}
        <div className="mt-3">
          <Button variant="secondary" onClick={() => void refreshRange()}>
            Reintentar
          </Button>
        </div>
      </div>
    );
  }

  const byDay = groupByDay(range.data);
  const undated = (drafts.data ?? []).filter((p) => p.scheduledAt === null);
  const agendaDays = days.filter((d) => byDay.has(d));

  const chip = (post: PostListItem) => (
    <PostChip
      key={post.id}
      post={post}
      onOpen={setOpenId}
      draggable={canDrag(post)}
      onDragStart={onDragStart}
      onDragEnd={() => {
        setDragging(null);
        setOverDay(null);
      }}
      dragging={dragging?.id === post.id}
    />
  );

  return (
    <>
      {range.data.length === 0 && (
        <p className="mt-4 rounded-lg border border-dashed border-line p-4 text-center text-sm text-muted">
          No hay posts en este período.{' '}
          <Link href="/posts/new" className="text-accent underline">
            Armá uno nuevo
          </Link>
          .
        </p>
      )}

      {/* Pantallas anchas: grilla */}
      <div className="mt-4 hidden md:block">
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-line bg-line text-xs">
          {days.slice(0, 7).map((d) => (
            <div
              key={d}
              className="bg-surface-muted px-2 py-1.5 font-medium text-muted capitalize"
            >
              {weekdayLabel(d)}
            </div>
          ))}
          {days.map((day) => {
            const posts = byDay.get(day) ?? [];
            const outside = view === 'month' && !sameMonth(day, anchor);
            const shown =
              view === 'month' ? posts.slice(0, MAX_CHIPS_IN_MONTH) : posts;
            const hidden = posts.length - shown.length;
            return (
              <div
                key={day}
                role="group"
                aria-label={dayTitle(day)}
                onDragOver={(event) => {
                  if (!dragging) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  setOverDay(day);
                }}
                onDragLeave={() => setOverDay((d) => (d === day ? null : d))}
                onDrop={(event) => {
                  event.preventDefault();
                  void drop(day);
                }}
                className={`flex flex-col gap-1 p-1.5 transition-colors ${
                  view === 'week' ? 'min-h-72' : 'min-h-28'
                } ${overDay === day ? 'bg-info-soft' : outside ? 'bg-surface-muted/60' : 'bg-surface'}`}
              >
                <span
                  className={`self-start px-1 text-xs ${
                    day === today
                      ? 'rounded-full bg-accent font-semibold text-accent-foreground'
                      : outside
                        ? 'text-muted'
                        : 'font-medium'
                  }`}
                >
                  {dayOfMonth(day)}
                </span>
                {shown.map(chip)}
                {hidden > 0 && (
                  <button
                    type="button"
                    onClick={() => onOpenDay(day)}
                    className="self-start px-1 text-xs text-accent hover:underline"
                  >
                    +{hidden} más
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Celular: agenda por dia, sin grilla */}
      <div className="mt-4 flex flex-col gap-4 md:hidden">
        {agendaDays.map((day) => (
          <section key={day} aria-label={dayTitle(day)}>
            <h3
              className={`mb-1.5 text-sm font-semibold first-letter:uppercase ${
                day === today ? 'text-accent' : ''
              }`}
            >
              {dayTitle(day)}
            </h3>
            <div className="flex flex-col gap-1.5">
              {(byDay.get(day) ?? []).map((post) => chip(post))}
            </div>
          </section>
        ))}
      </div>

      {undated.length > 0 && (
        <section className="mt-6" aria-label="Borradores sin fecha">
          <h2 className="text-sm font-semibold">Borradores sin fecha</h2>
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {undated.map(chip)}
          </div>
        </section>
      )}

      <Sheet
        open={openId !== null}
        title="Detalle del post"
        onClose={() => setOpenId(null)}
      >
        {openId && (
          <PostDetail
            key={openId}
            postId={openId}
            onChanged={() => void refreshAll()}
            onClose={() => setOpenId(null)}
          />
        )}
      </Sheet>
    </>
  );
}

/** `today` lo calcula el servidor en cada pedido: la hora actual no se puede prerenderizar. */
export function CalendarView({ today }: { today: string }) {
  const [view, setView] = useState<View>('month');
  const [anchor, setAnchor] = useState(today);
  const [brandId, setBrandId] = useState('');
  const brands = useApiData(brandsApi.list);

  const days = view === 'month' ? monthGrid(anchor) : weekDays(anchor);
  const title =
    view === 'month' ? monthTitle(anchor) : weekTitle(days[0], days[6]);

  function move(step: 1 | -1) {
    setAnchor((a) =>
      view === 'month' ? addMonths(a, step) : addDays(a, 7 * step),
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant="secondary"
            aria-label={view === 'month' ? 'Mes anterior' : 'Semana anterior'}
            onClick={() => move(-1)}
          >
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
          <Button variant="secondary" onClick={() => setAnchor(today)}>
            Hoy
          </Button>
          <Button
            variant="secondary"
            aria-label={view === 'month' ? 'Mes siguiente' : 'Semana siguiente'}
            onClick={() => move(1)}
          >
            <ChevronRight className="size-4" aria-hidden />
          </Button>
        </div>
        <h2
          className="min-w-0 flex-1 text-base font-semibold first-letter:uppercase"
          aria-live="polite"
        >
          {title}
        </h2>
        <Select
          aria-label="Filtrar por marca"
          className="w-44!"
          value={brandId}
          onChange={(event) => setBrandId(event.target.value)}
        >
          <option value="">Todas las marcas</option>
          {(brands.data ?? []).map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
        <div
          role="group"
          aria-label="Vista"
          className="inline-flex rounded-md border border-line bg-surface p-0.5 text-sm"
        >
          {(['month', 'week'] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={`rounded px-3 py-1 transition-colors ${
                view === v
                  ? 'bg-surface-muted font-medium'
                  : 'text-muted hover:text-foreground'
              }`}
            >
              {v === 'month' ? 'Mes' : 'Semana'}
            </button>
          ))}
        </div>
        <Link
          href="/posts/new"
          className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-3.5 text-sm font-medium text-accent-foreground hover:bg-accent-hover"
        >
          <Plus className="size-4" aria-hidden />
          Nuevo post
        </Link>
      </div>

      <CalendarBody
        key={`${view}|${days[0]}|${brandId}`}
        days={days}
        view={view}
        anchor={anchor}
        today={today}
        brandId={brandId}
        onOpenDay={(day) => {
          setAnchor(day);
          setView('week');
        }}
      />
    </div>
  );
}
