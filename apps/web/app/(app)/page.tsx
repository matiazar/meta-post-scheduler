import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Calendario' };

export default function CalendarPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold">Calendario</h1>
      <p className="mt-2 text-sm text-muted">
        Acá vas a ver tus posts programados y publicados. Primero conectá Meta y
        asigná tus cuentas a una marca desde Ajustes.
      </p>
      <Link
        href="/posts/new"
        className="mt-4 inline-flex h-9 items-center rounded-md bg-accent px-3.5 text-sm font-medium text-accent-foreground hover:bg-accent-hover"
      >
        Nuevo post
      </Link>
    </div>
  );
}
