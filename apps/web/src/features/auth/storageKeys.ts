/**
 * Central registry of all storage keys touched by the auth flow.
 *
 * Auth state is duplicated across multiple storage layers (Zustand persist,
 * useAuth instant-cache, logout/login intent timestamps, redirect counter).
 * Spreading the literal key strings across files invites typo divergence —
 * one file removes `authState`, another reads `authstate`, neither errors.
 * Anything that reads or writes these keys must import from here.
 */

// Zustand-persisted full auth snapshot (user + flags). 15min TTL.
export const PERSISTED_AUTH_STATE = 'gruenerator_auth_state';
export const PERSISTED_AUTH_VERSION = 'gruenerator_auth_cache_version';

// useInstantAuth synchronous-seed cache (just isAuthenticated + minimal user). 5min TTL.
export const INSTANT_AUTH_CACHE = 'authState';

// Cooldown markers — gates `useAuth` from auto-re-authing right after a logout/dead session.
export const LOGOUT_TIMESTAMP = 'gruenerator_logout_timestamp';
export const LOGIN_INTENT = 'gruenerator_login_intent';

// First-visit cleanup marker (session-scoped).
export const SESSION_ACTIVE = 'gruenerator_session_active';

// Anti-loop circuit breaker — sessionStorage so it survives the full-page
// reload that `performLoginRedirect` triggers but resets when the tab closes.
export const REDIRECT_TIMESTAMPS = 'gruenerator_redirect_timestamps';

/**
 * All localStorage keys that hold any form of "user is authenticated" hint.
 * Use this when nuking auth state in defensive paths (circuit breaker, dead
 * session detection): iterate and remove rather than risking a typo.
 */
export const ALL_AUTH_LOCAL_KEYS = [
  PERSISTED_AUTH_STATE,
  PERSISTED_AUTH_VERSION,
  INSTANT_AUTH_CACHE,
  LOGOUT_TIMESTAMP,
  LOGIN_INTENT,
] as const;
