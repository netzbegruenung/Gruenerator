/**
 * Tests for date-aware ranking helpers.
 *
 * Pins the contract: recency is a *mild* secondary factor — content quality
 * (similarity) stays decisive. The boost is 0 for dateless/future sources, and
 * `filterAndSortResults` only re-orders sources that already pass the similarity
 * threshold (it never rescues a weak source).
 */

import { describe, it, expect } from 'vitest';

import {
  recencyBoost,
  resolveSourceDate,
  formatDe,
  DEFAULT_MAX_BOOST,
  DEFAULT_HALF_LIFE_DAYS,
} from './recency.js';
import { filterAndSortResults } from './SearchResultProcessor.js';
import type { ExpandedChunkResult } from './types.js';

const NOW = new Date('2026-06-05T00:00:00Z');
const daysAgo = (n: number): string =>
  new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

describe('recencyBoost', () => {
  it('is 0 for null / unparseable dates', () => {
    expect(recencyBoost(null, NOW)).toBe(0);
    expect(recencyBoost(undefined, NOW)).toBe(0);
    expect(recencyBoost('not-a-date', NOW)).toBe(0);
  });

  it('is 0 (no penalty) for future dates, capped at maxBoost otherwise', () => {
    expect(recencyBoost(daysAgo(-30), NOW)).toBe(DEFAULT_MAX_BOOST); // future → freshest, not negative
    expect(recencyBoost(daysAgo(0), NOW)).toBe(DEFAULT_MAX_BOOST);
  });

  it('decays to ~half of maxBoost after one half-life', () => {
    const boost = recencyBoost(daysAgo(DEFAULT_HALF_LIFE_DAYS), NOW);
    expect(boost).toBeCloseTo(DEFAULT_MAX_BOOST / 2, 5);
  });

  it('is monotonically decreasing with age', () => {
    const young = recencyBoost(daysAgo(30), NOW);
    const mid = recencyBoost(daysAgo(200), NOW);
    const old = recencyBoost(daysAgo(1000), NOW);
    expect(young).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(old);
  });

  it('stays small — never exceeds maxBoost', () => {
    for (const d of [0, 1, 100, 365, 5000]) {
      expect(recencyBoost(daysAgo(d), NOW)).toBeLessThanOrEqual(DEFAULT_MAX_BOOST);
    }
  });
});

describe('resolveSourceDate', () => {
  it('prefers published_at, then metadata, then (opt-in) created_at', () => {
    expect(resolveSourceDate({ published_at: '2024-01-01' })).toBe('2024-01-01');
    expect(resolveSourceDate({ metadata: { published_at: '2023-05-05' } })).toBe('2023-05-05');
    expect(resolveSourceDate({ metadata: { date: '2022-02-02' } })).toBe('2022-02-02');
  });

  it('returns null when only created_at exists and allowCreatedAt is off', () => {
    expect(resolveSourceDate({ created_at: '2020-01-01' })).toBeNull();
    expect(resolveSourceDate({ created_at: '2020-01-01' }, { allowCreatedAt: true })).toBe(
      '2020-01-01'
    );
  });

  it('returns null for a fully dateless source', () => {
    expect(resolveSourceDate({})).toBeNull();
  });
});

describe('formatDe', () => {
  it('formats month + year and is empty for bad input', () => {
    expect(formatDe('2024-03-15')).toMatch(/2024/);
    expect(formatDe(null)).toBe('');
    expect(formatDe('nope')).toBe('');
  });
});

describe('filterAndSortResults recency', () => {
  const make = (over: Partial<ExpandedChunkResult>): ExpandedChunkResult => ({
    document_id: 'd',
    source_url: null,
    title: 't',
    snippet: 's',
    filename: null,
    similarity: 0.5,
    chunk_index: 0,
    page_number: null,
    ...over,
  });

  it('a clearly more relevant OLD doc still beats a fresh weaker one', () => {
    const oldStrong = make({ document_id: 'old', similarity: 0.9, published_at: daysAgo(2000) });
    const newWeak = make({ document_id: 'new', similarity: 0.6, published_at: daysAgo(1) });
    const sorted = filterAndSortResults([newWeak, oldStrong], { now: NOW });
    expect(sorted[0].document_id).toBe('old'); // quality decisive: 0.06 boost can't close a 0.3 gap
  });

  it('near-equal docs re-order newer-first', () => {
    const olderA = make({ document_id: 'a', similarity: 0.7, published_at: daysAgo(1500) });
    const newerB = make({ document_id: 'b', similarity: 0.7, published_at: daysAgo(10) });
    const sorted = filterAndSortResults([olderA, newerB], { now: NOW });
    expect(sorted[0].document_id).toBe('b');
  });

  it('dateless sources are unaffected (pure similarity)', () => {
    const a = make({ document_id: 'a', similarity: 0.8 });
    const b = make({ document_id: 'b', similarity: 0.6 });
    const sorted = filterAndSortResults([b, a], { now: NOW });
    expect(sorted.map((r) => r.document_id)).toEqual(['a', 'b']);
  });

  it('still gates on raw similarity — recency does not rescue a sub-threshold source', () => {
    const fresh = make({ document_id: 'fresh', similarity: 0.2, published_at: daysAgo(0) });
    const sorted = filterAndSortResults([fresh], { now: NOW, threshold: 0.35 });
    expect(sorted).toHaveLength(0);
  });
});
