import * as Sentry from '@sentry/node';
import { type Request } from 'express';

import { createLogger } from '../logger.js';

const log = createLogger('captureAuthIssue');

export type AuthStage =
  | 'session-resolve'
  | 'logout'
  | 'oauth-init'
  | 'oauth-callback'
  | 'oauth-no-session'
  | 'token-exchange'
  | 'auth-error-route'
  | 'better-auth';

interface AuthIssueOptions {
  stage: AuthStage;
  cause: unknown;
  req?: Request;
  extras?: Record<string, unknown>;
}

// Benign auth failures we deliberately do NOT page on:
//   - SESSION_NOT_FOUND / NO_SESSION: the request had no cookie or it expired.
//     This is the steady-state logged-out flow, not an incident.
//   - INVALID_STATE / STATE_NOT_FOUND: OAuth callback replay (back-button,
//     link-preview prefetch, 10-min TTL elapsed). Better Auth already
//     redirects the user to `?error=please_restart_the_process`.
//   - TokenExpiredError: JWT expiry; the user is expected to refresh.
//   - AbortError / ECONNRESET / ECONNABORTED: client disconnected mid-flight.
const BENIGN_ERROR_CODES = new Set([
  'SESSION_NOT_FOUND',
  'NO_SESSION',
  'INVALID_STATE',
  'STATE_NOT_FOUND',
  'ECONNRESET',
  'ECONNABORTED',
]);

const BENIGN_ERROR_NAMES = new Set(['AbortError', 'TokenExpiredError', 'JWTExpired']);

const BENIGN_MESSAGE_PATTERNS: RegExp[] = [
  /please_restart_the_process/i,
  /login code is invalid or expired/i,
];

function isBenignAuthError(cause: unknown): boolean {
  if (cause == null || typeof cause !== 'object') return false;
  const c = cause as { code?: string; name?: string; message?: string };
  if (c.code != null && BENIGN_ERROR_CODES.has(c.code)) return true;
  if (c.name != null && BENIGN_ERROR_NAMES.has(c.name)) return true;
  if (c.message != null && BENIGN_MESSAGE_PATTERNS.some((re) => re.test(c.message!))) return true;
  return false;
}

function resolveTransport(req: Request | undefined): 'web' | 'mobile' | 'api' {
  if (!req) return 'api';
  const platform = req.headers['x-app-platform'];
  if (typeof platform === 'string') {
    const p = platform.toLowerCase();
    if (p === 'mobile' || p === 'ios' || p === 'android' || p === 'expo') return 'mobile';
    if (p === 'web') return 'web';
  }
  const ua = req.headers['user-agent'];
  if (typeof ua === 'string' && /grueneratorApp\/|Expo\//i.test(ua)) return 'mobile';
  return 'web';
}

function errorName(cause: unknown): string {
  if (cause instanceof Error) return cause.name || 'Error';
  if (cause != null && typeof cause === 'object') {
    const c = cause as { name?: string; code?: string };
    return c.name ?? c.code ?? 'unknown';
  }
  return 'unknown';
}

function errorMessage(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  if (typeof cause === 'string') return cause;
  if (cause != null && typeof cause === 'object') {
    const c = cause as { message?: string };
    if (typeof c.message === 'string') return c.message;
  }
  return 'unknown error';
}

/**
 * Send an auth failure to Sentry/GlitchTip with stage tag + symptom-based
 * fingerprint, and mirror to Winston so logs and Sentry correlate.
 *
 * Suppresses benign noise (expected logged-out 401s, OAuth state replays,
 * expired JWTs, client disconnects) via {@link isBenignAuthError}.
 *
 * Tag keys are namespaced under `auth.*` so a single Sentry filter
 * (`auth.stage = oauth-callback`) is enough to scope a query.
 */
const SENTINEL_KEY = '__grueneratorAuthSentryCaptured';

interface CapturedMarker {
  [SENTINEL_KEY]?: boolean;
}

export function isAlreadyCaptured(cause: unknown): boolean {
  return (
    cause != null && typeof cause === 'object' && (cause as CapturedMarker)[SENTINEL_KEY] === true
  );
}

export function captureAuthIssue(opts: AuthIssueOptions): void {
  if (isAlreadyCaptured(opts.cause)) return;
  if (isBenignAuthError(opts.cause)) {
    log.debug('[auth/%s] benign error suppressed: %s', opts.stage, errorMessage(opts.cause));
    return;
  }

  const transport = resolveTransport(opts.req);
  const name = errorName(opts.cause);

  Sentry.withScope((scope) => {
    scope.setTag('auth.stage', opts.stage);
    scope.setTag('auth.transport', transport);
    scope.setFingerprint(['auth', opts.stage, name]);
    if (opts.extras) scope.setExtras(opts.extras);
    if (opts.req?.originalUrl) scope.setExtra('originalUrl', opts.req.originalUrl);
    Sentry.captureException(opts.cause);
  });

  // Mark so that a downstream `onAPIError` hook or error middleware doesn't
  // re-capture the same error with a coarser stage tag. Works for any
  // object-shaped throw (Error instances, plain objects); primitives just
  // skip the marking and may be re-captured (harmless edge case).
  if (opts.cause != null && typeof opts.cause === 'object') {
    (opts.cause as CapturedMarker)[SENTINEL_KEY] = true;
  }

  log.error(`[auth/${opts.stage}] ${errorMessage(opts.cause)}`, opts.extras);
}
