/**
 * The cheap GreenPT lane is only correct if it stays out of the way of every
 * search that needs something GreenPT cannot do. Its endpoint carries no date
 * on its results, no image hits, no exclude list and a hard ceiling of ten — and
 * it accepts unknown parameters silently instead of rejecting them, so a
 * wrongly-routed search does not fail, it quietly returns something narrower
 * than what was asked for.
 *
 * These tests drive the real `executeDirectWebSearch` with both clients mocked,
 * and assert which engine each commission reaches.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGreenPT = vi.fn();
const mockLinkup = vi.fn();

vi.mock('../../../services/search/GreenPTSearchService.js', () => ({
  getGreenPTSearchService: () => ({ webSearch: mockGreenPT }),
  GREENPT_MAX_RESULTS: 10,
}));
vi.mock('../../../services/search/LinkupService.js', () => ({
  getLinkupService: () => ({ webSearch: mockLinkup }),
}));

const { executeDirectWebSearch } = await import('./directSearchExecutors.js');

const greenptHit = (n: number) => ({
  url: `https://gp.de/${n}`,
  title: `GreenPT ${n}`,
  description: `Auszug ${n}`,
});
const linkupHit = (n: number) => ({
  name: `Linkup ${n}`,
  url: `https://lu.de/${n}`,
  content: `Inhalt ${n}`,
});

beforeEach(() => {
  mockGreenPT.mockReset();
  mockLinkup.mockReset();
  mockGreenPT.mockResolvedValue([greenptHit(1), greenptHit(2)]);
  mockLinkup.mockResolvedValue({ results: [linkupHit(1)] });
});

describe('simple lookups take the GreenPT lane', () => {
  it('routes a plain query to GreenPT and does not pay Linkup at all', async () => {
    const res = await executeDirectWebSearch({ query: 'Einwohnerzahl Kassel' });
    expect(mockGreenPT).toHaveBeenCalledTimes(1);
    expect(mockLinkup).not.toHaveBeenCalled();
    expect(res.results[0]?.url).toBe('https://gp.de/1');
  });

  it('leaves publishedDate null — GreenPT results carry no date, and an invented one would be scored as a real recency signal', async () => {
    const res = await executeDirectWebSearch({ query: 'Einwohnerzahl Kassel' });
    expect(res.results[0]?.publishedDate).toBeNull();
  });
});

describe('anything GreenPT cannot express stays on Linkup', () => {
  const cases: Array<[string, Parameters<typeof executeDirectWebSearch>[0]]> = [
    ['a site scope', { query: 'Klimapolitik', includeDomains: ['zeit.de'] }],
    ['a block list', { query: 'Klimapolitik', excludeDomains: ['amazon.de'] }],
    ['an explicit date window', { query: 'Klimapolitik', fromDate: '2026-01-01' }],
    ['an upper date bound', { query: 'Klimapolitik', toDate: '2026-06-01' }],
    ['a relative time range', { query: 'Klimapolitik', timeRange: 'week' }],
    ['a news search (a recency constraint)', { query: 'Klimapolitik', searchType: 'news' }],
    ['image hits', { query: 'Klimapolitik', includeImages: true }],
    ['the deep tier', { query: 'Klimapolitik', tier: 'tiefenrecherche' }],
    ['more results than the ceiling', { query: 'Klimapolitik', maxResults: 20 }],
  ];

  for (const [label, params] of cases) {
    it(`skips GreenPT for ${label}`, async () => {
      await executeDirectWebSearch(params);
      expect(mockGreenPT).not.toHaveBeenCalled();
      expect(mockLinkup).toHaveBeenCalledTimes(1);
    });
  }
});

describe('GreenPT failure falls through to Linkup', () => {
  it('falls back when GreenPT returns nothing — an empty lane answer would read as "the web has nothing on this"', async () => {
    mockGreenPT.mockRejectedValue(new Error('GreenPT returned zero results'));
    const res = await executeDirectWebSearch({ query: 'Einwohnerzahl Kassel' });
    expect(mockLinkup).toHaveBeenCalledTimes(1);
    expect(res.resultsCount).toBe(1);
    expect(res.results[0]?.url).toBe('https://lu.de/1');
    expect(res.error).toBeUndefined();
  });

  it('falls back when the rate gate refuses the call', async () => {
    mockGreenPT.mockRejectedValue(new Error('GreenPT rate gate — 900ms since last call'));
    const res = await executeDirectWebSearch({ query: 'Einwohnerzahl Kassel' });
    expect(res.results[0]?.url).toBe('https://lu.de/1');
  });

  it('falls back when the circuit is open', async () => {
    mockGreenPT.mockRejectedValue(new Error('GreenPT circuit open'));
    const res = await executeDirectWebSearch({ query: 'Einwohnerzahl Kassel' });
    expect(res.results[0]?.url).toBe('https://lu.de/1');
  });
});
