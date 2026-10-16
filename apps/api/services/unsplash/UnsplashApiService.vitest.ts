import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../config/env.js', () => ({ env: {} }));

import { UnsplashApiError, UnsplashApiService } from './UnsplashApiService.js';

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
