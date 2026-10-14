import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { INSTANT_AUTH_CACHE, LOGOUT_TIMESTAMP } from '../features/auth/storageKeys';

const getSession = vi.fn<() => Promise<unknown>>();
vi.mock('../lib/authClient', () => ({ authClient: { getSession: () => getSession() } }));

const sessionUser = {
  id: 'u1',
  email: 'a@b.de',
  name: 'Alex',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function writeCache(timestamp = Date.now()) {
  localStorage.setItem(
    INSTANT_AUTH_CACHE,
    JSON.stringify({
      timestamp,
      data: { isAuthenticated: true, user: { id: 'u1', email: 'a@b.de', display_name: 'Alex' } },
    })
  );
}

// The seed is read when the store module is created, so each case loads a
// fresh module graph after arranging localStorage.
async function load() {
  vi.resetModules();
  const { useAuthStore } = await import('./authStore');
  const { authStatusQueryOptions } = await import('../hooks/useAuth');
  const apiClient = (await import('../components/utils/apiClient')).default;
  const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: {} });
  const client = new QueryClient();
  const runQuery = () =>
    (authStatusQueryOptions.queryFn as (ctx: { client: QueryClient }) => Promise<unknown>)({
      client,
    });
  return { useAuthStore, runQuery, get };
}

beforeEach(() => {
  localStorage.clear();
  getSession.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Each case imports the whole auth module graph afresh; the first one is slow.
describe('authStore warm-start seed', { timeout: 30_000 }, () => {
  it('mirrors the instant-auth cache, unconfirmed', async () => {
    writeCache();
    const { useAuthStore } = await load();
    const s = useAuthStore.getState();
    expect(s.user?.id).toBe('u1');
    expect(s.isAuthenticated).toBe(true);
    expect(s.hasServerConfirmed).toBe(false);
  });

  it('stays empty without a fresh cache', async () => {
    writeCache(Date.now() - 6 * 60 * 1000);
    const { useAuthStore } = await load();
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('confirms a seeded user once and runs /auth/init exactly once', async () => {
    writeCache();
    getSession.mockResolvedValue({ data: { user: sessionUser }, error: null });
    const { useAuthStore, runQuery, get } = await load();

    await runQuery();
    expect(useAuthStore.getState().hasServerConfirmed).toBe(true);
    expect(get).toHaveBeenCalledWith('/auth/init', expect.anything());

    await runQuery();
    expect(get.mock.calls.filter(([url]) => url === '/auth/init')).toHaveLength(1);
  });

  it('drops an unconfirmed seed on a guest answer without a full logout', async () => {
    writeCache();
    getSession.mockResolvedValue({ data: null, error: null });
    const { useAuthStore, runQuery } = await load();

    await runQuery();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(localStorage.getItem(LOGOUT_TIMESTAMP)).toBeNull();
    expect(localStorage.getItem(INSTANT_AUTH_CACHE)).toBeNull();
  });
});
