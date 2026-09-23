import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/redis/client.js', () => ({
  ensureConnected: vi.fn(),
  redisClient: { set: vi.fn() },
}));

const { dispatchDueContentSync, dueContentSyncSlot } = await import('./contentSyncDispatcher.js');

const at = (hhmmss: string) => new Date(`2026-09-23T${hhmmss}Z`);

describe('dueContentSyncSlot', () => {
  it.each([
    ['02:17:00', 'full', '02:17'],
    ['02:47:00', 'full', '02:17'],
    ['04:23:00', 'hourly', '04:23'],
    ['20:23:00', 'hourly', '20:23'],
    ['20:53:00', 'hourly', '20:23'],
  ])('%s → %s slot %s', (time, mode, start) => {
    const slot = dueContentSyncSlot(at(time));
    expect(slot?.mode).toBe(mode);
    expect(slot?.start.toISOString()).toBe(`2026-09-23T${start}:00.000Z`);
  });

  it.each(['02:16:59', '02:47:01', '03:00:00', '04:22:59', '21:00:00', '00:00:00'])(
    '%s → none',
    (time) => {
      expect(dueContentSyncSlot(at(time))).toBeNull();
    }
  );
});

describe('dispatchDueContentSync', () => {
  // Minimal SET with NX/EX semantics; expiry is not simulated.
  const store = new Map<string, string>();
  const redis = {
    set: vi.fn((key: string, value: string, opts: { NX?: boolean; EX: number }) => {
      if (opts.NX && store.has(key)) return Promise.resolve(null);
      store.set(key, value);
      return Promise.resolve('OK');
    }),
  };
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    store.clear();
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const dispatch = (time: string) =>
    dispatchDueContentSync(
      at(time),
      'tok',
      redis as unknown as Parameters<typeof dispatchDueContentSync>[2]
    );

  it('dispatches a due slot once, with the mode as input', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await dispatch('02:18:00');
    await dispatch('02:19:00');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toContain('/actions/workflows/content-sync.yml/dispatches');
    expect(JSON.parse(String(init?.body))).toEqual({ ref: 'master', inputs: { mode: 'full' } });
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer tok');
    expect(store.get('content-sync:dispatch:2026-09-23T02:17:00.000Z')).toBe('full');
  });

  it('does nothing outside a slot', async () => {
    await dispatch('03:00:00');
    expect(redis.set).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shortens the claim on failure instead of keeping or deleting it', async () => {
    fetchMock.mockResolvedValue(new Response('Bad credentials', { status: 401 }));

    await dispatch('09:24:00');

    const key = 'content-sync:dispatch:2026-09-23T09:23:00.000Z';
    expect(store.get(key)).toBe('failed');
    expect(redis.set).toHaveBeenLastCalledWith(key, 'failed', { EX: 60 });
  });

  it('treats a network error like a failed dispatch', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNRESET'));

    await expect(dispatch('09:24:00')).resolves.toBeUndefined();
    expect(store.get('content-sync:dispatch:2026-09-23T09:23:00.000Z')).toBe('failed');
  });
});
