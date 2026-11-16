import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

/** La API trabaja en UTC; el usuario piensa en hora de Tucuman (UTC-3, sin horario de verano). */
export const TIME_ZONE = 'America/Argentina/Tucuman';

/** Fecha (yyyy-MM-dd) y hora (HH:mm) de Tucuman -> ISO UTC, o null si no son validas. */
export function zonedToIso(date: string, time: string): string | null {
  const value = fromZonedTime(`${date}T${time}:00`, TIME_ZONE);
  return Number.isNaN(value.getTime()) ? null : value.toISOString();
}

/** ISO UTC -> fecha y hora de Tucuman para los inputs. */
export function isoToZoned(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: '', time: '' };
  return {
    date: formatInTimeZone(iso, TIME_ZONE, 'yyyy-MM-dd'),
    time: formatInTimeZone(iso, TIME_ZONE, 'HH:mm'),
  };
}

/** True si el instante (ISO) todavia no llego. */
export function isFuture(iso: string): boolean {
  return new Date(iso).getTime() > Date.now();
}

/** Los inputs llegan al minuto: dos instantes del mismo minuto cuentan como la misma fecha. */
export function sameMinute(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    Math.floor(Date.parse(a) / 60000) === Math.floor(Date.parse(b) / 60000)
  );
}
