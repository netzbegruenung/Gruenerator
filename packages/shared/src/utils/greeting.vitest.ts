import { afterEach, describe, expect, it, vi } from 'vitest';

import { getGreeting } from './greeting.js';

/**
 * The `short` option exists for the phone hero, where a full sentence wraps to
 * three lines above the composer. Two things about it are easy to get wrong and
 * invisible when they are:
 *
 * - filtering AFTER the pick instead of before would collapse every "long" day
 *   onto one fallback, so the greeting would silently stop varying on mobile;
 * - the day seed has to keep choosing, so a short greeting is still not the same
 *   word every day.
 *
 * The clock is frozen per case: the templates are time-of-day dependent, so an
 * unfrozen test would pass or fail depending on when CI ran it.
 */

/** A sentence-shaped template — the kind mobile drops. */
const isSentence = (greeting: string) => greeting.includes(' ') && greeting.includes('?');

function atHour(hour: number, dayOffset = 0): void {
  const base = new Date(2026, 6, 15 + dayOffset, hour, 0, 0);
  vi.useFakeTimers();
  vi.setSystemTime(base);
}

afterEach(() => {
  vi.useRealTimers();
});

describe('getGreeting', () => {
  it('appends the name to a bare time-of-day template', () => {
    atHour(9);
    expect(getGreeting('de-DE', 'Moritz', { short: true })).toMatch(/, Moritz$/);
  });

  it('falls back to "du" when no name is known', () => {
    atHour(3);
    expect(getGreeting('de-DE', null, { short: true })).not.toContain('@Vorname');
  });

  it('never returns a full-sentence template when short is set', () => {
    // Every hour bucket, every locale, a fortnight of day seeds: if any list
    // could leak a sentence, this finds it.
    for (const locale of ['de-DE', 'de-AT']) {
      for (const hour of [3, 9, 13, 16, 20]) {
        for (let day = 0; day < 14; day += 1) {
          atHour(hour, day);
          const greeting = getGreeting(locale, 'Moritz', { short: true });
          expect(isSentence(greeting), `${locale} ${hour}h day ${day}: ${greeting}`).toBe(false);
          vi.useRealTimers();
        }
      }
    }
  });

  it('still varies across days when short is set', () => {
    // Filtering after the pick would pin this to a single word.
    const seen = new Set<string>();
    for (let day = 0; day < 14; day += 1) {
      atHour(13, day);
      seen.add(getGreeting('de-AT', 'Moritz', { short: true }));
      vi.useRealTimers();
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('leaves web unfiltered — the long templates still reach it', () => {
    const seen = new Set<string>();
    for (let day = 0; day < 14; day += 1) {
      atHour(13, day);
      seen.add(getGreeting('de-DE', 'Moritz'));
      vi.useRealTimers();
    }
    expect([...seen].some(isSentence)).toBe(true);
  });
});
