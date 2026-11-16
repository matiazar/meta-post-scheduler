import type { Metadata } from 'next';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { CalendarView } from '@/components/calendar/calendar-view';
import { todayInTz } from '@/lib/tz';

export const metadata: Metadata = { title: 'Calendario' };

// "Hoy" depende de la hora del pedido: se calcula despues de connection(), dentro de Suspense
async function Calendar() {
  await connection();
  return <CalendarView today={todayInTz()} />;
}

export default function CalendarPage() {
  return (
    <div className="max-w-6xl">
      <h1 className="mb-4 text-xl font-semibold">Calendario</h1>
      <Suspense
        fallback={
          <div className="h-96 animate-pulse rounded-lg bg-surface-muted" />
        }
      >
        <Calendar />
      </Suspense>
    </div>
  );
}
