/**
 * deleteAccount: server call first, local cleanup only on success.
 *
 * Run with: pnpm --filter @gruenerator/mobile test
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const deleteAccountCall = vi.fn();
const clearAll = vi.fn().mockResolvedValue(undefined);
const clearAuth = vi.fn();
const post = vi.fn();

vi.mock('@gruenerator/shared/api', () => ({
  getContractsClient: () => ({ userProfile: { deleteAccount: deleteAccountCall } }),
}));
vi.mock('@gruenerator/shared/stores', () => ({
  useAuthStore: { getState: () => ({ clearAuth, setLoggingOut: vi.fn() }) },
  setAuthStoreConfig: vi.fn(),
}));
vi.mock('@gruenerator/chat/stores', () => ({ useUserProfileStore: {} }));
vi.mock('expo-auth-session', () => ({ makeRedirectUri: () => 'gruenerator://auth/callback' }));
vi.mock('expo-web-browser', () => ({ maybeCompleteAuthSession: vi.fn() }));
vi.mock('./api', () => ({
  getGlobalApiClient: () => ({ post }),
  API_ENDPOINTS: { AUTH_MOBILE_LOGOUT: '/logout' },
}));
vi.mock('./queryClient', () => ({ queryClient: {} }));
vi.mock('./storage', () => ({ secureStorage: { clearAll } }));

const { deleteAccount } = await import('./auth');

beforeEach(() => {
  vi.clearAllMocks();
  post.mockResolvedValue({});
});

describe('deleteAccount', () => {
  it('sends the confirmation and cleans up locally on success', async () => {
    deleteAccountCall.mockResolvedValue({ status: 200, body: { success: true, message: 'ok' } });
    await deleteAccount();
    expect(deleteAccountCall).toHaveBeenCalledWith({ body: { confirm: 'löschen' } });
    expect(clearAll).toHaveBeenCalledOnce();
    expect(clearAuth).toHaveBeenCalledOnce();
  });

  it('still cleans up when the logout POST fails after the session was revoked', async () => {
    deleteAccountCall.mockResolvedValue({ status: 200, body: { success: true, message: 'ok' } });
    post.mockRejectedValue(new Error('401'));
    await deleteAccount();
    expect(clearAuth).toHaveBeenCalledOnce();
  });

  it('throws the server message and keeps local state on failure', async () => {
    deleteAccountCall.mockResolvedValue({
      status: 500,
      body: { success: false, message: 'Löschen fehlgeschlagen' },
    });
    await expect(deleteAccount()).rejects.toThrow('Löschen fehlgeschlagen');
    expect(clearAll).not.toHaveBeenCalled();
    expect(clearAuth).not.toHaveBeenCalled();
  });
});
