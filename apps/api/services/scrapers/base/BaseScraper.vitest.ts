/**
 * `fetchWithRetry` behandelt alles außerhalb von 2xx als Fehler und wiederholt
 * es. Für einen bedingten GET ist `304 Not Modified` aber die *erwünschte*
 * Antwort — ohne `acceptStatus` würde jedes unveränderte PDF dreimal angefragt
 * und der Lauf danach mit „HTTP 304" abbrechen, statt es zu überspringen.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

import { BaseScraper } from './BaseScraper.js';

import type { ScraperResult } from '../types.js';

class TestScraper extends BaseScraper {
  constructor() {
    super({ collectionName: 'test', delayMs: 0 });
  }
  scrape(): Promise<ScraperResult> {
    throw new Error('not used');
  }
  fetch(url: string, options: Parameters<BaseScraper['fetchWithRetry']>[1]) {
    return this.fetchWithRetry(url, options);
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchWithRetry', () => {
  it('returns a 304 as a result when it is accepted, without retrying', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 304 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await new TestScraper().fetch('https://example.org/a.pdf', {
      acceptStatus: [304],
      maxRetries: 3,
    });

    expect(response.status).toBe(304);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('still retries and throws on a 304 when it is not accepted', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 304 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      new TestScraper().fetch('https://example.org/a.pdf', { maxRetries: 1 })
    ).rejects.toThrow('HTTP 304');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('sends the caller-supplied conditional headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await new TestScraper().fetch('https://example.org/a.pdf', {
      headers: { 'If-None-Match': '"v1"' },
    });

    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({ 'If-None-Match': '"v1"' });
  });

  it('does not swallow real failures', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      new TestScraper().fetch('https://example.org/a.pdf', { acceptStatus: [304], maxRetries: 0 })
    ).rejects.toThrow('HTTP 500');
  });
});
