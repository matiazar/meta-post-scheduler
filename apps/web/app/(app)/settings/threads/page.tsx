import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ThreadsSettings } from './threads-settings';

export const metadata: Metadata = { title: 'Conexión con Threads' };

export default function ThreadsSettingsPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold">Conexión con Threads</h1>
      <p className="mt-1 text-sm text-muted">
        Threads tiene su propio acceso, distinto al de Facebook e Instagram.
        Conectá cada perfil con el que quieras publicar; después asignalo a una
        marca en Marcas.
      </p>
      <Suspense
        fallback={
          <div className="mt-6 h-40 animate-pulse rounded-lg bg-surface-muted" />
        }
      >
        <ThreadsSettings />
      </Suspense>
    </div>
  );
}
