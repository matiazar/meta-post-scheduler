import { Suspense } from 'react';
import type { Metadata } from 'next';
import { MetaSettings } from './meta-settings';

export const metadata: Metadata = { title: 'Conexión con Meta' };

export default function MetaSettingsPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold">Conexión con Meta</h1>
      <p className="mt-1 text-sm text-muted">
        Conectá tu cuenta de Facebook para publicar en tus Páginas y en los
        Instagram Business vinculados.
      </p>
      <Suspense
        fallback={
          <div className="mt-6 h-40 animate-pulse rounded-lg bg-surface-muted" />
        }
      >
        <MetaSettings />
      </Suspense>
    </div>
  );
}
