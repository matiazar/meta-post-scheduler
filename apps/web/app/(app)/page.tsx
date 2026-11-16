import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Calendario' };

export default function CalendarPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold">Calendario</h1>
      <p className="mt-2 text-sm text-muted">
        Acá vas a ver tus posts programados y publicados. Primero conectá Meta y
        asigná tus cuentas a una marca desde Ajustes.
      </p>
    </div>
  );
}
