'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';

interface ToastItem {
  id: number;
  kind: 'success' | 'error';
  text: string;
}

interface ToastApi {
  success: (text: string) => void;
  error: (text: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast debe usarse dentro de ToastProvider');
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const push = useCallback((kind: ToastItem['kind'], text: string) => {
    const id = nextId.current++;
    setItems((current) => [...current, { id, kind, text }]);
    setTimeout(
      () => setItems((current) => current.filter((t) => t.id !== id)),
      5000,
    );
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (text) => push('success', text),
      error: (text) => push('error', text),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
      >
        {items.map((item) => (
          <div
            key={item.id}
            className="toast-enter pointer-events-auto flex max-w-md items-start gap-2 rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm shadow-lg"
          >
            {item.kind === 'success' ? (
              <CheckCircle2
                className="mt-0.5 size-4 shrink-0 text-success"
                aria-hidden
              />
            ) : (
              <XCircle
                className="mt-0.5 size-4 shrink-0 text-danger"
                aria-hidden
              />
            )}
            <span>{item.text}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
