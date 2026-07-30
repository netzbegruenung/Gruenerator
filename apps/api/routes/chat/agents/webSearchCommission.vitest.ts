/**
 * Every piece of the commissioned web search (site scope, date window, image
 * hits, tier→depth) is unit-tested in isolation, but nothing asserts that what
 * the user asked for actually arrives in the object handed to
 * `linkup.webSearch(...)`. That wiring is the gap: a regression there is
 * invisible — the search still "works", it just silently ignores the scope.
 *
 * These tests mock the Linkup client only, and drive everything else
 * (domain-scope precedence, date-window resolution, the image split, tier
 * clamping) through the real `executeDirectWebSearch`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { resolveSearchPlan, SEARCH_TIERS } from '../../../services/search/searchDepth.js';

import type { LinkupSearchResult } from '../../../services/search/LinkupService.js';

const mockWebSearch = vi.fn();

vi.mock('../../../services/search/LinkupService.js', () => ({
  getLinkupService: () => ({ webSearch: mockWebSearch }),
}));

const { executeDirectWebSearch } = await import('./directSearchExecutors.js');

beforeEach(() => {
  mockWebSearch.mockReset();
  mockWebSearch.mockResolvedValue({ results: [] });
});

/** The complete object the last search commissioned from the Linkup client. */
function lastCommission(): Record<string, unknown> {
  expect(mockWebSearch).toHaveBeenCalledTimes(1);
  return mockWebSearch.mock.calls[0]?.[0] as Record<string, unknown>;
}

describe('executeDirectWebSearch — site scope reaching linkup.webSearch', () => {
  it('carries a named include scope through to the engine', async () => {
    await executeDirectWebSearch({
      query: 'Windkraft Ausbau Genehmigungsverfahren',
      includeDomains: ['zeit.de', 'spiegel.de'],
    });
    expect(lastCommission().includeDomains).toEqual(['zeit.de', 'spiegel.de']);
  });

  it('drops the default block list once an include scope is named — naming sites is a positive instruction, not a scope+exclusion pair nobody asked for', async () => {
    await executeDirectWebSearch({
      query: 'Windkraft Ausbau Genehmigungsverfahren',
      includeDomains: ['zeit.de'],
      excludeDomains: ['amazon.de', 'ebay.de'],
    });
    const call = lastCommission();
    expect(call.includeDomains).toEqual(['zeit.de']);
    expect(call).not.toHaveProperty('excludeDomains');
  });

  it('passes the block list through when there is no include scope', async () => {
    await executeDirectWebSearch({
      query: 'Windkraft Ausbau Genehmigungsverfahren',
      excludeDomains: ['amazon.de'],
    });
    const call = lastCommission();
    expect(call.excludeDomains).toEqual(['amazon.de']);
    expect(call).not.toHaveProperty('includeDomains');
  });

  it('omits empty domain arrays entirely rather than sending [] — an empty includeDomains reads to the API as "restrict to nothing"', async () => {
    await executeDirectWebSearch({
      query: 'Windkraft Ausbau Genehmigungsverfahren',
      includeDomains: [],
      excludeDomains: [],
    });
    const call = lastCommission();
    expect(call).not.toHaveProperty('includeDomains');
    expect(call).not.toHaveProperty('excludeDomains');
  });
});

