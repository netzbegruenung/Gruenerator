import { describe, it, expect } from 'vitest';

import { buildDaySeparatorLabels, dayLabel } from './messageTimestampLabels';

// Local-time constructor: the component compares calendar days in the viewer's
// timezone, so tests must not go through UTC ISO strings.
const at = (y: number, mo: number, d: number, h = 12, mi = 0) => new Date(y, mo - 1, d, h, mi);

const NOW = at(2026, 8, 12, 15, 30);

function labelsOf(entries: Array<{ id: string; createdAt?: Date }>): Array<string | null> {
  const map = buildDaySeparatorLabels(entries, NOW);
  return entries.map((e) => map.get(e.id) ?? null);
}

describe('dayLabel', () => {
  it('names today, yesterday, and everything older by date', () => {
    expect(dayLabel(at(2026, 8, 12, 0, 1), NOW)).toBe('Heute');
    expect(dayLabel(at(2026, 8, 11, 23, 59), NOW)).toBe('Gestern');
    expect(dayLabel(at(2026, 8, 5), NOW)).toBe('5. August 2026');
    expect(dayLabel(at(2025, 12, 31), NOW)).toBe('31. Dezember 2025');
  });

  it('handles yesterday across a month boundary', () => {
    const firstOfMonth = at(2026, 8, 1, 9, 0);
    expect(dayLabel(at(2026, 7, 31, 23, 0), firstOfMonth)).toBe('Gestern');
  });
});

describe('buildDaySeparatorLabels', () => {
  it('marks nothing in an all-today thread (no lone "Heute" rule)', () => {
    expect(
      labelsOf([
        { id: 'a', createdAt: at(2026, 8, 12, 9) },
        { id: 'b', createdAt: at(2026, 8, 12, 10) },
      ])
    ).toEqual([null, null]);
  });

  it('labels the first message when the thread starts on an earlier day', () => {
    expect(
      labelsOf([
        { id: 'a', createdAt: at(2026, 8, 11, 16) },
        { id: 'b', createdAt: at(2026, 8, 11, 17) },
      ])
    ).toEqual(['Gestern', null]);
  });

  it('marks a midnight boundary between adjacent messages', () => {
    expect(
      labelsOf([
        { id: 'a', createdAt: at(2026, 8, 11, 23, 59) },
        { id: 'b', createdAt: at(2026, 8, 12, 0, 1) },
      ])
    ).toEqual(['Gestern', 'Heute']);
  });

  it('emits one label per day across a multi-day thread', () => {
    expect(
      labelsOf([
        { id: 'a', createdAt: at(2026, 8, 5, 9) },
        { id: 'b', createdAt: at(2026, 8, 5, 11) },
        { id: 'c', createdAt: at(2026, 8, 11, 8) },
        { id: 'd', createdAt: at(2026, 8, 12, 8) },
        { id: 'e', createdAt: at(2026, 8, 12, 9) },
      ])
    ).toEqual(['5. August 2026', null, 'Gestern', 'Heute', null]);
  });

  it('never labels a message without createdAt, and skips it as comparison anchor', () => {
    // The undated row must not reset chronology: c compares against a's day,
    // stays same-day, and gets no duplicate label.
    expect(
      labelsOf([
        { id: 'a', createdAt: at(2026, 8, 11, 9) },
        { id: 'b' },
        { id: 'c', createdAt: at(2026, 8, 11, 10) },
      ])
    ).toEqual(['Gestern', null, null]);
  });

  it('falls back to "today" comparison when the thread starts undated', () => {
    expect(labelsOf([{ id: 'a' }, { id: 'b', createdAt: at(2026, 8, 12, 9) }])).toEqual([
      null,
      null,
    ]);
    expect(labelsOf([{ id: 'a' }, { id: 'b', createdAt: at(2026, 8, 11, 9) }])).toEqual([
      null,
      'Gestern',
    ]);
  });
});
