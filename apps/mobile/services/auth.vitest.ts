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

async function launch(profile: Record<string, unknown>) {
  await secureStorage.setToken('tok');
  await secureStorage.setUser(JSON.stringify(CACHED));
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

describe('checkAuthStatus', () => {
  it('keeps the cached display name through the session probe', async () => {
    const seen = await launch({ display_name: 'Moritz Wachter' });

    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((name) => name === 'Moritz Wachter')).toBe(true);
  });

  it('does not rewrite the store or the cache when the profile is unchanged', async () => {
    await launch({ display_name: 'Moritz Wachter' });
    const settled = useAuthStore.getState().user;
    const stored = await secureStorage.getUser();

    get.mockClear();
    await checkAuthStatus();

    expect(useAuthStore.getState().user).toEqual(settled);
    expect(await secureStorage.getUser()).toBe(stored);
  });

  it('applies and persists a changed profile', async () => {
    await launch({ display_name: 'Moritz W.' });

    expect(useAuthStore.getState().user?.display_name).toBe('Moritz W.');
    expect(JSON.parse((await secureStorage.getUser()) ?? '{}').display_name).toBe('Moritz W.');
  });
});
