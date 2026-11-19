'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Menu, X } from 'lucide-react';

interface Props {
  /** Nombre que va arriba del menu */
  brand: ReactNode;
  ariaLabel: string;
  /** Contenido del menu; `close` cierra el cajon en celular (no hace nada en escritorio) */
  children: (close: () => void) => ReactNode;
}

const noop = () => {};

/**
 * Menu lateral en escritorio; en celular, barra superior con un boton que abre el mismo menu
 * en un cajon (<dialog> nativo: foco atrapado, Esc cierra, tocar afuera cierra).
 */
export function ResponsiveNav({ brand, ariaLabel, children }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const close = () => setOpen(false);

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface px-4 py-1.5 md:hidden">
        <span className="text-sm font-semibold">{brand}</span>
        <button
          type="button"
          aria-label="Abrir menú"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="grid size-11 place-items-center rounded-md text-foreground hover:bg-surface-muted"
        >
          <Menu className="size-5" aria-hidden />
        </button>
      </header>

      <dialog
        ref={ref}
        aria-label={ariaLabel}
        onClose={close}
        onClick={(event) => {
          // Un toque sobre el fondo oscuro (el propio <dialog>) cierra el cajon
          if (event.target === ref.current) close();
        }}
        className="m-0 h-dvh max-h-none w-72 max-w-[85vw] bg-surface p-0 text-foreground shadow-xl backdrop:bg-black/40 md:hidden"
      >
        {open && (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-line px-4 py-1.5">
              <span className="text-sm font-semibold">{brand}</span>
              <button
                type="button"
                aria-label="Cerrar menú"
                onClick={close}
                className="grid size-11 place-items-center rounded-md hover:bg-surface-muted"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <nav
              aria-label={ariaLabel}
              className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-3"
            >
              {children(close)}
            </nav>
          </div>
        )}
      </dialog>

      <nav
        aria-label={ariaLabel}
        className="hidden shrink-0 border-r border-line bg-surface px-3 py-4 md:flex md:w-56 md:flex-col"
      >
        <span className="mb-4 px-2 text-sm font-semibold">{brand}</span>
        {children(noop)}
      </nav>
    </>
  );
}
