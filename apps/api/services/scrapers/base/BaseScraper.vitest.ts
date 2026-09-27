/**
 * `fetchWithRetry` behandelt alles außerhalb von 2xx als Fehler und wiederholt
 * es. Für einen bedingten GET ist `304 Not Modified` aber die *erwünschte*
 * Antwort — ohne `acceptStatus` würde jedes unveränderte PDF dreimal angefragt
 * und der Lauf danach mit „HTTP 304" abbrechen, statt es zu überspringen.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

import { BaseScraper, HttpStatusError, isGoneStatus } from './BaseScraper.js';

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

/**
 * Retrying a refusal is pure cost: LV Berlin's four permanently-403 press
 * releases cost 16 requests and ~24 s of backoff on every nightly walk before
 * this (#2971). What must keep its retries is anything that names a *timing*
 * problem, and anything that never reached HTTP at all.
 */
describe('retry policy by status', () => {
  it('gives up immediately on a permanent 4xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      new TestScraper().fetch('https://example.org/gone', { maxRetries: 3 })
    ).rejects.toThrow('HTTP 403');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps retrying a 5xx — the host may come back', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      new TestScraper().fetch('https://example.org/broken', { maxRetries: 2 })
    ).rejects.toThrow('HTTP 500');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('keeps retrying a 429 — that is what a rate limit asks for', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 429 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      new TestScraper().fetch('https://example.org/slow-down', { maxRetries: 1 })
    ).rejects.toThrow('HTTP 429');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps retrying a failure that never produced a status', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      new TestScraper().fetch('https://example.org/dns', { maxRetries: 2 })
    ).rejects.toThrow('fetch failed');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('carries the status on the thrown error, message unchanged', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    const error = await new TestScraper()
      .fetch('https://example.org/missing', { maxRetries: 0 })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(HttpStatusError);
    expect((error as HttpStatusError).status).toBe(404);
    // The sync report shows this string to people; it predates the class.
    expect((error as HttpStatusError).message).toBe('HTTP 404');
  });
});

describe('isGoneStatus', () => {
  it('covers the three statuses that mean the page is gone', () => {
    expect([403, 404, 410].map(isGoneStatus)).toEqual([true, true, true]);
  });

  it('leaves our problems ours: a missing credential and a broken host', () => {
    expect([401, 500, 502, 429].map(isGoneStatus)).toEqual([false, false, false, false]);
  });
});
