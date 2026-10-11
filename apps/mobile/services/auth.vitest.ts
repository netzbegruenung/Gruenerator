import { useAuthStore } from '@gruenerator/shared/stores';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { __resetSecureStore } from '../test/stubs/expo-secure-store';

import { checkAuthStatus } from './auth';
import { secureStorage } from './storage';

const get = vi.fn();

vi.mock('expo-auth-session', () => ({ makeRedirectUri: () => 'gruenerator://auth/callback' }));
vi.mock('expo-web-browser', () => ({ maybeCompleteAuthSession: vi.fn() }));
vi.mock('@gruenerator/chat/stores', () => ({ useUserProfileStore: {} }));
vi.mock('@gruenerator/shared/api', () => ({ getContractsClient: vi.fn() }));
vi.mock('./queryClient', () => ({ queryClient: { clear: vi.fn() } }));
vi.mock('./api', () => ({
  getGlobalApiClient: () => ({ get }),
  API_ENDPOINTS: { AUTH_GET_SESSION: '/session', AUTH_PROFILE: '/profile' },
}));

/**
 * The start-screen greeting reads `user.display_name`, which only the profile
 * endpoint knows — the session carries identity alone. On launch the cached user
 * must therefore survive the session probe, or the greeting drops to its
 * „Grüner“ fallback for as long as the profile request takes.
 */
const CACHED = { id: 'u1', email: 'm@example.org', display_name: 'Moritz Wachter' };

beforeEach(() => {
  __resetSecureStore();
  get.mockReset();
  useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: true });
});

const DAY = 24 * 60 * 60 * 1000;

async function launch(profile: Record<string, unknown>, syncedAgo: number | null) {
  await secureStorage.setToken('tok');
  await secureStorage.setUser(JSON.stringify(CACHED));
  if (syncedAgo !== null) await secureStorage.setProfileSyncedAt(Date.now() - syncedAgo);
  get.mockImplementation((url: string) =>
    Promise.resolve({
      data:
        url === '/session'
          ? { user: { id: 'u1', email: 'm@example.org' } }
          : { success: true, user: profile },
    })
  );

  const seen: Array<string | undefined> = [];
  const unsubscribe = useAuthStore.subscribe((s) => seen.push(s.user?.display_name));
  await checkAuthStatus();
  unsubscribe();
  return seen;
}

const profileCalls = () => get.mock.calls.filter(([url]) => url === '/profile').length;

describe('checkAuthStatus', () => {
  it('keeps the cached display name through the session probe', async () => {
    const seen = await launch({ display_name: 'Moritz Wachter' }, DAY * 2);

    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((name) => name === 'Moritz Wachter')).toBe(true);
  });

  it('does not ask for the profile again within a day', async () => {
    await launch({ display_name: 'Anders' }, DAY / 2);

    expect(profileCalls()).toBe(0);
    expect(useAuthStore.getState().user?.display_name).toBe('Moritz Wachter');
  });

  it('refreshes other profile fields after a day but never the name', async () => {
    await launch({ display_name: 'Anders', locale: 'de-AT' }, DAY * 2);

    expect(profileCalls()).toBe(1);
    expect(useAuthStore.getState().user?.display_name).toBe('Moritz Wachter');
    expect(useAuthStore.getState().user?.locale).toBe('de-AT');
    expect(JSON.parse((await secureStorage.getUser()) ?? '{}').display_name).toBe('Moritz Wachter');
  });

  it('fetches once when the cache predates the sync timestamp', async () => {
    await launch({ display_name: 'Moritz Wachter' }, null);

    expect(profileCalls()).toBe(1);
    expect(await secureStorage.getProfileSyncedAt()).not.toBeNull();
  });

  it('forgets the sync timestamp on logout, so the next login refetches the name', async () => {
    await secureStorage.setProfileSyncedAt(Date.now());
    await secureStorage.clearAll();

    expect(await secureStorage.getProfileSyncedAt()).toBeNull();
  });
});
