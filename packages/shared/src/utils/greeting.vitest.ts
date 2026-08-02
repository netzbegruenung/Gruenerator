import { afterEach, describe, expect, it, vi } from 'vitest';

import { LAUNCH_GREETING_DAYS, LAUNCH_GREETING_START, getGreeting } from './greeting.js';

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

/**
 * The launch greeting is a dated window, so every case is anchored to
 * LAUNCH_GREETING_START rather than to a literal date — moving the cut-off must
 * not mean rewriting the tests.
 *
 * The boundaries are what actually breaks: an off-by-one on the end leaves the
 * announcement up for an eighth day, and nobody notices until it is stale.
 */
describe('getGreeting during launch week', () => {
  const LAUNCH = 'Willkommen im neuen Grünerator';

  function atLaunchOffset(days: number, hour = 13): void {
    const at = new Date(LAUNCH_GREETING_START);
    at.setDate(at.getDate() + days);
    at.setHours(hour, 0, 0, 0);
    vi.useFakeTimers();
    vi.setSystemTime(at);
  }

  it('takes over the hero for the whole window, at any hour and locale', () => {
    for (const locale of ['de-DE', 'de-AT']) {
      for (const hour of [0, 3, 9, 13, 16, 20, 23]) {
        for (let day = 0; day < LAUNCH_GREETING_DAYS; day += 1) {
          atLaunchOffset(day, hour);
          expect(getGreeting(locale, 'Moritz'), `${locale} ${hour}h day ${day}`).toBe(
            `${LAUNCH}, Moritz`
          );
          vi.useRealTimers();
        }
      }
    }
  });

  it('reaches the phone too — short mode does not filter it out', () => {
    atLaunchOffset(0, 9);
    expect(getGreeting('de-DE', 'Moritz', { short: true })).toBe(`${LAUNCH}, Moritz`);
  });

  it('drops the name cleanly when none is known', () => {
    atLaunchOffset(2);
    expect(getGreeting('de-DE', null)).toBe(LAUNCH);
  });

  it('is not up the day before the cut-off', () => {
    atLaunchOffset(-1);
    expect(getGreeting('de-DE', 'Moritz')).not.toContain(LAUNCH);
  });

  it('is gone on day seven — the window closes on its own', () => {
    atLaunchOffset(LAUNCH_GREETING_DAYS);
    expect(getGreeting('de-DE', 'Moritz')).not.toContain(LAUNCH);
  });
});
