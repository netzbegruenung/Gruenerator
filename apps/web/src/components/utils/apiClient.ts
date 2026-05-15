import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { type AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import axios from 'axios';

import {
  ALL_AUTH_LOCAL_KEYS,
  INSTANT_AUTH_CACHE,
  LOGOUT_TIMESTAMP,
  REDIRECT_TIMESTAMPS,
} from '../../features/auth/storageKeys';
import { buildLoginUrl, isPublicPage } from '../../utils/authRedirect';
import { getDesktopToken } from '../../utils/desktopAuth';
import { isDesktopApp } from '../../utils/platform';

// Module-level flag to suppress 401 redirects during logout.
// Set by authStore.logout() to prevent redirect loops.
// Using a simple flag avoids circular dependency (authStore ↔ apiClient).
let _isLoggingOut = false;
export const setLoggingOutFlag = (value: boolean) => {
  _isLoggingOut = value;
};

// Use relative URL by default (same as AUTH_BASE_URL in useAuth.js)
// This works because frontend is served by backend on same port
const baseURL: string = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api';

// ─────────────────────────────────────────────────────────────────────
// Smart 401 handling: session probe before redirect
// ─────────────────────────────────────────────────────────────────────
//
// Before 2026-04-13 the response interceptor below redirected to the
// login page on ANY 401 from ANY route. That turned a single transient
// 401 — e.g. from the notifications background poller firing during a
// Better Auth cookie revalidation (every ~5 min) — into a full-page
// navigation, killing any in-flight user work.
//
// Production incident pattern: user generates image → clicks "sonstige"
// → notifications poller 401s during cookie revalidation → redirected
// to login → cookie was actually still valid, login redirects right
// back → user loses state.
//
// New rule: **never trust a single 401 as proof of dead session**.
// Instead, on the first 401, do a silent session probe against
// `/auth/status`. If the probe returns `isAuthenticated: true`, the
// 401 was transient — swallow it and let the caller's query retry
// mechanism do its thing. If the probe returns unauthenticated (or
// itself 401s), THEN redirect.
//
// The probe result is cached for 5 seconds so a cascade of 401s
// across multiple routes (e.g. 10 TanStack queries re-firing after
// window focus) share one probe instead of DOSing `/auth/status`.
//
// Routes tagged `skipAuthRedirect: true` still bypass the whole
// path — they explicitly opt out of any redirect behavior.

const PROBE_CACHE_TTL_MS = 5_000;

interface ProbeState {
  timestamp: number;
  isAuthenticated: boolean;
}

let probeInFlight: Promise<boolean> | null = null;
let lastProbe: ProbeState | null = null;

/**
 * Silently probe `/auth/status` to decide whether the session is
 * actually dead or whether the 401 we just saw was transient. Returns
 * `true` if the session is healthy (caller should swallow the 401),
 * `false` if the session is dead (caller should redirect).
 *
 * Coalesces concurrent probes: the first caller kicks off the fetch,
 * every other caller within the same tick awaits the same promise.
 * Caches the result for 5s to collapse 401 cascades across routes.
 */
async function isSessionStillAlive(): Promise<boolean> {
  // Return cached result if recent.
  const now = Date.now();
  if (lastProbe && now - lastProbe.timestamp < PROBE_CACHE_TTL_MS) {
    return lastProbe.isAuthenticated;
  }

  // Coalesce in-flight probes.
  if (probeInFlight) {
    return probeInFlight;
  }

  probeInFlight = (async (): Promise<boolean> => {
    try {
      // Hit Better Auth's native session endpoint directly. Going through
      // `apiClient` would re-enter the interceptor and infinite-loop;
      // `authClient.getSession()` is a peer of `apiClient` so it doesn't
      // share the interceptor chain.
      const response = await axios.get(`${baseURL}/auth/v2/get-session`, {
        withCredentials: useCredentials,
        timeout: 10_000,
      });
      const data = response.data as { user?: unknown } | null | undefined;
      const alive = data != null && data.user != null;
      lastProbe = { timestamp: Date.now(), isAuthenticated: alive };
      return alive;
    } catch {
      // Probe itself failed (usually 401 — session really is dead).
      lastProbe = { timestamp: Date.now(), isAuthenticated: false };
      return false;
    } finally {
      probeInFlight = null;
    }
  })();

  return probeInFlight;
}

/**
 * Decide whether a 401 from an arbitrary request should trigger a
 * full-page redirect to login. Returns `true` if the caller should
 * redirect, `false` if the 401 was transient and should be swallowed.
 */
async function shouldRedirectOn401(): Promise<boolean> {
  if (_isLoggingOut) return false;
  if (isPublicPage()) return false;
  if (window.location.pathname === '/login') return false;

  const alive = await isSessionStillAlive();
  return !alive;
}

// ─────────────────────────────────────────────────────────────────────
// Dead-session cache reconciliation + anti-loop circuit breaker
// ─────────────────────────────────────────────────────────────────────
//
// Background: backend-detected dead sessions used to leave the frontend's
// `localStorage['authState']` instant-auth cache claiming the user was
// authenticated. After `performLoginRedirect()` triggered a full-page
// navigation to /login, the next mount read that stale cache and `GuestRoute`
// bounced the user straight back to /workplace — where the next API call
// 401'd again. Infinite loop.
//
// Two defenses are applied here, in order:
//   1. Before redirecting, wipe the caches AND set `LOGOUT_TIMESTAMP` so
//      `isRecentlyLoggedOut()` in useAuth.ts kicks in on the next mount.
//      Mirrors what `authStore.clearAuth()` does, but without importing
//      authStore (circular dep — apiClient is imported by authStore).
//   2. Circuit breaker: if we somehow redirect 3+ times within 10 seconds
//      (any future regression that bypasses #1), force-clear ALL auth state
//      and replace the URL with a bare /login — no redirectTo, so the user
//      can't get bounced back. Counter lives in sessionStorage so it
//      survives the full-page reload that the redirect triggers.

const CIRCUIT_BREAKER_WINDOW_MS = 10_000;
const CIRCUIT_BREAKER_THRESHOLD = 3;

function readRedirectTimestamps(): number[] {
  try {
    const raw = sessionStorage.getItem(REDIRECT_TIMESTAMPS);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((n): n is number => typeof n === 'number');
  } catch {
    return [];
  }
}

function writeRedirectTimestamps(timestamps: number[]): void {
  try {
    sessionStorage.setItem(REDIRECT_TIMESTAMPS, JSON.stringify(timestamps));
  } catch {
    // Quota exceeded or sessionStorage disabled — non-fatal.
  }
}

function clearRedirectTimestamps(): void {
  try {
    sessionStorage.removeItem(REDIRECT_TIMESTAMPS);
  } catch {
    // Non-fatal.
  }
}

/**
 * Called by useAuth when `/auth/status` confirms authentication. Resets the
 * circuit-breaker counter so a future *legitimate* session expiry doesn't
 * trip the breaker because of an old loop's leftover timestamps. Without
 * this, a user who recovered from one bad day could find the breaker
 * pre-armed the next time their cookie expires.
 */
export const notifyAuthConfirmed = (): void => {
  clearRedirectTimestamps();
};

/**
 * Wipe every localStorage key that could hint at "user is authenticated"
 * plus the React Query authStatus entry. Used before any backend-driven
 * redirect to /login so the next page load can't re-seed a stale true.
 */
function wipeAllAuthCaches(): void {
  for (const key of ALL_AUTH_LOCAL_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Non-fatal — quota or storage-disabled.
    }
  }
  // Bust the React Query authStatus cache if a queryClient was pinned on
  // window (see App bootstrap). Avoids importing the QueryClient instance
  // directly, which would create a layering tangle.
  const win = window as typeof window & {
    queryClient?: { removeQueries: (opts: { queryKey: string[] }) => void };
  };
  try {
    win.queryClient?.removeQueries({ queryKey: ['authStatus'] });
  } catch {
    // Non-fatal.
  }
}

