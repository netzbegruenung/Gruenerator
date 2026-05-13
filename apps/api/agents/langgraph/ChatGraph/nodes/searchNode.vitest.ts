/**
 * SearchNode Unit Tests — normalizeScore + mergeSearchResults
 *
 * Tests the score normalization and cross-source merge logic that feeds
 * candidates into the rerank pipeline. These are pure functions (aside
 * from vectorConfig reads).
 *
 * Run with: pnpm --filter @gruenerator/api test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../config/vectorConfig.js', () => ({
  vectorConfig: {
    get: vi.fn(() => ({
      inputLimit: 16,
      outputLimit: 8,
      minRelevance: 0.2,
      mmrLambda: 0.7,
      mmrKeepTop: 2,
      mergeOverfetch: 16,
      webScoreCeiling: 0.8,
    })),
    // BaseSearchService's constructor calls this at module-load time via the
    // exampleSearchService → DocumentSearchService import chain, so the mock
    // has to satisfy the API even though no test here inspects the return.
    getCacheConfig: vi.fn(() => ({ maxSize: 100, ttl: 60_000 })),
    isVerboseMode: vi.fn(() => false),
  },
}));

vi.mock('../../../../routes/chat/agents/directSearch.js', () => ({}));
vi.mock('../../../../services/search/CrawlingService.js', () => ({}));
vi.mock('../../../../services/search/QueryExpansionService.js', () => ({}));
vi.mock('../../../../utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));
vi.mock('./citationUtils.js', () => ({
  COLLECTION_LABELS: {},
  CONTENT_TYPE_LABELS: {},
  buildCitations: vi.fn(() => []),
  deriveCitationTitle: vi.fn(() => 'Title'),
  extractDomain: vi.fn(() => 'example.com'),
  resolveCollectionName: vi.fn(() => 'collection'),
}));

import { normalizeScore, mergeSearchResults } from './searchNode.js';

import type { SearchResult } from '../types.js';

function makeResult(overrides: Partial<SearchResult> & { source: string }): SearchResult {
  return {
    title: 'Test',
    content: 'Test content',
    ...overrides,
  };
}

describe('normalizeScore', () => {
  it('prefers similarityScore for gruenerator docs', () => {
    const r = makeResult({
      source: 'gruenerator:deutschland',
      relevance: 0.7,
      similarityScore: 0.79,
    });
    const score = normalizeScore(r);
    expect(score).toBeCloseTo(0.79 * 1.05, 2);
  });

  it('falls back to relevance when similarityScore is missing', () => {
    const r = makeResult({
      source: 'gruenerator:deutschland',
      relevance: 0.7,
    });
    const score = normalizeScore(r);
    expect(score).toBe(0.7);
  });

  it('caps similarityScore at 1.0', () => {
    const r = makeResult({
      source: 'gruenerator:deutschland',
      similarityScore: 0.99,
    });
    const score = normalizeScore(r);
    expect(score).toBeLessThanOrEqual(1.0);
  });

  it('caps web scores at webScoreCeiling', () => {
    const r = makeResult({
      source: 'web',
      relevance: 1.0,
    });
    const score = normalizeScore(r);
    expect(score).toBe(0.8);
  });

  it('compresses web scores proportionally', () => {
    const r = makeResult({
      source: 'web',
      relevance: 0.5,
    });
    const score = normalizeScore(r);
    expect(score).toBeCloseTo(0.5 * 0.8, 2);
  });

  it('preserves examples scores', () => {
    const r = makeResult({
      source: 'examples',
      relevance: 0.8,
    });
    expect(normalizeScore(r)).toBe(0.8);
  });

  it('preserves document-scoped search scores', () => {
    const r = makeResult({
      source: 'document:abc123',
      relevance: 0.65,
    });
    expect(normalizeScore(r)).toBe(0.65);
  });

  it('defaults to 0.5 when no relevance', () => {
    const r = makeResult({ source: 'unknown' });
    expect(normalizeScore(r)).toBe(0.5);
  });
});

describe('mergeSearchResults', () => {
  it('deduplicates by URL', () => {
    const set1: SearchResult[] = [
      makeResult({ source: 'web', url: 'https://a.com', relevance: 0.8 }),
    ];
    const set2: SearchResult[] = [
      makeResult({ source: 'web', url: 'https://a.com', relevance: 0.9 }),
    ];
    const merged = mergeSearchResults(set1, set2);
    expect(merged.length).toBe(1);
  });

  it('keeps results without URLs (no dedup)', () => {
    const set1: SearchResult[] = [
      makeResult({ source: 'examples', relevance: 0.8 }),
      makeResult({ source: 'examples', relevance: 0.7 }),
    ];
    const merged = mergeSearchResults(set1);
    expect(merged.length).toBe(2);
  });

  it('returns up to mergeOverfetch (16)', () => {
    const results: SearchResult[] = Array.from({ length: 20 }, (_, i) =>
      makeResult({ source: 'web', url: `https://example.com/${i}`, relevance: 0.5 })
    );
    const merged = mergeSearchResults(results);
    expect(merged.length).toBe(16);
  });

  it('sorts by normalized score descending', () => {
    const docResult = makeResult({
      source: 'gruenerator:deutschland',
      url: 'https://doc.com',
      similarityScore: 0.85,
      relevance: 0.7,
    });
    const webResult = makeResult({
      source: 'web',
      url: 'https://web.com',
      relevance: 1.0,
    });
    const merged = mergeSearchResults([webResult], [docResult]);
    // Doc: 0.85 * 1.05 = 0.8925; Web: min(0.80, 1.0 * 0.80) = 0.80
    expect(merged[0].url).toBe('https://doc.com');
    expect(merged[1].url).toBe('https://web.com');
  });

  it('handles mixed sources in correct order', () => {
    const doc = makeResult({
      source: 'gruenerator:deutschland',
      url: 'https://doc.com',
      similarityScore: 0.9,
    });
    const web = makeResult({
      source: 'web',
      url: 'https://web.com',
      relevance: 1.0,
    });
    const example = makeResult({
      source: 'examples',
      relevance: 0.8,
    });
    const merged = mergeSearchResults([doc], [web], [example]);
    // Doc: 0.90 * 1.05 = 0.945; Examples: 0.8; Web: 0.80
    expect(merged[0].url).toBe('https://doc.com');
    expect(merged.length).toBe(3);
  });

  it('handles empty input', () => {
    const merged = mergeSearchResults([], []);
    expect(merged.length).toBe(0);
  });
});
