import { Suspense } from 'react';
import { AppNav } from '@/components/app-nav';

export default function AppLayout({ children }: LayoutProps<'/'>) {
  return (
    <div className="flex flex-1 flex-col md:flex-row">
      {/* usePathname() es dato de la peticion: en rutas dinamicas (/posts/[id]) va en Suspense */}
      <Suspense
        fallback={
          <div className="shrink-0 md:w-56 md:border-r md:border-line" />
        }
      >
        <AppNav />
      </Suspense>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
        {children}
      </main>
    </div>
  );
}
