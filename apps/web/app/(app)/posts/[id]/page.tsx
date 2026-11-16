import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ComposerLoader } from '@/components/composer/composer-loader';

export const metadata: Metadata = { title: 'Editar post' };

// `params` es una promesa (dato de la peticion): se espera dentro de Suspense por cacheComponents
async function EditComposer({
  params,
}: Pick<PageProps<'/posts/[id]'>, 'params'>) {
  const { id } = await params;
  return <ComposerLoader postId={id} />;
}

export default function EditPostPage(props: PageProps<'/posts/[id]'>) {
  return (
    <div className="max-w-6xl">
      <h1 className="text-xl font-semibold">Editar post</h1>
      <Suspense
        fallback={
          <div className="mt-5 h-40 animate-pulse rounded-lg bg-surface-muted" />
        }
      >
        <EditComposer params={props.params} />
      </Suspense>
    </div>
  );
}
