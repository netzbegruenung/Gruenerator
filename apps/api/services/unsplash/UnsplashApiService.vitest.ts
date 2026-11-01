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
    width: 4000,
    height: 6000,
    urls: {
      regular: 'https://images.unsplash.com/x',
      small: 'https://images.unsplash.com/x-small',
    },
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
    return results[0]!;
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    service.clearCache();
  });

  it('links the profile with the referral UTM parameters', async () => {
    expect((await search(null)).attribution.profileUrl).toBe(
      'https://unsplash.com/@jane-doe?utm_source=gruenerator&utm_medium=referral'
    );
  });

  it('keeps the Instagram handle for the post credit, without the @', async () => {
    expect((await search('@janedoe')).attribution.instagramUsername).toBe('janedoe');
    expect((await search(null)).attribution).not.toHaveProperty('instagramUsername');
  });

  // The video editor places the photo at its real aspect ratio and lists a
  // small preview instead of the 1080px image.
  it('passes the photo size and a small preview through', async () => {
    const image = await search(null);
    expect(image.width).toBe(4000);
    expect(image.height).toBe(6000);
    expect(image.thumb_url).toBe('https://images.unsplash.com/x-small');
  });
});

describe('UnsplashApiService.getPhoto', () => {
  const service = new UnsplashApiService('key');
  const photo = {
    id: 'Abc_def-123',
    alt_description: 'Wald',
    width: 3000,
    height: 4000,
    urls: { regular: 'https://images.unsplash.com/x', small: 'https://images.unsplash.com/xs' },
    links: { html: 'https://unsplash.com/photos/Abc_def-123', download_location: VALID },
    user: {
      username: 'jane-doe',
      name: 'Jane Doe',
      links: { html: 'https://unsplash.com/@jane-doe' },
    },
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    service.clearCache();
  });

  // A draft's search, its render and the credit of a later revision ask for
  // the same photo: one request, not three.
  it('answers a photo found by a search without asking again', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ total: 1, total_pages: 1, results: [photo] }))
      );
    vi.stubGlobal('fetch', fetchMock);

    await service.searchPhotos('wald', 1, 4, 'portrait');
    const found = await service.getPhoto('Abc_def-123');

    expect(found.attribution.photographer).toBe('Jane Doe');
    expect(fetchMock).toHaveBeenCalledOnce();
    const url = new URL(fetchMock.mock.calls[0]![0] as string);
    expect(url.searchParams.get('orientation')).toBe('portrait');
    expect(url.searchParams.get('content_filter')).toBe('high');
  });
});