/**
 * Pre-redirect cache reconciliation for the BACKEND-DETECTED dead-session
 * path. Mirrors authStore.clearAuth() side effects without the circular
 * import. Specifically:
 *   - Removes the instant-auth cache so useInstantAuth can't synchronously
 *     re-seed isAuthenticated:true on the next mount.
 *   - Sets LOGOUT_TIMESTAMP so isRecentlyLoggedOut() returns true on the
 *     next page load — useAuth then takes its already-tested "recently
 *     logged out" branch and skips the auto-reauth machinery.
 */
function markBackendDeadSession(): void {
  try {
    localStorage.removeItem(INSTANT_AUTH_CACHE);
  } catch {
    // Non-fatal.
  }
  try {
    localStorage.setItem(LOGOUT_TIMESTAMP, Date.now().toString());
  } catch {
    // Non-fatal.
  }
}

function performLoginRedirect(): void {
  const now = Date.now();
  const recent = readRedirectTimestamps()
    .filter((ts) => now - ts < CIRCUIT_BREAKER_WINDOW_MS)
    .concat(now);
  writeRedirectTimestamps(recent);

  // Always wipe the instant-auth cache + set the cooldown marker before
  // navigating. This is the load-bearing fix: without it, the next /login
  // mount reads stale "isAuthenticated:true" from cache and bounces back.
  markBackendDeadSession();

  if (recent.length >= CIRCUIT_BREAKER_THRESHOLD) {
    // We've redirected three or more times in 10s — something downstream
    // is still treating the user as authenticated. Last-resort defense:
    // nuke EVERYTHING auth-related and land on a clean /login with no
    // redirectTo, so even if the store is still confused it can't bounce
    // the user anywhere else. Reset the counter so a future legitimate
    // redirect isn't pre-tripped.
    console.warn(
      '[apiClient] Auth-redirect circuit breaker tripped — wiping all auth state and forcing clean /login'
    );
    wipeAllAuthCaches();
    clearRedirectTimestamps();
    window.location.replace('/login');
    return;
  }

  const currentPath = window.location.pathname + window.location.search;
  window.location.href = buildLoginUrl(currentPath);
}