describe('executeDirectWebSearch — date window', () => {
  it('resolves timeRange: week to a fromDate about 7 days in the past', async () => {
    await executeDirectWebSearch({ query: 'Bundestag Plenarsitzung', timeRange: 'week' });
    const { fromDate } = lastCommission() as { fromDate: string };
    expect(fromDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const daysAgo = (Date.now() - new Date(fromDate).getTime()) / 86_400_000;
    // Wide tolerance around 7 absorbs timezone-boundary skew without hardcoding a date.
    expect(daysAgo).toBeGreaterThan(5.5);
    expect(daysAgo).toBeLessThan(8.5);
  });

  it('lets an explicit fromDate win over timeRange', async () => {
    await executeDirectWebSearch({
      query: 'Bundestag Plenarsitzung',
      timeRange: 'week',
      fromDate: '2020-01-01',
    });
    expect(lastCommission().fromDate).toBe('2020-01-01');
  });

  it('gives searchType: news alone a ~30-day window', async () => {
    await executeDirectWebSearch({ query: 'Koalitionsstreit Ampel', searchType: 'news' });
    const { fromDate } = lastCommission() as { fromDate: string };
    const daysAgo = (Date.now() - new Date(fromDate).getTime()) / 86_400_000;
    expect(daysAgo).toBeGreaterThan(28.5);
    expect(daysAgo).toBeLessThan(31.5);
  });

  it('passes toDate through unchanged', async () => {
    await executeDirectWebSearch({ query: 'Bundestag Plenarsitzung', toDate: '2026-01-01' });
    expect(lastCommission().toDate).toBe('2026-01-01');
  });
});

describe('executeDirectWebSearch — images are opt-in', () => {
  it('never asks the engine for images on a plain search', async () => {
    await executeDirectWebSearch({ query: 'Grüne Klimapolitik Beschlüsse' });
    expect(lastCommission()).not.toHaveProperty('includeImages');
  });

  it('asks for images only when includeImages is requested', async () => {
    await executeDirectWebSearch({
      query: 'Fotos von der Klimademo Berlin',
      includeImages: true,
    });
    expect(lastCommission().includeImages).toBe(true);
  });
});

describe('executeDirectWebSearch — image hits never enter results', () => {
  it('splits a mixed engine response into text-only results and image-only images', async () => {
    mockWebSearch.mockResolvedValueOnce({
      results: [
        { name: 'Artikel A', url: 'https://zeit.de/a', content: 'Textinhalt A' },
        { name: 'Bild 1', url: 'https://zeit.de/bild1.jpg', content: '', type: 'image' },
        { name: 'Artikel B', url: 'https://spiegel.de/b', content: 'Textinhalt B' },
        { name: 'Bild 2', url: 'https://spiegel.de/bild2.jpg', content: '', type: 'image' },
      ] satisfies LinkupSearchResult[],
    });

    const result = await executeDirectWebSearch({
      query: 'Klimademo Berlin Fotos',
      includeImages: true,
    });

    // An image in `results` becomes a numbered citation backing an empty snippet —
    // this split is the regression that matters most.
    expect(result.results.map((r) => r.url)).toEqual(['https://zeit.de/a', 'https://spiegel.de/b']);
    expect(result.images?.map((i) => i.url)).toEqual([
      'https://zeit.de/bild1.jpg',
      'https://spiegel.de/bild2.jpg',
    ]);
  });
});

describe('executeDirectWebSearch — tier maps to the engine setting resolveSearchPlan assigns', () => {
  it.each(SEARCH_TIERS)('tier=%s', async (tier) => {
    // An instruction verb ("erkläre") keeps `fastLookupShape` from overriding the
    // tier's own depth with the `fast` shortcut, so this checks the tier mapping
    // itself rather than the keyword-shortcut path (covered separately below).
    const query = 'Erkläre die Reform der Grundsteuer in Deutschland ausführlich';
    const plan = resolveSearchPlan({ tier, query });

    await executeDirectWebSearch({ query, tier });

    const call = lastCommission();
    expect(call.depth).toBe(plan.depth);
    expect(call.maxResults).toBe(plan.maxResults);
    expect(call.adjacentSearches).toBe(plan.adjacentSearches);
  });

  it('never combines adjacentSearches with depth: fast', async () => {
    const query = 'Wann ist Marilyn Monroe geboren';
    const plan = resolveSearchPlan({ tier: 'standard', query });
    // Sanity check on the fixture: this query must actually take the `fast` path,
    // otherwise the assertion below would pass for the wrong reason.
    expect(plan.depth).toBe('fast');

    await executeDirectWebSearch({ query, tier: 'standard' });

    const call = lastCommission();
    expect(call.depth).toBe('fast');
    expect(call.adjacentSearches).toBe(false);
  });
});
