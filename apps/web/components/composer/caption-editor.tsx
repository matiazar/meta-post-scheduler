'use client';

import { useId, useState, type KeyboardEvent } from 'react';
import { Textarea } from '@/components/ui/field';
import type { Network } from '@/lib/api/resources';
import { IG_CAPTION_LIMIT, countChars } from '@/lib/validations/forms';

export interface CaptionTab {
  accountId: string;
  label: string;
  network: Network;
}

interface Props {
  caption: string;
  onCaptionChange: (value: string) => void;
  tabs: CaptionTab[];
  overrides: Record<string, string>;
  onOverrideChange: (accountId: string, value: string) => void;
  /** Texto de ayuda de la marca (firma y hashtags) para agregar al texto base */
  suggestion: string | null;
  error?: string;
}

function Counter({ count, limited }: { count: number; limited: boolean }) {
  const over = limited && count > IG_CAPTION_LIMIT;
  return (
    <span
      className={`text-xs ${over ? 'font-medium text-danger' : 'text-muted'}`}
    >
      {limited ? `${count} / ${IG_CAPTION_LIMIT}` : `${count} caracteres`}
    </span>
  );
}

/** Texto base y, si hace falta, un texto propio por cuenta (pestañas con flechas del teclado). */
export function CaptionEditor({
  caption,
  onCaptionChange,
  tabs,
  overrides,
  onOverrideChange,
  suggestion,
  error,
}: Props) {
  const uid = useId();
  const [selected, setSelected] = useState<string>('base');
  // Si la cuenta de la pestaña activa se desmarca, se vuelve al texto base
  const active = tabs.some((t) => t.accountId === selected) ? selected : 'base';
  const order = ['base', ...tabs.map((t) => t.accountId)];

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const at = order.indexOf(active);
    let next = at;
    if (event.key === 'ArrowRight') next = (at + 1) % order.length;
    else if (event.key === 'ArrowLeft')
      next = (at - 1 + order.length) % order.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = order.length - 1;
    else return;
    event.preventDefault();
    setSelected(order[next]);
    document.getElementById(`${uid}-tab-${order[next]}`)?.focus();
  }

  const igSelected = tabs.some((t) => t.network === 'INSTAGRAM');
  const tab = tabs.find((t) => t.accountId === active);
  const overrideValue = tab ? (overrides[tab.accountId] ?? '') : '';
  const showSuggestion =
    suggestion !== null && !caption.includes(suggestion.trim());

  return (
    <div>
      <div
        role="tablist"
        aria-label="Texto por red"
        className="flex gap-1 overflow-x-auto border-b border-line"
      >
        {order.map((id) => {
          const t = tabs.find((x) => x.accountId === id);
          const selectedTab = id === active;
          return (
            <button
              key={id}
              id={`${uid}-tab-${id}`}
              type="button"
              role="tab"
              aria-selected={selectedTab}
              aria-controls={`${uid}-panel`}
              tabIndex={selectedTab ? 0 : -1}
              onClick={() => setSelected(id)}
              onKeyDown={onKeyDown}
              className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-sm transition-colors ${
                selectedTab
                  ? 'border-accent font-medium text-foreground'
                  : 'border-transparent text-muted hover:text-foreground'
              }`}
            >
              {t ? t.label : 'Texto base'}
              {t && overrides[id]?.trim() ? (
                <span className="ml-1.5 text-xs text-accent">· propio</span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`${uid}-panel`}
        aria-labelledby={`${uid}-tab-${active}`}
        className="mt-3"
      >
        {tab ? (
          <>
            <Textarea
              id={`${uid}-override`}
              aria-label={`Texto para ${tab.label}`}
              rows={7}
              value={overrideValue}
              placeholder={caption || 'Escribí el texto base o uno propio acá'}
              onChange={(event) =>
                onOverrideChange(tab.accountId, event.target.value)
              }
            />
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted">
                {overrideValue.trim()
                  ? 'Esta cuenta usa su propio texto.'
                  : 'Vacío: esta cuenta usa el texto base.'}
              </p>
              <div className="flex items-center gap-3">
                {overrideValue && (
                  <button
                    type="button"
                    onClick={() => onOverrideChange(tab.accountId, '')}
                    className="text-xs text-accent hover:underline"
                  >
                    Usar el texto base
                  </button>
                )}
                <Counter
                  count={countChars(
                    overrideValue.trim() ? overrideValue : caption,
                  )}
                  limited={tab.network === 'INSTAGRAM'}
                />
              </div>
            </div>
          </>
        ) : (
          <>
            <Textarea
              id={`${uid}-base`}
              aria-label="Texto base"
              aria-invalid={error ? true : undefined}
              rows={7}
              value={caption}
              placeholder="Escribí el texto del post"
              onChange={(event) => onCaptionChange(event.target.value)}
            />
            {error && (
              <p role="alert" className="mt-1 text-xs text-danger">
                {error}
              </p>
            )}
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
              {showSuggestion ? (
                <button
                  type="button"
                  onClick={() =>
                    onCaptionChange(
                      caption.trim()
                        ? `${caption.trimEnd()}\n\n${suggestion}`
                        : (suggestion ?? ''),
                    )
                  }
                  className="text-xs text-accent hover:underline"
                >
                  Agregar firma y hashtags de la marca
                </button>
              ) : (
                <span />
              )}
              <Counter count={countChars(caption)} limited={igSelected} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
