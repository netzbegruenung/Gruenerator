/**
 * `publishedDate` on web hits was hard-coded `null`, so `recencyBoost` /
 * `resolveSourceDate` scored nothing at all on the one source type where
 * freshness matters most. Reading Linkup's `date` field fixes that — but only if
 * unusable values become `null` rather than being passed through.
 *
 * That is the whole point of these tests: a bogus date is WORSE than a missing
 * one, because the ranking treats it as a real signal and boosts or buries a
 * source on the strength of a string nobody validated.
 */

import { describe, it, expect } from 'vitest';

import { normalizePublishedDate } from './directSearchExecutors.js';

describe('normalizePublishedDate', () => {
  it('accepts an ISO date and returns a full ISO timestamp', () => {
    expect(normalizePublishedDate('2026-03-14')).toBe('2026-03-14T00:00:00.000Z');
  });

  it('accepts a full ISO timestamp', () => {
    expect(normalizePublishedDate('2026-03-14T09:30:00Z')).toBe('2026-03-14T09:30:00.000Z');
  });

  it('returns null for a missing or blank value', () => {
    expect(normalizePublishedDate(undefined)).toBeNull();
    expect(normalizePublishedDate('')).toBeNull();
    expect(normalizePublishedDate('   ')).toBeNull();
  });

  it('returns null for a string that is not a date', () => {
    // Passing this through would hand the ranking an Invalid Date, which compares
    // false against everything and silently disables the boost for that source.
    expect(normalizePublishedDate('vor kurzem')).toBeNull();
    expect(normalizePublishedDate('n/a')).toBeNull();
  });

  it('rejects a date in the future', () => {
    // A page dated next year is metadata noise, not a fresh source — and it would
    // outrank every genuinely recent hit.
    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    expect(normalizePublishedDate(nextYear.toISOString())).toBeNull();
  });

  it('tolerates today with timezone skew', () => {
    // A source published "today" can carry a timestamp a few hours ahead of our
    // clock depending on its timezone; that must not be read as a future date.
    const soon = new Date(Date.now() + 6 * 60 * 60 * 1000);
    expect(normalizePublishedDate(soon.toISOString())).not.toBeNull();
  });
});
