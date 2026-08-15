import {
  createApiClient,
  setGlobalApiClient,
  getGlobalApiClient,
  apiRequest,
  type AuthRequestConfig,
} from '@gruenerator/shared/api';
import { useAuthStore } from '@gruenerator/shared/stores';
import { isAxiosError } from 'axios';

import { DEV_AUTH_BYPASS } from './devAuth';
import { secureStorage } from './storage';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://gruenerator.eu/api';

export interface UnauthorizedDeps {
  devAuthBypass: boolean;
  probeSession: () => Promise<{ user?: unknown } | null>;
  clearStoredAuth: () => Promise<void>;
  clearAuthStore: () => void;
}

/**
 * Decide what a 401 means. Dependencies are injected rather than imported so the
 * policy can be exercised without an axios interceptor — every branch below is a
 * bug that has already shipped once.
 *
 * A 401 isn't always a dead session — a flaky non-auth endpoint or a momentary
 * server blip can return one, and wiping on the first 401 would log out a user
 * whose session is actually fine. So re-probe the session endpoint ONCE before
 * destroying local auth.
 *
 * Returns true to retry the original request, false to let it fail.
 */
export async function handleUnauthorized(deps: UnauthorizedDeps): Promise<boolean> {
  // DEV bypass (Tier 1, no backend): a fake user is authed client-side, so
  // real API calls 401. Never wipe the store or retry — just let the call
  // fail; otherwise the first data fetch bounces the emulator to login.
  if (deps.devAuthBypass) return false;
  try {
    const probe = await deps.probeSession();
    if (probe?.user) {
      // Session is alive — the original 401 was a fluke. Returning true
      // tells the interceptor to retry the original request once.
      return true;
    }
    // 2xx with no user → session really is gone → fall through to wipe.
  } catch (error: unknown) {
    // Only a definitive 401/403 on the probe confirms a dead session.
    // Network / timeout / 5xx is indeterminate → keep the session.
    const status = isAxiosError(error) ? error.response?.status : undefined;
    if (status !== 401 && status !== 403) {
      return false;
    }
  }
  await deps.clearStoredAuth();
  deps.clearAuthStore();
  return false;
}

export function initializeApiClient(): void {
  const client = createApiClient({
    baseURL: API_BASE_URL,
    authMode: 'bearer',
    getAuthToken: async () => {
      return secureStorage.getToken();
    },
    onUnauthorized: () =>
      handleUnauthorized({
        devAuthBypass: DEV_AUTH_BYPASS,
        // `skipAuthRefresh` exempts the probe from this very interceptor so it
        // can't recurse.
        probeSession: async () => {
          const probeConfig: AuthRequestConfig = { skipAuthRefresh: true };
          const probe = await getGlobalApiClient().get<{ user?: unknown } | null>(
            API_ENDPOINTS.AUTH_GET_SESSION,
            probeConfig
          );
          return probe.data;
        },
        clearStoredAuth: () => secureStorage.clearAll(),
        clearAuthStore: () => useAuthStore.getState().clearAuth(),
      }),
    // Persist a rotated bearer token (Better Auth `set-auth-token` header) so
    // the stored token never drifts out of sync with the server session.
    onTokenRefresh: async (token: string): Promise<void> => {
      await secureStorage.setToken(token);
    },
    timeout: 120000,
  });

  setGlobalApiClient(client);
}

export { getGlobalApiClient, apiRequest };

/**
 * API endpoints used by the mobile app (auth only).
 * Generator endpoints are imported from @gruenerator/shared/generators.
 */
export const API_ENDPOINTS = {
  AUTH_LOGIN: '/auth/login',
  // Better Auth's `mobileTokenExchange` plugin endpoint — takes the login-code
  // JWT from the OAuth callback and returns an opaque session token the
  // `bearer()` plugin recognises.
  AUTH_TOKEN_EXCHANGE_CODE: '/auth/v2/token-exchange-code',
  // Better Auth's native session endpoint; works with both cookies (web)
  // and Bearer tokens (mobile, via the `bearer()` plugin).
  AUTH_GET_SESSION: '/auth/v2/get-session',
  // Mints a 60s single-use token that turns the app's Bearer session into a
  // real cookie inside an embedded WebView.
  // See apps/api/plugins/webViewHandoff.ts.
  AUTH_WEB_HANDOFF_MINT: '/auth/v2/web-handoff/mint',
  AUTH_MOBILE_LOGOUT: '/auth/mobile/logout',
  AUTH_PROFILE: '/auth/profile',
  AUTH_PROFILE_AVATAR: '/auth/profile/avatar',
  AUTH_PROFILE_COLOR: '/auth/profile/message-color',
  AUTH_PROFILE_LOCALE: '/auth/locale',
} as const;
