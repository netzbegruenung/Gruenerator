/**
 * Kalendertag und Uhrzeit in der Zeitzone der Personen. DE und AT liegen beide
 * in `Europe/Berlin`/`Europe/Vienna` (gleiche Regeln); der Server läuft in UTC.
 */
const ZONE = 'Europe/Berlin';

const DAY_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const HOUR_FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONE,
  hour: '2-digit',
  hourCycle: 'h23',
});

/** `YYYY-MM-DD` in Berlin. */
export function berlinDay(now: Date): string {
  return DAY_FORMAT.format(now);
}

/** Stunde 0–23 in Berlin. */
export function berlinHour(now: Date): number {
  return Number(HOUR_FORMAT.format(now));
}

/** Einen `YYYY-MM-DD`-Tag um `delta` Tage verschieben (kalendarisch, ohne Zeitzone). */
export function shiftDay(day: string, delta: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Ganze Tage von `from` bis `to` (beide `YYYY-MM-DD`), negativ wenn `to` davor liegt. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T12:00:00Z`);
  const b = Date.parse(`${to}T12:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** Wochentag 0 (So) – 6 (Sa) eines `YYYY-MM-DD`-Tags. */
export function weekdayOf(day: string): number {
  return new Date(`${day}T12:00:00Z`).getUTCDay();
}
