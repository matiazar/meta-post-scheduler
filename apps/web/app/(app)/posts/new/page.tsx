import type { Metadata } from 'next';
import { ComposerLoader } from '@/components/composer/composer-loader';

export const metadata: Metadata = { title: 'Nuevo post' };

export default function NewPostPage() {
  return (
    <div className="max-w-6xl">
      <h1 className="text-xl font-semibold">Nuevo post</h1>
      <p className="mt-1 text-sm text-muted">
        Armá el post una vez y publicalo en las cuentas de la marca.
      </p>
      <ComposerLoader />
    </div>
  );
}