// Desktop app uses JWT tokens, web app uses session cookies.
// Declared early because the probe fetch needs it.
const useCredentials: boolean = !isDesktopApp();

// Initialize global API client for @gruenerator/shared hooks (useShareStore, etc.)
// This is separate from the legacy apiClient below, but uses the same baseURL.
//
// `onUnauthorized` has a subtle dual role here:
//   - Return `true` → shared client retries the original request. We return
//     true when the session probe confirms the session is still alive, so a
//     transient 401 during cookie revalidation transparently recovers.
//   - Return `false` → shared client propagates the 401 to the caller. We
//     return false when the probe says the session is dead; `performLoginRedirect`
//     has already fired, so the navigation is in flight and the rejected
//     promise just unblocks any await'ing code.
const sharedApiClient = createApiClient({
  baseURL,
  authMode: isDesktopApp() ? 'bearer' : 'cookie',
  getAuthToken: isDesktopApp() ? async () => getDesktopToken() : undefined,
  onUnauthorized: async () => {
    if (_isLoggingOut || isPublicPage() || window.location.pathname === '/login') {
      return false;
    }
    const alive = await isSessionStillAlive();
    if (alive) {
      // Session is actually healthy — tell the shared client to retry
      // the original request. The cookie just got rotated mid-flight.
      return true;
    }
    // Real dead session. Fire the redirect and let the 401 propagate.
    performLoginRedirect();
    return false;
  },
  timeout: 900000,
});
setGlobalApiClient(sharedApiClient);

// Detect browser locale and map to a supported locale for unauthenticated requests
function detectBrowserLocale(): string {
  const languages = navigator.languages || [navigator.language];
  for (const lang of languages) {
    if (lang.startsWith('de-AT')) return 'de-AT';
  }
  return 'de-DE';
}

// `useCredentials` is declared above (next to the probe helper) because
// the session probe needs it. Desktop app uses JWT tokens → false;
// web app uses session cookies → true (cookies sent automatically).

const apiClient = axios.create({
  baseURL: baseURL,
  timeout: 900000,
  headers: {
    'Content-Type': 'application/json',
    'X-User-Locale': detectBrowserLocale(),
  },
  withCredentials: useCredentials,
});

// Request interceptor for debugging and header setup
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig): Promise<InternalAxiosRequestConfig> => {
    // Desktop app uses JWT token from localStorage
    if (isDesktopApp()) {
      const token = await getDesktopToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    // Web app uses session cookies automatically with withCredentials: true
    return config;
  },
  (error: AxiosError) => {
    console.error('[apiClient Interceptor] Request Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor for error handling.
//
// Goes through `shouldRedirectOn401` which probes `/auth/status`
// silently before deciding. A single transient 401 — e.g. from a
// background poller firing during a Better Auth cookie revalidation —
// is swallowed because the probe finds the session is actually alive.
// Only when the probe itself 401s (or returns `isAuthenticated: false`)
// does the redirect fire. See the long-form explanation above the
// `shouldRedirectOn401` helper.
//
// Routes tagged `skipAuthRedirect: true` bypass the whole path.
apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError) => {
    if (error.config?.skipAuthRedirect) {
      return Promise.reject(error);
    }

    if (error.response && error.response.status === 401) {
      if (await shouldRedirectOn401()) {
        performLoginRedirect();
      }
      // Always reject so the caller's `.catch` / TanStack Query error
      // handler can surface a sensible error state. Swallowing to
      // `undefined` would hide real failures (non-auth 500s, network
      // errors) from component-level retry logic.
    }
    return Promise.reject(error);
  }
);

const MAX_RETRIES = 3;
const BASE_DELAY = 1000;

type RetryOnCallback = (retryCount: number, delay: number, error: AxiosError) => void;

async function retryWithExponentialBackoff<T>(
  operation: () => Promise<T>,
  retryCount: number = 0,
  onRetry?: RetryOnCallback
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const axiosError = error as AxiosError;
    if (
      (axiosError.response?.status === 503 ||
        axiosError.response?.status === 529 ||
        axiosError.response?.status === 429) &&
      retryCount < MAX_RETRIES
    ) {
      const delay = BASE_DELAY * Math.pow(2, retryCount);
      const jitter = Math.random() * 1000;
      const totalDelay = delay + jitter;

      if (onRetry) {
        onRetry(retryCount + 1, totalDelay, axiosError);
      }

      await new Promise((resolve) => setTimeout(resolve, totalDelay));
      return retryWithExponentialBackoff(operation, retryCount + 1, onRetry);
    }
    throw error;
  }
}

