import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  CRAWL_CACHE_TTL_SECONDS,
  DISTILL_CACHE_TTL_SECONDS,
  crawlCacheKey,
  distillCacheKey,
  normalizeQuery,
  normalizeUrl,
  setCachedCrawl,
} from './distillCache.js';

vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const setCachedJson = vi.fn();
vi.mock('../../utils/redis/jsonCache.js', () => ({
  getCachedJson: vi.fn().mockResolvedValue(null),
  setCachedJson: (...args: unknown[]) => setCachedJson(...args),
}));

beforeEach(() => vi.clearAllMocks());

describe('TTL invariant', () => {
  // A fresh crawl behind a stale digest answers from yesterday's page while the
  // source card links today's.
  it('keeps the digest TTL at or below the crawl TTL', () => {
    expect(DISTILL_CACHE_TTL_SECONDS).toBeLessThanOrEqual(CRAWL_CACHE_TTL_SECONDS);
  });
});

describe('normalizeUrl', () => {
  it('drops the fragment and tracking params', () => {
    expect(normalizeUrl('https://a.de/x?utm_source=nl&id=7#abschnitt')).toBe('https://a.de/x?id=7');
  });

  it('keeps meaningful query params', () => {
    expect(normalizeUrl('https://a.de/x?seite=3')).toBe('https://a.de/x?seite=3');
  });

  it('passes an unparseable value through instead of throwing', () => {
    expect(normalizeUrl('nicht mal eine url')).toBe('nicht mal eine url');
  });
});

describe('normalizeQuery', () => {
  it('lowercases and collapses whitespace', () => {
    expect(normalizeQuery('  Der   Beitragssatz\n2027 ')).toBe('der beitragssatz 2027');
  });
});

describe('key stability', () => {
  it('gives URL variants that differ only in chrome the same crawl key', () => {
    expect(crawlCacheKey('https://a.de/x#oben')).toBe(crawlCacheKey('https://a.de/x?utm_medium=x'));
  });

  it('separates different pages', () => {
    expect(crawlCacheKey('https://a.de/x')).not.toBe(crawlCacheKey('https://a.de/y'));
  });

  it('carries the version segment so a shape change can invalidate everything', () => {
    expect(crawlCacheKey('https://a.de/x').startsWith('crawl:v1:')).toBe(true);
    const key = distillCacheKey({
      url: 'https://a.de/x',
      query: 'q',
      mode: 'faithful',
      targetChars: 100,
    });
    expect(key.startsWith('distill:v1:faithful:')).toBe(true);
  });

  const params = {
    url: 'https://a.de/x',
    query: 'Beitragssatz',
    mode: 'query-focused',
    targetChars: 5000,
  };

  it('is stable across query formatting', () => {
    expect(distillCacheKey(params)).toBe(distillCacheKey({ ...params, query: '  BEITRAGSSATZ  ' }));
  });

  it('separates modes, queries and budgets', () => {
    expect(distillCacheKey(params)).not.toBe(distillCacheKey({ ...params, mode: 'faithful' }));
    expect(distillCacheKey(params)).not.toBe(distillCacheKey({ ...params, query: 'anderes' }));
    expect(distillCacheKey(params)).not.toBe(distillCacheKey({ ...params, targetChars: 2000 }));
  });
});

describe('setCachedCrawl', () => {
  const entry = { url: 'https://a.de/x', title: 'T', content: 'Inhalt' };

  it('writes a success with the crawl TTL', async () => {
    await setCachedCrawl(entry);
    expect(setCachedJson).toHaveBeenCalledWith(
      crawlCacheKey(entry.url),
      entry,
      CRAWL_CACHE_TTL_SECONDS
    );
  });

  // Caching a failure would poison the key for a whole TTL.
  it('never writes an empty page', async () => {
    await setCachedCrawl({ ...entry, content: '' });
    expect(setCachedJson).not.toHaveBeenCalled();
  });

  it('never writes an oversized page', async () => {
    await setCachedCrawl({ ...entry, content: 'x'.repeat(200_000) });
    expect(setCachedJson).not.toHaveBeenCalled();
  });
});
