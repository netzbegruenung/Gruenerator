import { describe, expect, it } from 'vitest';

import { bucketLabel } from './useThreadSearch';

/**
 * The bucket is a calendar-day question in the READER's timezone, not an
 * elapsed-hours one: a match from 23:50 last night is "Diese Woche" at 00:10,
 * even though it is twenty minutes old. Counting back 24h from `now` instead of
 * starting at local midnight gets that wrong for the whole first day — which is
 * why every date here is built from local parts rather than a UTC literal.
 */
const now = new Date(2026, 8, 1, 10, 0); // 1 Sep 2026, 10:00 local
const local = (...parts: [number, number, number, number?, number?]) =>
  new Date(...(parts as [number, number, number])).toISOString();

describe('bucketLabel', () => {
  it('calls a match from earlier today "Heute"', () => {
    expect(bucketLabel(local(2026, 8, 1, 9, 59), now)).toBe('Heute');
  });

  it('counts from local midnight, not from 24 hours ago', () => {
    expect(bucketLabel(local(2026, 8, 1, 0, 0), now)).toBe('Heute');
    expect(bucketLabel(local(2026, 7, 31, 23, 59), now)).toBe('Diese Woche');
  });

  it('keeps the last seven days together', () => {
    expect(bucketLabel(local(2026, 7, 26, 12, 0), now)).toBe('Diese Woche');
  });

  it('drops the eighth day into "Älter"', () => {
    expect(bucketLabel(local(2026, 7, 24, 12, 0), now)).toBe('Älter');
  });

  it('crosses a month boundary without a special case', () => {
    expect(bucketLabel(local(2026, 7, 30, 12, 0), now)).toBe('Diese Woche');
  });

  it('files an unparseable timestamp as "Älter" rather than throwing', () => {
    expect(bucketLabel('not-a-date', now)).toBe('Älter');
  });
});
