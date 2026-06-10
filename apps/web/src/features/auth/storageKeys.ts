/**
 * Central registry of all storage keys touched by the auth flow.
 *
 * Auth state touches multiple storage layers (useAuth instant-cache,
 * logout/login intent timestamps, redirect counter).
 * Spreading the literal key strings across files invites typo divergence —
 * one file removes `authState`, another reads `authstate`, neither errors.
 * Anything that reads or writes these keys must import from here.
 */

// useInstantAuth synchronous-seed cache (just isAuthenticated + minimal user). 5min TTL.
// This is the single persisted auth cache — React Query seeds `initialData` from it.
export const INSTANT_AUTH_CACHE = 'authState';

// Cooldown markers — gates `useAuth` from auto-re-authing right after a logout/dead session.
export const LOGOUT_TIMESTAMP = 'gruenerator_logout_timestamp';
export const LOGIN_INTENT = 'gruenerator_login_intent';

// First-visit cleanup marker (session-scoped).
export const SESSION_ACTIVE = 'gruenerator_session_active';

// Anti-loop circuit breaker — sessionStorage so it survives the full-page
// reload that `performLoginRedirect` triggers but resets when the tab closes.
export const REDIRECT_TIMESTAMPS = 'gruenerator_redirect_timestamps';

// Set by `performLoginRedirect` right before navigating to /login; the login
// page reads-and-removes it to show a "Sitzung abgelaufen" banner so the user
// knows WHY they landed there. sessionStorage (per-tab, survives the redirect's
// full-page navigation) and intentionally NOT in ALL_AUTH_LOCAL_KEYS — it must
// outlive the auth-cache wipe that precedes the redirect.
export const SESSION_EXPIRED_FLAG = 'gruenerator_session_expired';

/**
 * All localStorage keys that hold any form of "user is authenticated" hint.
 * Use this when nuking auth state in defensive paths (circuit breaker, dead
 * session detection): iterate and remove rather than risking a typo.
 *
 * The two `gruenerator_auth_state*` entries are LEGACY — the Zustand-persisted
 * snapshot was removed (auth state now lives solely in React Query's
 * instant-auth cache). They are kept here as literals only so the defensive
 * wipe still purges stale copies left in returning users' browsers; no live
 * code reads or writes them.
 */
export const ALL_AUTH_LOCAL_KEYS = [
  'gruenerator_auth_state',
  'gruenerator_auth_cache_version',
  INSTANT_AUTH_CACHE,
  LOGOUT_TIMESTAMP,
  LOGIN_INTENT,
] as const;
