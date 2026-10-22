import { beforeEach, describe, expect, it, vi } from 'vitest';

const cache = new Map<string, { value: unknown; ttl: number }>();

vi.mock('../../utils/redis/jsonCache.js', () => ({
  getCachedJson: (key: string) => Promise.resolve(cache.get(key)?.value ?? null),
  setCachedJson: (key: string, value: unknown, ttl: number) => {
    cache.set(key, { value, ttl });
    return Promise.resolve();
  },
}));

const { getIosStoreVersion } = await import('./iosStoreRelease.js');

const fetchMock = vi.fn<typeof fetch>();
vi.stubGlobal('fetch', fetchMock);

const respond = (body: unknown, status = 200) =>
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));

beforeEach(() => {
  cache.clear();
  fetchMock.mockReset();
});

describe('getIosStoreVersion', () => {
  it('returns the live version and keeps it for hours', async () => {
    respond({ resultCount: 1, results: [{ version: '1.7.0' }] });
    expect(await getIosStoreVersion()).toBe('1.7.0');
    expect(cache.get('app-release:ios')?.ttl).toBe(6 * 60 * 60);

    expect(await getIosStoreVersion()).toBe('1.7.0');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // Today's state: the app is not public in the App Store yet.
  it('returns null while Apple knows no such app, and asks again sooner', async () => {
    respond({ resultCount: 0, results: [] });
    expect(await getIosStoreVersion()).toBeNull();
    expect(cache.get('app-release:ios')?.ttl).toBe(30 * 60);
  });

  it('returns null when Apple fails, instead of throwing at the app', async () => {
    respond({}, 503);
    expect(await getIosStoreVersion()).toBeNull();

    fetchMock.mockRejectedValueOnce(new Error('timeout'));
    cache.clear();
    expect(await getIosStoreVersion()).toBeNull();
  });
});
