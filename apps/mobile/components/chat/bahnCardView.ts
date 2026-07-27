import type { BahnEntry, BahnPayload } from '@gruenerator/contracts';

/**
 * Everything the Bahn card decides before it renders anything. Split out of the
 * component so the rules that actually carry risk — a missing departure time,
 * a via list that repeats the destination, a date string the backend could not
 * derive — are checkable without a renderer.
 *
 * Mirrors web's `BahnCard`; keep the two in step.
 */

/** Rows shown before the card collapses into a "+ n weitere" line. */
export const MAX_ROWS = 8;

/** German long date, or the raw string when it is not a parsable ISO date. */
export function formatBahnDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('de-DE', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** "RE8" when the line is known, else "ICE 204". */
export function trainLabel(entry: BahnEntry): string {
  return entry.line ?? `${entry.category} ${entry.number}`.trim();
}

export interface BahnRow {
  id: string;
  /** Departure, falling back to arrival for a terminating train. */
  time: string;
  /** Platform of whichever time is shown, or null. */
  platform: string | null;
  label: string;
  destination: string;
  /** Intermediate stops, never repeating the destination. */
  via: string[];
}

export function toRow(entry: BahnEntry): BahnRow {
  // Time and platform are taken as a pair. Web picks them independently
  // (`departurePlatform ?? arrivalPlatform`), which on a terminating train
  // prints the arrival time next to the departure platform — two different
  // events on one line.
  const isDeparture = entry.departureTime != null;
  return {
    id: entry.id,
    time: (isDeparture ? entry.departureTime : entry.arrivalTime) ?? '–',
    platform: (isDeparture ? entry.departurePlatform : entry.arrivalPlatform) ?? null,
    label: trainLabel(entry),
    destination: entry.destination ?? '—',
    via: entry.via.filter((stop) => stop !== entry.destination),
  };
}

export interface BahnCardView {
  station: string;
  /** "Abfahrten ab 09 Uhr" or plain "Abfahrten". */
  subtitle: string;
  date: string | null;
  rows: BahnRow[];
  /** Entries beyond MAX_ROWS; 0 when everything fits. */
  hiddenCount: number;
  isEmpty: boolean;
}

export function buildBahnCardView(data: BahnPayload): BahnCardView {
  const rows = data.entries.slice(0, MAX_ROWS).map(toRow);
  return {
    station: data.station,
    subtitle: data.hour ? `Abfahrten ab ${data.hour} Uhr` : 'Abfahrten',
    date: formatBahnDate(data.date),
    rows,
    hiddenCount: Math.max(0, data.entries.length - rows.length),
    isEmpty: rows.length === 0,
  };
}
