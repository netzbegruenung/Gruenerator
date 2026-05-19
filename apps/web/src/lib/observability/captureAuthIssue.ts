import * as Sentry from '@sentry/react';

export type AuthStage =
  | 'api-401-unexpected'
  | 'partial-logout'
  | 'partial-logout-check-failed'
  | 'redirect-loop'
  | 'login-flow';

interface AuthIssueOptions {
  stage: AuthStage;
  cause: unknown;
  extras?: Record<string, unknown>;
}

// Same benign-suppression list as the backend helper, kept in sync because
// the frontend sees the same noise classes (logged-out 401s, expired
// JWTs from background pollers, client-aborted requests during navigation).
const BENIGN_ERROR_NAMES = new Set(['AbortError', 'TokenExpiredError', 'JWTExpired']);

const BENIGN_MESSAGE_PATTERNS: RegExp[] = [
  /please_restart_the_process/i,
  /login code is invalid or expired/i,
  /the user aborted a request/i,
];

function isBenignAuthError(cause: unknown): boolean {
  if (cause == null || typeof cause !== 'object') return false;
  const c = cause as { code?: string; name?: string; message?: string };
  if (c.name != null && BENIGN_ERROR_NAMES.has(c.name)) return true;
  if (c.code === 'ERR_CANCELED' || c.code === 'ECONNABORTED') return true;
  if (c.message != null && BENIGN_MESSAGE_PATTERNS.some((re) => re.test(c.message!))) return true;
  return false;
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
 * Send a frontend auth failure to Sentry/GlitchTip with stage tag + symptom
 * fingerprint, mirror to `console.warn` so the local dev console still shows
 * it. Suppresses benign noise (client aborts, expired tokens, OAuth replays)
 * via {@link isBenignAuthError}.
 *
 * Mirror of `apps/api/utils/observability/captureAuthIssue.ts` — keep
 * stage names and benign-filter rules in sync so a single GlitchTip query
 * across `auth.stage` works for both transports.
 */
export function captureAuthIssue(opts: AuthIssueOptions): void {
  if (isBenignAuthError(opts.cause)) return;

  const name = errorName(opts.cause);

  Sentry.withScope((scope) => {
    scope.setTag('auth.stage', opts.stage);
    scope.setTag('auth.transport', 'web');
    scope.setFingerprint(['auth', opts.stage, name]);
    if (opts.extras) scope.setExtras(opts.extras);
    if (typeof window !== 'undefined') {
      scope.setExtra('href', window.location.href);
      scope.setExtra('pathname', window.location.pathname);
    }
    Sentry.captureException(opts.cause);
  });

  console.warn(`[auth/${opts.stage}] ${errorMessage(opts.cause)}`, opts.extras ?? '');
}