export const uploadFileAndGetText = async (endpoint: string, file: File): Promise<string> => {
  const formData = new FormData();
  formData.append('file', file);

  try {
    const uploadResponse = await apiClient.post<{ text: string }>(`${endpoint}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return uploadResponse.data.text;
  } catch (error) {
    handleApiError(error as AxiosError);
    throw error;
  }
};

interface ProcessTextFormData {
  onRetry?: RetryOnCallback;
  [key: string]: unknown;
}

export const processText = async (
  endpoint: string,
  formData: ProcessTextFormData
): Promise<unknown> => {
  try {
    const { onRetry, ...cleanFormData } = formData;

    const response = await retryWithExponentialBackoff(
      () => apiClient.post<unknown>(endpoint, cleanFormData),
      0,
      onRetry
    );

    const responseData: unknown = response.data;
    return responseData;
  } catch (error) {
    const axiosError = error as AxiosError;
    console.error('[apiClient] Error processing request:', {
      message: axiosError.message,
      name: axiosError.name,
      code: axiosError.code,
      status: axiosError.response?.status,
      responseData: axiosError.response?.data,
      requestUrl: axiosError.config?.url,
      requestMethod: axiosError.config?.method,
    });
    handleApiError(axiosError);
    throw error;
  }
};

interface ApiErrorData {
  message?: string;
  errorType?: string;
  errorId?: string;
  timestamp?: string;
  errorCode?: string;
  details?: unknown;
}

interface ApiError extends Error {
  originalError?: AxiosError;
  errorId?: string;
  timestamp?: string;
  errorCode?: string;
  details?: unknown;
  status?: number;
}

const handleApiError = (error: AxiosError): never => {
  if (error.response) {
    const { status, data, config } = error.response;

    console.error('API Server Error:', {
      status,
      data,
      url: config?.url,
      method: config?.method,
    });

    const errorData = data as ApiErrorData | null;
    if (typeof errorData === 'object' && errorData !== null && errorData.message) {
      const friendlyError: ApiError = new Error(
        errorData.message || `Serverfehler (Status ${status})`
      );
      friendlyError.name = errorData.errorType || 'ServerError';
      friendlyError.originalError = error;
      friendlyError.errorId = errorData.errorId;
      friendlyError.timestamp = errorData.timestamp;
      friendlyError.errorCode = errorData.errorCode;
      friendlyError.details = errorData.details;

      throw friendlyError;
    } else {
      const genericError: ApiError = new Error(`Anfrage fehlgeschlagen mit Status ${status}`);
      genericError.name = 'HttpError';
      genericError.status = status;
      genericError.originalError = error;
      throw genericError;
    }
  } else if (error.request) {
    console.error('Network Error / No Response:', {
      message: error.message,
      requestDetails: error.request as unknown,
    });

    const networkError: ApiError = new Error(
      'Keine Antwort vom Server erhalten. Bitte Netzwerk prüfen.'
    );
    networkError.name = 'NetworkError';
    networkError.originalError = error;
    throw networkError;
  } else {
    console.error('Request Setup Error:', {
      message: error.message,
      stack: error.stack,
    });

    const requestSetupError: ApiError = new Error(
      'Fehler beim Erstellen der Anfrage: ' + error.message
    );
    requestSetupError.name = 'RequestSetupError';
    requestSetupError.originalError = error;
    throw requestSetupError;
  }
};

export default apiClient;
