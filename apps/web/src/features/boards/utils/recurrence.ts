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
 * Advance a due date (`YYYY-MM-DD`) by one recurrence interval. Falls back to
 * "today + interval" when the card has no current due date or an invalid one,
 * so a recurring card without a date still gets a sensible next occurrence.
 */
export function computeNextDueDate(currentDue: CellValue, pattern: RecurrencePattern): string {
  const parsed = typeof currentDue === 'string' && currentDue ? new Date(currentDue) : null;
  const base = parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date();
  const next = new Date(base);
  if (pattern === 'daily') next.setDate(next.getDate() + 1);
  else if (pattern === 'weekly') next.setDate(next.getDate() + 7);
  else next.setMonth(next.getMonth() + 1);
  return toIsoDate(next);
}
