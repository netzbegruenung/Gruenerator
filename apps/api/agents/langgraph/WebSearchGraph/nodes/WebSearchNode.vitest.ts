/**
 * The legacy deep-research web step goes through the web-search facade: the
 * engine is the chain's choice, and an outage of every engine must be visible —
 * the node marks the run as a critical failure so callers can say "search is
 * down" instead of "nothing found".
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockWebSearch = vi.fn();

vi.mock('../../../../services/search/webSearch.js', () => ({
  webSearch: (...args: unknown[]) => mockWebSearch(...args),
}));

const { webSearchNode, toWebSearchRequest } = await import('./WebSearchNode.js');

function state(subqueries: string[]) {
  return {
    query: subqueries[0],
    mode: 'normal' as const,
    subqueries,
    searchOptions: {},
    metadata: {},
  } as never;
}

describe('webSearchNode', () => {
  beforeEach(() => {
    mockWebSearch.mockReset();
  });

  it('asks the facade and records the engine that answered', async () => {
    mockWebSearch.mockResolvedValue({
      provider: 'greenpt',
      hits: [{ url: 'https://example.org', title: 'T', content: 'c', date: null }],
      images: [],
    });

    const out = await webSearchNode(state(['klimaschutz']));

    expect(mockWebSearch).toHaveBeenCalledWith(expect.objectContaining({ query: 'klimaschutz' }));
    expect(out.webResults).toHaveLength(1);
    expect(out.webResults?.[0]?.provider).toBe('greenpt');
    expect(out.webResults?.[0]?.results[0]?.url).toBe('https://example.org');
    expect(out.error).toBeUndefined();
    expect(out.metadata?.criticalFailure).toBeUndefined();
  });

  it('flags a critical failure when every query fails', async () => {
    mockWebSearch.mockRejectedValue(new Error('ECONNREFUSED'));

    const out = await webSearchNode(state(['a', 'b']));

    expect(out.webResults?.every((r) => !r.success)).toBe(true);
    expect(out.error).toBeTruthy();
    expect(out.metadata?.criticalFailure).toBe(true);
  });

  it('keeps partial success when only some queries fail', async () => {
    mockWebSearch.mockRejectedValueOnce(new Error('timeout')).mockResolvedValue({
      provider: 'linkup',
      hits: [{ url: 'u', title: 't', content: 'c', date: null }],
      images: [],
    });

    const out = await webSearchNode(state(['a', 'b']));

    expect(out.metadata?.successfulWebSearches).toBe(1);
    expect(out.error).toBeUndefined();
  });
});

describe('toWebSearchRequest', () => {
  it('maps news category, time range and Austrian locale onto the facade request', () => {
    const req = toWebSearchRequest('q', {
      maxResults: 8,
      categories: 'general,news',
      time_range: 'week',
      language: 'de-AT',
    });
    expect(req).toMatchObject({ query: 'q', maxResults: 8, news: true, locale: 'de-AT' });
    expect(Date.now() - Date.parse(req.fromDate!)).toBeGreaterThan(6 * 86_400_000);
  });

  it('adds no constraints the planner did not set', () => {
    expect(toWebSearchRequest('q', {})).toEqual({ query: 'q', maxResults: 10 });
  });
});
