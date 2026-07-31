/**
 * The parser is pinned against a FIXED reference day (Wednesday, 2026-07-15) so
 * every expectation below is a literal date rather than a second implementation
 * of the same arithmetic — a test that recomputes the answer proves only that
 * two copies of a bug agree.
 */
import { describe, expect, it } from 'vitest';

import { parseRelativeDateRange } from './relativeDates.js';

// Wednesday. Picked so week arithmetic has something to get wrong in both
// directions, and mid-month/mid-year so month and year rollovers are visible.
const NOW = new Date('2026-07-15T09:30:00.000Z');

const at = (text: string): string | null => {
  const r = parseRelativeDateRange(text, NOW);
  return r ? `${r.date_from}..${r.date_to}` : null;
};

describe('day-level references', () => {
  it.each([
    ['Was haben wir heute besprochen?', '2026-07-15..2026-07-15'],
    ['Was haben wir gestern besprochen?', '2026-07-14..2026-07-14'],
    ['Der Chat von vorgestern', '2026-07-13..2026-07-13'],
  ])('%s → %s', (text, expected) => {
    expect(at(text)).toBe(expected);
  });
});

describe('"vor N <unit>"', () => {
  it.each([
    ['vor 3 Tagen', '2026-07-12..2026-07-15'],
    ['vor drei Tagen', '2026-07-12..2026-07-15'],
    ['vor einer Woche', '2026-07-08..2026-07-15'],
    ['vor zwei Wochen', '2026-07-01..2026-07-15'],
    ['vor 2 Monaten', '2026-05-01..2026-07-15'],
    ['vor einem Jahr', '2025-01-01..2026-07-15'],
  ])('%s → %s', (text, expected) => {
    expect(at(`Finde mein Dokument von ${text}`)).toBe(expected);
  });

  it('beats the fuzzy phrase it contains', () => {
    // "vor zwei Wochen" also matches the /woche/ branch; the counted form has to
    // win or every explicit count collapses to a single calendar week.
    expect(at('vor zwei Wochen')).toBe('2026-07-01..2026-07-15');
  });
});

describe('calendar periods', () => {
  it.each([
    // 2026-07-15 is a Wednesday; its Monday is the 13th.
    ['diese Woche', '2026-07-13..2026-07-15'],
    ['letzte Woche', '2026-07-06..2026-07-12'],
    ['in der vergangenen Woche', '2026-07-06..2026-07-12'],
    ['vorletzte Woche', '2026-06-29..2026-07-05'],
    ['diesen Monat', '2026-07-01..2026-07-15'],
    ['letzten Monat', '2026-06-01..2026-06-30'],
    ['im vorletzten Monat', '2026-05-01..2026-05-31'],
    ['dieses Jahr', '2026-01-01..2026-07-15'],
    ['letztes Jahr', '2025-01-01..2025-12-31'],
  ])('%s → %s', (text, expected) => {
    expect(at(`unser Gespräch ${text}`)).toBe(expected);
  });
});

describe('month names', () => {
  it('resolves a past month to this year', () => {
    expect(at('mein Dokument aus dem März')).toBe('2026-03-01..2026-03-31');
  });

  it('resolves a future month to last year', () => {
    // Nobody asks to recall a conversation that has not happened yet.
    expect(at('mein Dokument aus dem Oktober')).toBe('2025-10-01..2025-10-31');
  });

  it('honours an explicit year', () => {
    expect(at('die Notizen vom November 2024')).toBe('2024-11-01..2024-11-30');
  });

  it('reads the Austrian month names', () => {
    // de-AT is a first-class audience, not a toggle.
    expect(at('mein Antrag vom Jänner')).toBe('2026-01-01..2026-01-31');
    expect(at('mein Antrag vom Feber')).toBe('2026-02-01..2026-02-28');
  });

  it('matches an umlaut month at all', () => {
    // The \b-before-umlaut trap: without the u flag "ä" is not \w, so
    // /\bmärz\b/ can never fire. This assertion is the whole reason the module
    // uses \p{L} lookarounds.
    expect(at('März')).toBe('2026-03-01..2026-03-31');
  });
});

describe('years', () => {
  it('needs a temporal word before a bare number', () => {
    // A four-digit number in a title is not a date window — filtering on it
    // would empty the result set for the most common phrasing there is.
    expect(at('unser Chat über das Wahlprogramm 2025')).toBeNull();
  });

  it.each([
    ['im Jahr 2024', '2024-01-01..2024-12-31'],
    ['aus dem Jahr 2023', '2023-01-01..2023-12-31'],
    ['seit 2025', '2025-01-01..2026-07-15'],
  ])('%s → %s', (text, expected) => {
    expect(at(`was haben wir ${text} besprochen`)).toBe(expected);
  });
});

describe('no temporal reference', () => {
  it.each([
    '',
    '   ',
    'Finde mein Dokument über Windkraft',
    'Was haben wir zum Newsletter besprochen?',
  ])('%s → null', (text) => {
    expect(at(text)).toBeNull();
  });

  it('does not read a month out of the middle of a word', () => {
    // "Maien"/"Marzipan" share a prefix with a month name; the trailing
    // lookahead is what keeps them out.
    expect(at('Marzipan')).toBeNull();
    expect(at('Maibaum')).toBeNull();
  });
});
