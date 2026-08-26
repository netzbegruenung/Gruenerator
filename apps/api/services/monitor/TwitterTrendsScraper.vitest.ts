/**
 * The X-trends scraper used to be hardwired to trends24.in/germany/, and the
 * Austrian snapshot got that German list handed through unchanged (#2878).
 * What is pinned here is the part that made the bug invisible: nothing in the
 * types said which country a trend list came from.
 *
 *   1. each locale fetches its own trends24 page,
 *   2. a locale that fails does not take the other one down,
 *   3. a snapshot row written before per-locale trends gives Austria nothing
 *      rather than the German list.
 *
 * Run: `npx vitest run services/monitor/TwitterTrendsScraper.vitest.ts`
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const fetchUrl = vi.fn();
vi.mock('../scrapers/implementations/UrlCrawler/index.js', () => ({
  urlCrawler: { fetchUrl: (...args: unknown[]) => fetchUrl(...args) },
}));

const { pickTrendsForLocale, scrapeTrendsByLocale, scrapeTwitterTrends } =
  await import('./TwitterTrendsScraper.js');

/** Shape taken from the live pages on 26.08.2026 — attribute values are unquoted. */
function trendPage(...names: string[]): { html: string } {
  const links = names
    .map(
      (n) =>
        `<li class="trend-card__list-item"><a href="https://twitter.com/search?q=${encodeURIComponent(n)}" class=trend-link>${n}</a></li>`
    )
    .join('');
  return { html: `<html><body><ol class="trend-card__list">${links}</ol></body></html>` };
}

beforeEach(() => {
  fetchUrl.mockReset();
});

describe('scrapeTwitterTrends', () => {
  it('fetches the German page for de and the Austrian page for at', async () => {
    fetchUrl.mockResolvedValue(trendPage('Zuckersteuer'));

    await scrapeTwitterTrends('de');
    await scrapeTwitterTrends('at');

    expect(fetchUrl.mock.calls[0][0]).toBe('https://trends24.in/germany/');
    expect(fetchUrl.mock.calls[1][0]).toBe('https://trends24.in/austria/');
  });

  it('parses ranked trends out of the trend links', async () => {
    fetchUrl.mockResolvedValue(trendPage('LASK', 'Dolly Parton', 'LASK'));

    const trends = await scrapeTwitterTrends('at');

    expect(trends).toEqual([
      { rank: 1, name: 'LASK', url: 'https://x.com/search?q=LASK' },
      { rank: 2, name: 'Dolly Parton', url: 'https://x.com/search?q=Dolly%20Parton' },
    ]);
  });

  it('returns an empty list instead of throwing when the page is unreachable', async () => {
    fetchUrl.mockRejectedValue(new Error('timeout'));

    await expect(scrapeTwitterTrends('at')).resolves.toEqual([]);
  });
});

describe('scrapeTrendsByLocale', () => {
  it('keys the lists by locale', async () => {
    fetchUrl.mockImplementation((url: string) =>
      Promise.resolve(url.includes('austria') ? trendPage('LASK') : trendPage('Zuckersteuer'))
    );

    const byLocale = await scrapeTrendsByLocale();

    expect(byLocale.de.map((t) => t.name)).toEqual(['Zuckersteuer']);
    expect(byLocale.at.map((t) => t.name)).toEqual(['LASK']);
  });

  it('keeps the working locale when the other one fails', async () => {
    fetchUrl.mockImplementation((url: string) =>
      url.includes('austria')
        ? Promise.reject(new Error('503'))
        : Promise.resolve(trendPage('Zuckersteuer'))
    );

    const byLocale = await scrapeTrendsByLocale();

    expect(byLocale.de.map((t) => t.name)).toEqual(['Zuckersteuer']);
    expect(byLocale.at).toEqual([]);
  });
});

describe('pickTrendsForLocale', () => {
  const de = [{ rank: 1, name: 'Zuckersteuer', url: 'https://x.com/search?q=Zuckersteuer' }];
  const at = [{ rank: 1, name: 'LASK', url: 'https://x.com/search?q=LASK' }];

  it('takes the stored list for the locale', () => {
    expect(pickTrendsForLocale({ de, at }, de, 'at')).toEqual(at);
  });

  it('falls back to the legacy column for de', () => {
    expect(pickTrendsForLocale({}, de, 'de')).toEqual(de);
    expect(pickTrendsForLocale(null, de, 'de')).toEqual(de);
  });

  it('gives Austria nothing rather than the legacy German list', () => {
    expect(pickTrendsForLocale({}, de, 'at')).toEqual([]);
    expect(pickTrendsForLocale(null, de, 'at')).toEqual([]);
  });
});
