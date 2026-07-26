import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { formatRelativeDate } from './date';

/**
 * `formatRelativeDate` reads `new Date()`, so every case pins the clock first —
 * otherwise the boundary tests would flip depending on when CI runs.
 */
const NOW = new Date('2026-07-15T12:00:00.000Z');

const ago = (ms: number): string => new Date(NOW.getTime() - ms).toISOString();

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('formatRelativeDate', () => {
  it('returns an empty string for an unparseable date', () => {
    expect(formatRelativeDate('not a date')).toBe('');
    expect(formatRelativeDate(new Date(Number.NaN))).toBe('');
  });

  it('accepts a Date as well as a string', () => {
    expect(formatRelativeDate(new Date(NOW.getTime() - 5 * SECOND))).toBe('Gerade eben');
  });

  it('says "Gerade eben" below a minute, including exactly now', () => {
    expect(formatRelativeDate(ago(0))).toBe('Gerade eben');
    expect(formatRelativeDate(ago(59 * SECOND))).toBe('Gerade eben');
  });

  it('switches to minutes exactly at 60s and singularises the first one', () => {
    expect(formatRelativeDate(ago(MINUTE))).toBe('Vor 1 Minute');
    expect(formatRelativeDate(ago(2 * MINUTE))).toBe('Vor 2 Minuten');
    expect(formatRelativeDate(ago(59 * MINUTE))).toBe('Vor 59 Minuten');
  });

  it('switches to hours exactly at 60min and singularises the first one', () => {
    expect(formatRelativeDate(ago(HOUR))).toBe('Vor 1 Stunde');
    expect(formatRelativeDate(ago(23 * HOUR))).toBe('Vor 23 Stunden');
  });

  it('says "Gestern" for the whole first day, not "Vor 1 Tag"', () => {
    expect(formatRelativeDate(ago(DAY))).toBe('Gestern');
    expect(formatRelativeDate(ago(2 * DAY - SECOND))).toBe('Gestern');
  });

  it('counts days from the second one up to a week', () => {
    expect(formatRelativeDate(ago(2 * DAY))).toBe('Vor 2 Tagen');
    expect(formatRelativeDate(ago(6 * DAY))).toBe('Vor 6 Tagen');
  });

  it('switches to weeks at exactly 7 days', () => {
    expect(formatRelativeDate(ago(7 * DAY))).toBe('Vor 1 Woche');
    expect(formatRelativeDate(ago(14 * DAY))).toBe('Vor 2 Wochen');
    expect(formatRelativeDate(ago(29 * DAY))).toBe('Vor 4 Wochen');
  });

  it('falls back to an absolute German date from 30 days on', () => {
    expect(formatRelativeDate(ago(30 * DAY))).toBe('15.06.2026');
  });

  it('does not produce a negative relative label for a future date', () => {
    // Clock skew between device and server can hand us a timestamp in the
    // future; "Vor -3 Minuten" would be nonsense on a card.
    expect(formatRelativeDate(new Date(NOW.getTime() + 5 * MINUTE))).toBe('Gerade eben');
  });
});
