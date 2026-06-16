/**
 * Recurring cards: a card can carry a recurrence pattern in its
 * `field-recurrence` cell. When the card is moved into the "done" status, the
 * board spawns a fresh copy in the first ("todo") column with its due date
 * advanced by one interval (see useBoardState.onDragReorder). Pure helpers only —
 * the Yjs mutation and the relational due-date mirror live in the hook / page.
 */
import type { CellValue, SelectOption } from '../types';

export type RecurrencePattern = 'daily' | 'weekly' | 'monthly';

/** Options for the recurrence selector. An unset cell means "not recurring". */
export const RECURRENCE_OPTIONS: SelectOption[] = [
  { id: 'daily', name: 'Täglich', color: '#8da4bf' },
  { id: 'weekly', name: 'Wöchentlich', color: '#c4b08b' },
  { id: 'monthly', name: 'Monatlich', color: '#7c9885' },
];

const PATTERNS = new Set<RecurrencePattern>(['daily', 'weekly', 'monthly']);

export function isRecurrencePattern(value: CellValue): value is RecurrencePattern {
  return typeof value === 'string' && PATTERNS.has(value as RecurrencePattern);
}

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Parse a `YYYY-MM-DD` string into a local-time Date. `new Date("YYYY-MM-DD")`
 * parses as UTC midnight, which shifts the day in negative-UTC offsets and can
 * make "daily" return the same date — so build the Date from local components.
 * Returns null for empty/invalid input.
 */
function parseLocalDate(value: CellValue): Date | null {
  if (typeof value !== 'string' || !value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Advance a due date (`YYYY-MM-DD`) by one recurrence interval. Falls back to
 * "today + interval" when the card has no current due date or an invalid one,
 * so a recurring card without a date still gets a sensible next occurrence.
 */
export function computeNextDueDate(currentDue: CellValue, pattern: RecurrencePattern): string {
  const next = parseLocalDate(currentDue) ?? new Date();
  if (pattern === 'daily') next.setDate(next.getDate() + 1);
  else if (pattern === 'weekly') next.setDate(next.getDate() + 7);
  else {
    // Advance one month, clamping to the target month's last day so a card due
    // on e.g. the 31st doesn't overflow (setMonth alone rolls Jan 31 → Mar 3).
    const day = next.getDate();
    next.setDate(1);
    next.setMonth(next.getMonth() + 1);
    const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    next.setDate(Math.min(day, lastDay));
  }
  return toIsoDate(next);
}
