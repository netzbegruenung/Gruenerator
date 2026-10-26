import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../config/env.js', () => ({ env: {} }));

import {
  UnsplashApiError,
  UnsplashApiService,
  UnsplashRateLimitError,
} from './UnsplashApiService.js';

const VALID =
  'https://api.unsplash.com/photos/LBI7cgq3pbM/download?ixid=M3w0NjQ3OTJ8MHwxfHNlYXJjaHwx';

describe('UnsplashApiService.trackDownload', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches the Unsplash download endpoint with the Client-ID', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await new UnsplashApiService('key').trackDownload(VALID);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe(VALID);
  });

  it.each([
    'https://attacker.example/photos/abc/download',
    'http://api.unsplash.com/photos/abc/download',
    'https://api.unsplash.com.attacker.example/photos/abc/download',
    'https://user:pw@api.unsplash.com/photos/abc/download',
    'https://api.unsplash.com:8443/photos/abc/download',
    'https://api.unsplash.com/me',
    'https://api.unsplash.com/photos/abc/download/../../me',
    'http://169.254.169.254/latest/meta-data/',
    'not a url',
  ])('rejects %s without fetching', async (location) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(new UnsplashApiService('key').trackDownload(location)).rejects.toBeInstanceOf(
      UnsplashApiError
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('UnsplashApiService.searchPhotos rate limit', () => {
  const photo = {
    id: 'abc',
    created_at: '',
    width: 1,
    height: 1,
    color: null,
    description: null,
    alt_description: 'Wald',
    urls: { raw: '', full: '', regular: 'https://images.unsplash.com/x', small: '', thumb: '' },
    links: { html: 'https://unsplash.com/photos/abc', download_location: VALID },
    user: {
      id: 'u',
      username: 'jane-doe',
      name: 'Jane Doe',
      links: { html: 'https://unsplash.com/@jane' },
    },
  };
  const service = new UnsplashApiService('key');

  afterEach(() => {
    vi.unstubAllGlobals();
    service.clearCache();
  });

  it('reports the remaining hourly searches', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ total: 1, total_pages: 1, results: [photo] }), {
          status: 200,
          headers: { 'X-Ratelimit-Remaining': '7' },
        })
      )
    );

    const result = await service.searchPhotos('wald');

    expect(result.rateLimitRemaining).toBe(7);
    expect(result.results).toHaveLength(1);
  });

  it.each([
    [
      '403 with remaining 0',
      new Response('Rate Limit Exceeded', {
        status: 403,
        headers: { 'X-Ratelimit-Remaining': '0' },
      }),
    ],
    ['429', new Response('Too Many Requests', { status: 429 })],
  ])('blocks further searches after a %s', async (_label, refusal) => {
    const fetchMock = vi.fn().mockResolvedValue(refusal);
    vi.stubGlobal('fetch', fetchMock);

    await expect(service.searchPhotos('wald')).rejects.toBeInstanceOf(UnsplashRateLimitError);
    const second = service.searchPhotos('see');

    await expect(second).rejects.toMatchObject({ retryAfter: expect.any(Number) });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('treats another 403 as an ordinary API error', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ errors: ['OAuth error: invalid token'] }), { status: 403 })
        )
    );

    const error = await service.searchPhotos('wald').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UnsplashApiError);
    expect(error).not.toBeInstanceOf(UnsplashRateLimitError);
  });
});

describe('UnsplashApiService.searchPhotos attribution', () => {
  const service = new UnsplashApiService('key');
  const photoBy = (instagram_username: string | null) => ({
    id: 'abc',
    alt_description: 'Wald',
    urls: { regular: 'https://images.unsplash.com/x' },
    links: { html: 'https://unsplash.com/photos/abc', download_location: VALID },
    user: {
      username: 'jane-doe',
      name: 'Jane Doe',
      instagram_username,
      links: { html: 'https://unsplash.com/@jane-doe' },
    },
  });
  const search = async (instagram: string | null) => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ total: 1, total_pages: 1, results: [photoBy(instagram)] }))
        )
    );
    const { results } = await service.searchPhotos(`wald-${instagram}`);
    return results[0]!.attribution;
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    service.clearCache();
  });

  it('links the profile with the referral UTM parameters', async () => {
    expect((await search(null)).profileUrl).toBe(
      'https://unsplash.com/@jane-doe?utm_source=gruenerator&utm_medium=referral'
    );
  });

  it('keeps the Instagram handle for the post credit, without the @', async () => {
    expect((await search('@janedoe')).instagramUsername).toBe('janedoe');
    expect(await search(null)).not.toHaveProperty('instagramUsername');
  });
});
