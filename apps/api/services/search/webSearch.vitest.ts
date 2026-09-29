/**
 * The facade's promise is that swapping engines is a config change: the order
 * comes from `WEB_SEARCH_CHAIN`, an engine that cannot honour a constraint is
 * skipped rather than asked, and a failing engine hands over to the next. These
 * tests drive the real facade with all three clients mocked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const greenptSearch = vi.fn();
const linkupSearch = vi.fn();
const searxngSearch = vi.fn();
let greenptService: unknown = null;
let linkupService: unknown = null;

vi.mock('./GreenPTSearchService.js', () => ({
  getGreenPTSearchService: () => greenptService,
  GREENPT_MAX_RESULTS: 20,
}));
vi.mock('./LinkupService.js', () => ({
  getLinkupService: () => linkupService,
}));
vi.mock('./SearxngService.js', () => ({
  searxngService: { performWebSearch: (...args: unknown[]) => searxngSearch(...args) },
}));

const { webSearch, canWebSearch, localizeQuery, NoWebSearchProviderError } =
  await import('./webSearch.js');
const { env } = await import('../../config/env.js');

const DEFAULT_CHAIN = env.WEB_SEARCH_CHAIN;

beforeEach(() => {
  vi.clearAllMocks();
  greenptService = { webSearch: greenptSearch };
  linkupService = { webSearch: linkupSearch };
  greenptSearch.mockResolvedValue([{ url: 'https://gp.de/1', title: 'G', description: 'g' }]);
  linkupSearch.mockResolvedValue({
    results: [{ url: 'https://lu.de/1', name: 'L', content: 'l' }],
  });
  searxngSearch.mockResolvedValue({
    success: true,
    results: [{ url: 'https://sx.de/1', title: 'S', content: 's', publishedDate: null }],
  });
});
afterEach(() => {
  env.WEB_SEARCH_CHAIN = DEFAULT_CHAIN;
});

describe('the chain decides, not the caller', () => {
  it('asks the first engine in WEB_SEARCH_CHAIN', async () => {
    env.WEB_SEARCH_CHAIN = ['linkup', 'greenpt'];
    const res = await webSearch({ query: 'q', maxResults: 5 });
    expect(res.provider).toBe('linkup');
    expect(greenptSearch).not.toHaveBeenCalled();
  });

  it('never asks an engine that is not in the chain', async () => {
    env.WEB_SEARCH_CHAIN = ['greenpt'];
    greenptSearch.mockRejectedValue(new Error('down'));
    await expect(webSearch({ query: 'q', maxResults: 5 })).rejects.toThrow('down');
    expect(linkupSearch).not.toHaveBeenCalled();
    expect(searxngSearch).not.toHaveBeenCalled();
  });

  it('skips an engine without a key', async () => {
    greenptService = null;
    const res = await webSearch({ query: 'q', maxResults: 5 });
    expect(res.provider).toBe('linkup');
  });
});

describe('an engine that cannot honour a constraint is skipped, not asked', () => {
  it.each([
    ['a domain scope', { includeDomains: ['zeit.de'] }],
    ['a time window', { fromDate: '2026-01-01' }],
    ['a news search', { news: true }],
    ['images', { includeImages: true }],
    ['page text', { needsContent: true }],
    ['deep', { depth: 'deep' as const }],
    ['more hits than its ceiling', { maxResults: 25 }],
  ])('GreenPT is skipped for %s', async (_label, extra) => {
    const res = await webSearch({ query: 'q', maxResults: 5, ...extra });
    expect(greenptSearch).not.toHaveBeenCalled();
    expect(res.provider).toBe('linkup');
  });

  it('leaves SearXNG out unless the chain names it — it is a private instance', async () => {
    greenptSearch.mockRejectedValue(new Error('x'));
    linkupSearch.mockRejectedValue(new Error('y'));
    await expect(webSearch({ query: 'q', maxResults: 5 })).rejects.toThrow('y');
    expect(searxngSearch).not.toHaveBeenCalled();
  });

  it('SearXNG does not take a domain scope — "such auf zeit.de" answered from anywhere is wrong, not thin', async () => {
    env.WEB_SEARCH_CHAIN = ['linkup', 'searxng'];
    linkupSearch.mockRejectedValue(new Error('down'));
    await expect(
      webSearch({ query: 'q', maxResults: 5, includeDomains: ['zeit.de'] })
    ).rejects.toThrow('down');
    expect(searxngSearch).not.toHaveBeenCalled();
  });

  it('SearXNG does not take `deep` — a flat search is not what a deep caller asked for', async () => {
    env.WEB_SEARCH_CHAIN = ['greenpt', 'linkup', 'searxng'];
    linkupService = null;
    greenptService = null;
    expect(canWebSearch({ query: 'q', maxResults: 5, depth: 'deep' })).toBe(false);
    await expect(webSearch({ query: 'q', maxResults: 5, depth: 'deep' })).rejects.toBeInstanceOf(
      NoWebSearchProviderError
    );
    expect(searxngSearch).not.toHaveBeenCalled();
  });
});

describe('a block list on an engine that filters after the call', () => {
  it('asks GreenPT for headroom, so the filter does not eat the count', async () => {
    await webSearch({ query: 'q', maxResults: 5, excludeDomains: ['amazon.de'] });
    expect(greenptSearch).toHaveBeenCalledWith(expect.objectContaining({ maxResults: 10 }));
  });

  it('drops blocked hosts by exact host, like isLowValueDomain', async () => {
    greenptSearch.mockResolvedValue([
      { url: 'https://www.amazon.de/x', title: 'A', description: 'a' },
      { url: 'https://developer.amazon.de/y', title: 'D', description: 'd' },
    ]);
    const res = await webSearch({ query: 'q', maxResults: 5, excludeDomains: ['amazon.de'] });
    expect(res.hits.map((h) => h.url)).toEqual(['https://developer.amazon.de/y']);
  });

  it('hands over when every hit was blocked — an empty list would read as "nothing on the web"', async () => {
    greenptSearch.mockResolvedValue([{ url: 'https://amazon.de/x', title: 'A', description: 'a' }]);
    const res = await webSearch({ query: 'q', maxResults: 5, excludeDomains: ['amazon.de'] });
    expect(res.provider).toBe('linkup');
  });
});

describe('failure hands over, emptiness does not', () => {
  it('moves on to the next engine when one throws', async () => {
    greenptSearch.mockRejectedValue(new Error('GreenPT returned zero results'));
    const res = await webSearch({ query: 'q', maxResults: 5 });
    expect(res.provider).toBe('linkup');
    expect(res.hits[0]?.url).toBe('https://lu.de/1');
  });

  it('ends on SearXNG when it is switched on and both paid engines are down', async () => {
    env.WEB_SEARCH_CHAIN = ['greenpt', 'linkup', 'searxng'];
    greenptSearch.mockRejectedValue(new Error('x'));
    linkupSearch.mockRejectedValue(new Error('y'));
    const res = await webSearch({ query: 'q', maxResults: 5 });
    expect(res.provider).toBe('searxng');
  });

  it("returns Linkup's empty answer as an answer — it has no silent-outage mode to guard against", async () => {
    greenptService = null;
    linkupSearch.mockResolvedValue({ results: [] });
    const res = await webSearch({ query: 'q', maxResults: 5 });
    expect(res.hits).toEqual([]);
    expect(searxngSearch).not.toHaveBeenCalled();
  });

  it('rethrows the last failure when every engine failed', async () => {
    env.WEB_SEARCH_CHAIN = ['greenpt', 'linkup', 'searxng'];
    greenptSearch.mockRejectedValue(new Error('x'));
    linkupSearch.mockRejectedValue(new Error('y'));
    searxngSearch.mockResolvedValue({ success: false, results: [] });
    await expect(webSearch({ query: 'q', maxResults: 5 })).rejects.toThrow(/SearXNG/);
  });
});

describe('Austrian users get Austrian sources', () => {
  it('appends the country to a query that does not name it', () => {
    expect(localizeQuery('Pflegegeld Erhöhung', 'de-AT')).toBe('Pflegegeld Erhöhung Österreich');
  });

  it.each(['Klimaticket Österreich', 'Gemeindebau Wien', 'Landtag Steiermark', 'orf.at Bericht'])(
    'leaves "%s" alone — it already points at Austria',
    (query) => {
      expect(localizeQuery(query, 'de-AT')).toBe(query);
    }
  );

  it('leaves a query alone that names another country — the question is about there', () => {
    expect(localizeQuery('Klimageld Deutschland', 'de-AT')).toBe('Klimageld Deutschland');
  });

  it('leaves a site-scoped search alone — the user already aimed it', () => {
    expect(localizeQuery('Heizungsgesetz', 'de-AT', ['spiegel.de'])).toBe('Heizungsgesetz');
  });

  it('does nothing for German users', () => {
    expect(localizeQuery('Pflegegeld Erhöhung', 'de-DE')).toBe('Pflegegeld Erhöhung');
    expect(localizeQuery('Pflegegeld Erhöhung', undefined)).toBe('Pflegegeld Erhöhung');
  });

  it('reaches every engine, not just one', async () => {
    greenptService = null;
    await webSearch({ query: 'Pendlerpauschale', maxResults: 5, locale: 'de-AT' });
    expect(linkupSearch).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'Pendlerpauschale Österreich' })
    );
  });
});
