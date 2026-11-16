/**
 * Aritmetica de fechas del calendario con dias "yyyy-MM-dd" (el dia que ve el usuario en Tucuman).
 * Se hace sobre Date.UTC para no depender de la zona del navegador ni del horario de verano.
 */

function toDate(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(ymd: string, days: number): string {
  const date = toDate(ymd);
  date.setUTCDate(date.getUTCDate() + days);
  return toYmd(date);
}

export function addMonths(ymd: string, months: number): string {
  const date = toDate(ymd);
  // Se ancla al dia 1 para que 31 de enero + 1 mes no salte a marzo
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  return toYmd(date);
}

/** Lunes de la semana del dia dado (la semana argentina arranca el lunes). */
export function startOfWeek(ymd: string): string {
  const weekday = toDate(ymd).getUTCDay(); // 0 = domingo
  return addDays(ymd, -((weekday + 6) % 7));
}

export function weekDays(ymd: string): string[] {
  const start = startOfWeek(ymd);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** 6 semanas completas que contienen al mes (42 dias, siempre menos que el maximo de 100 de la API). */
export function monthGrid(ymd: string): string[] {
  const first = `${ymd.slice(0, 7)}-01`;
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function sameMonth(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

const monthFormat = new Intl.DateTimeFormat('es-AR', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const dayFormat = new Intl.DateTimeFormat('es-AR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});
const weekdayShort = new Intl.DateTimeFormat('es-AR', {
  weekday: 'short',
  timeZone: 'UTC',
});

export function monthTitle(ymd: string): string {
  return monthFormat.format(toDate(ymd));
}

export function dayTitle(ymd: string): string {
  return dayFormat.format(toDate(ymd));
}

export function weekdayLabel(ymd: string): string {
  return weekdayShort.format(toDate(ymd));
}

export function dayOfMonth(ymd: string): number {
  return Number(ymd.slice(8, 10));
}

const monthName = new Intl.DateTimeFormat('es-AR', {
  month: 'long',
  timeZone: 'UTC',
});

/** "16 al 22 de noviembre de 2026" o "30 de noviembre al 6 de diciembre de 2026". */
export function weekTitle(start: string, end: string): string {
  const m1 = monthName.format(toDate(start));
  const m2 = monthName.format(toDate(end));
  const year = end.slice(0, 4);
  return sameMonth(start, end)
    ? `${dayOfMonth(start)} al ${dayOfMonth(end)} de ${m2} de ${year}`
    : `${dayOfMonth(start)} de ${m1} al ${dayOfMonth(end)} de ${m2} de ${year}`;
}
