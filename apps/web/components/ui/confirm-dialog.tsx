'use client';

import { useEffect, useRef } from 'react';
import { Button } from './button';

interface Props {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  loading?: boolean;
  /** Eliminar usa "danger" (por defecto); una accion que no destruye nada, "primary" */
  confirmVariant?: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirmacion con <dialog> nativo: foco atrapado y Esc para cerrar sin librerias. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  loading = false,
  confirmVariant = 'danger',
  onConfirm,
  onCancel,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-line bg-surface p-5 text-foreground shadow-xl backdrop:bg-black/40"
    >
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-1.5 text-sm text-muted">{description}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={loading}>
          Cancelar
        </Button>
        <Button variant={confirmVariant} onClick={onConfirm} loading={loading}>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
