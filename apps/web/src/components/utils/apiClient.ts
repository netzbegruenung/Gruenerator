import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { type AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import axios from 'axios';

import {
  ALL_AUTH_LOCAL_KEYS,
  INSTANT_AUTH_CACHE,
  LOGOUT_TIMESTAMP,
  REDIRECT_TIMESTAMPS,
  SESSION_EXPIRED_FLAG,
} from '../../features/auth/storageKeys';
import { captureAuthIssue } from '../../lib/observability/captureAuthIssue';
import { sessionDebug } from '../../lib/sessionDebug';
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
// Instead, on the first 401, do a silent session probe. The probe
// yields a three-way verdict:
//
//   'alive'         — probe confirmed the session: the 401 was transient
//                     (cookie rotation mid-flight). Retry the original
//                     request once instead of failing the user's action.
//   'dead'          — probe definitively saw no session (200 without a
//                     user, or the probe itself 401/403'd). Redirect.
//   'indeterminate' — probe failed for OTHER reasons (timeout, network,
//                     5xx — e.g. the backend's auth_unavailable 503 while
//                     Redis is down). This says NOTHING about the session;
//                     treating it as dead used to log users out during
//                     pure infra hiccups. Neither retry nor redirect —
//                     propagate the error to the caller's handling.
//
// The probe result is cached for 5 seconds so a cascade of 401s
// across multiple routes (e.g. 10 TanStack queries re-firing after
// window focus) share one probe instead of DOSing the endpoint.
//
// Routes tagged `skipAuthRedirect: true` still bypass the whole
// path — they explicitly opt out of any redirect behavior.

const PROBE_CACHE_TTL_MS = 5_000;

type ProbeVerdict = 'alive' | 'dead' | 'indeterminate';

interface ProbeState {
  timestamp: number;
  verdict: ProbeVerdict;
}

let probeInFlight: Promise<ProbeVerdict> | null = null;
let lastProbe: ProbeState | null = null;

/**
 * Silently probe Better Auth's session endpoint to classify the 401 we
 * just saw. Coalesces concurrent probes: the first caller kicks off the
 * fetch, every other caller within the same tick awaits the same promise.
 * Caches the verdict for 5s to collapse 401 cascades across routes.
 */
async function probeSessionVerdict(): Promise<ProbeVerdict> {
  // Return cached result if recent.
  const now = Date.now();
  if (lastProbe && now - lastProbe.timestamp < PROBE_CACHE_TTL_MS) {
    sessionDebug('probe.start', {
      cached: true,
      cachedVerdict: lastProbe.verdict,
      cachedAgeMs: now - lastProbe.timestamp,
    });
    return lastProbe.verdict;
  }

  // Coalesce in-flight probes.
  if (probeInFlight) {
    sessionDebug('probe.start', { cached: false, coalesced: true });
    return probeInFlight;
  }

  sessionDebug('probe.start', { cached: false, coalesced: false });

  probeInFlight = (async (): Promise<ProbeVerdict> => {
    const startedAt = Date.now();
    let verdict: ProbeVerdict;
    let httpStatus: number | undefined;
    let hasUserInBody = false;
    try {
      // Hit Better Auth's native session endpoint directly. Going through
      // `apiClient` would re-enter the interceptor and infinite-loop;
      // this raw axios call is a peer of `apiClient` so it doesn't
      // share the interceptor chain.
      //
      // `disableCookieCache=true` forces a real store lookup: without it,
      // Better Auth answers from the ≤60s signed `ba.session_data` snapshot,
      // so a freshly-dead session reads as 'alive' and this whole machinery
      // retry-loops instead of tearing down — the core of the half-logged-in
      // bug. The probe is rare (5s cache + coalescing), so the extra Redis/PG
      // read is negligible.
      const headers: Record<string, string> = {};
      if (isDesktopApp()) {
        // Desktop is bearer-mode (no cookie); without the token the probe
        // always sees a null session and every 401 reads as 'dead'.
        const token = await getDesktopToken();
        if (token) headers.Authorization = `Bearer ${token}`;
      }
      const response = await axios.get(`${baseURL}/auth/v2/get-session`, {
        params: { disableCookieCache: 'true' },
        withCredentials: useCredentials,
        headers,
        timeout: 10_000,
      });
      httpStatus = response.status;
      const data = response.data as { user?: unknown } | null | undefined;
      hasUserInBody = data != null && data.user != null;
      verdict = hasUserInBody ? 'alive' : 'dead';
    } catch (probeError) {
      // Only a definitive 401/403 from the probe proves the session is
      // dead. Anything else (timeout, network error, 5xx) is an infra
      // signal, not a session signal.
      httpStatus = (probeError as AxiosError).response?.status;
      verdict = httpStatus === 401 || httpStatus === 403 ? 'dead' : 'indeterminate';
    } finally {
      probeInFlight = null;
    }
    lastProbe = { timestamp: Date.now(), verdict };
    sessionDebug('probe.verdict', {
      verdict,
      httpStatus,
      hasUserInBody,
      durationMs: Date.now() - startedAt,
    });
    return verdict;
  })();

  return probeInFlight;
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
  sessionDebug('cache.clear', { source: 'wipeAllAuthCaches' });
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
  sessionDebug('cache.clear', { source: 'markBackendDeadSession' });
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

function performLoginRedirect(source: string): void {
  const now = Date.now();
  const recent = readRedirectTimestamps()
    .filter((ts) => now - ts < CIRCUIT_BREAKER_WINDOW_MS)
    .concat(now);
  writeRedirectTimestamps(recent);

  const breakerTripped = recent.length >= CIRCUIT_BREAKER_THRESHOLD;
  sessionDebug('teardown.redirect', {
    source,
    redirectCount: recent.length,
    breakerTripped,
  });
  // A session teardown is NEVER benign — this fires on every dead-session
  // redirect, not just circuit-breaker trips, closing the telemetry blind
  // spot where ordinary half-logged-in deaths went unreported. The attached
  // sessionDebug ring buffer carries the full lead-up.
  captureAuthIssue({
    stage: 'session-teardown',
    cause: new Error(`session teardown via ${source}`),
    extras: { source, redirectCount: recent.length, breakerTripped },
  });

  // Tell the login page WHY the user landed there. sessionStorage so it
  // survives the full-page navigation but stays scoped to this tab; the
  // login page reads-and-removes it to show a "Sitzung abgelaufen" banner
  // instead of silently dropping the user on a bare login screen.
  try {
    sessionStorage.setItem(SESSION_EXPIRED_FLAG, '1');
  } catch {
    // Non-fatal.
  }

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
    sessionDebug('breaker.tripped', {
      redirectCount: recent.length,
      windowMs: CIRCUIT_BREAKER_WINDOW_MS,
    });
    captureAuthIssue({
      stage: 'redirect-loop',
      cause: new Error(
        `Auth-redirect circuit breaker tripped: ${recent.length} redirects in ${CIRCUIT_BREAKER_WINDOW_MS}ms`
      ),
      extras: { redirectCount: recent.length, windowMs: CIRCUIT_BREAKER_WINDOW_MS },
    });
    wipeAllAuthCaches();
    clearRedirectTimestamps();
    window.location.replace('/login');
    return;
  }

  const currentPath = window.location.pathname + window.location.search;
  window.location.href = buildLoginUrl(currentPath);
}

// Page-scoped latch: once ONE stack has decided the session is dead and fired
// the redirect, every other stack's concurrent dead-verdict is a no-op. Without
// it, a single session death fires 401s from thread-list + docs + notifications
// + avatar near-simultaneously; each would call performLoginRedirect, pushing
// 3+ timestamps into the breaker window and falsely tripping the circuit breaker
// on every ordinary expiry. The latch collapses the intra-pageload burst to one
// redirect; the sessionStorage breaker still catches genuine cross-pageload loops.
// Never reset — the redirect is a full-page navigation.
let redirectInFlight = false;

export type UnauthorizedOutcome = 'retry' | 'logout' | 'stay';

/**
 * The single authority every client stack routes a 401 through. Probes the
 * session and returns the caller's action:
 *   - 'retry'  — probe says the session is alive (cookie rotated mid-flight);
 *                the caller should replay the request once.
 *   - 'logout' — probe says dead; an atomic teardown+redirect has been fired
 *                (once, via the latch). The caller should stop.
 *   - 'stay'   — logging out already, on a public/login page, or the probe was
 *                indeterminate (infra blip). Never log out on this — the caller
 *                should surface the error without redirecting.
 */
export async function handleUnauthorized(source: string): Promise<UnauthorizedOutcome> {
  if (_isLoggingOut) return 'stay';
  const verdict = await probeSessionVerdict();
  if (verdict === 'alive') return 'retry';
  if (verdict === 'dead') {
    if (isPublicPage() || window.location.pathname === '/login') return 'stay';
    if (!redirectInFlight) {
      redirectInFlight = true;
      performLoginRedirect(source);
    }
    return 'logout';
  }
  // indeterminate → infra blip, never a logout signal.
  return 'stay';
}

// Desktop app uses JWT tokens, web app uses session cookies.
// Declared early because the probe fetch needs it.
const useCredentials: boolean = !isDesktopApp();

// Initialize global API client for @gruenerator/shared hooks (useShareStore, etc.)
// This is separate from the legacy apiClient below, but uses the same baseURL.
//
// `onUnauthorized` routes through the shared `handleUnauthorized` authority:
//   - 'retry'  → return true, shared client replays the request (probe said the
//                session is alive; the cookie just rotated mid-flight).
//   - 'logout' → return false; the atomic teardown+redirect already fired (once,
//                via the latch), so the rejected promise just unblocks awaiters.
//   - 'stay'   → return false WITHOUT redirect (logging out, public page, or an
//                infra-blip indeterminate verdict), so an outage never logs out.
const sharedApiClient = createApiClient({
  baseURL,
  authMode: isDesktopApp() ? 'bearer' : 'cookie',
  getAuthToken: isDesktopApp() ? async () => getDesktopToken() : undefined,
  onUnauthorized: async (info) => {
    sessionDebug('http.401', {
      stack: 'shared',
      endpoint: info?.url,
      method: info?.method,
      status: info?.status,
      requestId: info?.requestId,
      code: info?.code,
    });
    const outcome = await handleUnauthorized('shared-401');
    if (outcome === 'retry') {
      sessionDebug('retry.after-probe', { stack: 'shared', endpoint: info?.url });
      return true;
    }
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
// On a 401, `handleUnauthorized` (the shared authority) probes and returns:
//   'retry'  → the 401 was transient (cookie rotation mid-flight). Re-fire the
//              original request ONCE. Without this, the swallowed 401 reached
//              the caller, `toastApiError` skipped it (401s never toast), and
//              the user's click simply did nothing — especially for mutations,
//              which TanStack Query never retries. Safe to replay: a 401 means
//              `requireAuth` rejected before the handler ran, so no server-side
//              side effect happened; the re-dispatch re-runs the request
//              interceptor (fresh desktop token).
//   'logout' → the atomic teardown+redirect already fired (once, via the latch).
//   'stay'   → infra-blip indeterminate / public page: propagate to the caller.
//
// Routes tagged `skipAuthRedirect: true` bypass the whole path.
apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError) => {
    const config = error.config;
    if (config?.skipAuthRedirect) {
      return Promise.reject(error);
    }

    if (error.response && error.response.status === 401 && !_isLoggingOut) {
      const errorBody = error.response.data as { code?: string; requestId?: string } | undefined;
      sessionDebug('http.401', {
        stack: 'legacy-axios',
        endpoint: config?.url,
        method: config?.method,
        status: 401,
        code: errorBody?.code,
        requestId: errorBody?.requestId ?? error.response.headers?.['x-request-id'],
      });
      const outcome = await handleUnauthorized('legacy-axios-401');
      if (outcome === 'retry' && config && !config._retried401) {
        config._retried401 = true;
        sessionDebug('retry.after-probe', { stack: 'legacy-axios', endpoint: config.url });
        const retryResult = await apiClient.request(config);
        sessionDebug('retry.result', {
          stack: 'legacy-axios',
          endpoint: config.url,
          status: retryResult.status,
        });
        return retryResult;
      }
      // 'logout' → teardown+redirect already fired (latched); 'stay' → infra
      // blip / public page, no redirect. Both fall through to reject so the
      // caller's `.catch` / TanStack Query error handler surfaces a sensible
      // error state. Swallowing to `undefined` would hide real failures.
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
      // Without `.status` this error is opaque to every status-based consumer:
      // `getErrorMessage` falls through to the generic "Unerwarteter Fehler"
      // toast and `toastApiError`'s 401/404 skip never matches.
      friendlyError.status = status;
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
