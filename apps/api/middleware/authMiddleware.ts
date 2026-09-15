/**
 * Authentication Middleware
 * Uses Better Auth sessions (cookie or bearer token)
 */

import { randomUUID } from 'node:crypto';

import { userProfileSchema, type UserProfile } from '@gruenerator/contracts';
import { fromNodeHeaders } from 'better-auth/node';
import { eq } from 'drizzle-orm';
import { type Request, type Response, type NextFunction } from 'express';

import { auth, SESSION_COOKIE_PREFIX, type BetterAuthUser } from '../config/betterAuth.js';
import { env } from '../config/env.js';
import { ba_sessions } from '../database/schema/auth.js';
import { getDrizzleInstance } from '../database/services/DrizzleService.js';
import { getUserLocale, LOCALE_UNSET } from '../services/localization/localeCache.js';
import { isAdminByEmail } from '../utils/adminEmails.js';
import { BRAND } from '../utils/domainUtils.js';
import { createLogger } from '../utils/logger.js';
import { captureAuthIssue } from '../utils/observability/captureAuthIssue.js';
import { UserId, type UserId as UserIdBrand } from '../utils/types/branded.js';

import { type AuthenticatedRequest } from './types.js';

const log = createLogger('authMiddleware');

const DEV_BYPASS_USER: Express.User = {
  id: '00000000-0000-4000-a000-000000000001',
  email: BRAND.devEmail,
  display_name: 'Development User',
  avatar_robot_id: 1,
  beta_features: {},
  user_defaults: {},
  default_startpage: 'chat',
  feedback_button: 'text',
  reduce_motion: false,
  reduce_transparency: false,
  show_skip_link: true,
  // Wie im clientseitigen Bypass ein fester Zeitstempel: der Dev-Bypass-Nutzer
  // hat keine Profilzeile, ein Widerruf oder eine Einwilligung ginge also ins
  // Leere — mit `null` säße jeder lokale Lauf hinter dem Dialog fest.
  ai_consent_at: '2026-01-01T00:00:00.000Z',
  groups_enabled: false,
  custom_generators: false,
  database_access: false,
  collab: false,
  notebook: false,
  sharepic: false,
  anweisungen: false,
  labor_enabled: false,
  sites_enabled: false,
  chat: false,
  interactive_antrag_enabled: false,
  vorlagen: false,
  video_editor: false,
  created_at: new Date(),
  updated_at: new Date(),
};

/**
 * **This is the sole null-strip boundary for `UserProfile` fields.**
 *
 * The `profiles` table has many nullable columns at the DB level (email,
 * keycloak_id, chat_color, etc.). Better Auth's session.user object
 * reflects that by typing those fields as `T | null | undefined`. The
 * canonical `UserProfile` type in `@gruenerator/contracts` models the
 * POST-null-strip shape: every field is `T | undefined` (absent or
 * present, never `null`). That keeps every consumer downstream from
 * having to handle three distinct "no value" states.
 *
 * **Invariant**: if you introduce a new parse site for `userProfileSchema`,
 * you MUST null-strip the input first (copy the pattern below), or a
 * single NULL row in `profiles` will throw ZodError and cause a silent
 * auth failure. Better Auth re-validates its cookie cache every ~5 min,
 * so the failure manifests as a session-rotation loop, not a login-time
 * error — make sure to null-strip at every new boundary.
 *
 * Two storage quirks this function smooths over before parsing:
 *  1. Null-strip: Better Auth columns typed as `T | null`. We coerce
 *     each null to undefined so Zod's `.default()` values fire where
 *     applicable and optional fields resolve to `undefined`.
 *  2. Field rename: Better Auth's base fields are `name` / `createdAt` /
 *     `updatedAt` while the canonical schema uses `display_name` /
 *     `created_at` / `updated_at`. We rename at the boundary.
 *
 * Any residual type mismatch (e.g. Better Auth returning a string where
 * the schema expects a number) throws ZodError at parse time instead of
 * cascading as `undefined` through the render tree.
 */
export function toBetterAuthUser(user: BetterAuthUser): UserProfile {
  const nullStripped = Object.fromEntries(
    Object.entries(user).map(([k, v]) => [k, v === null ? undefined : v])
  );
  const parsed = userProfileSchema.parse({
    ...nullStripped,
    display_name: user.name,
    created_at: user.createdAt,
    updated_at: user.updatedAt,
  });
  // Runtime admin elevation via ADMIN_EMAILS env allow-list. Bypasses the
  // profiles.is_admin DB flag without writing to it — the env config is the
  // source of truth for who's currently admin.
  if (isAdminByEmail(parsed.email)) {
    parsed.is_admin = true;
  }
  return parsed;
}

/**
 * Classification of a session-resolution attempt. Replaces the old
 * `Express.User | null | typeof AUTH_UNAVAILABLE` return so the null case
 * carries WHY it was null — the single most useful signal for diagnosing the
 * "half logged in" bug:
 *   - `no_cookie`         — no `ba.session_token` cookie / bearer at all. The
 *                           steady-state logged-out path (debug-level noise).
 *   - `session_not_found` — a session token WAS presented but getSession
 *                           returned nothing → expired / revoked / row gone.
 *                           The smoking-gun case (warn-level).
 */
export type ResolveResult =
  | { kind: 'user'; user: Express.User }
  | {
      kind: 'none';
      reason: 'no_cookie' | 'session_not_found';
      tokenPrefix?: string | undefined;
      sessionDataPresent: boolean;
    }
  | { kind: 'unavailable' };

/**
 * Cookie-based session-token classification, robust to the `__Secure-` prefix
 * production adds (the secure name contains the base name as a substring).
 * Returns the 8-char token prefix — the SAME 8 chars the `session-created`
 * hook logs — so a single `grep token=<8>` reconstructs a session's lifecycle.
 *
 * Matches on this instance's SESSION_COOKIE_PREFIX, not on a literal `ba`:
 * a browser holding sessions for prod AND beta sends the parent-domain cookie
 * to beta too, and reporting THAT token while Better Auth reads its own makes
 * the diagnostics blame a "live" session that was never consulted.
 */
function classifySessionCookies(cookieHeader: string | undefined): {
  token?: string | undefined;
  hasSessionToken: boolean;
  tokenPrefix?: string | undefined;
  sessionDataPresent: boolean;
} {
  if (!cookieHeader) return { hasSessionToken: false, sessionDataPresent: false };
  const pairs = cookieHeader.split(';').map((c) => c.trim());
  let token: string | undefined;
  let tokenPrefix: string | undefined;
  let hasSessionToken = false;
  let sessionDataPresent = false;
  for (const pair of pairs) {
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    const name = pair.slice(0, eq);
    const value = pair.slice(eq + 1);
    if (name.includes(`${SESSION_COOKIE_PREFIX}.session_token`)) {
      hasSessionToken = true;
      try {
        // Cookie value is `<token>.<signature>`; the DB column stores the
        // bare token.
        token = decodeURIComponent(value).split('.')[0];
        tokenPrefix = token?.slice(0, 8);
      } catch {
        // Malformed cookie value — leave token/prefix undefined.
      }
    } else if (name.includes(`${SESSION_COOKIE_PREFIX}.session_data`)) {
      sessionDataPresent = true;
    }
  }
  return { token, hasSessionToken, tokenPrefix, sessionDataPresent };
}

/**
 * `getSession()` returning null while a token cookie is present has three very
 * different causes that the Better Auth API collapses into one nullish answer:
 *
 *   - `absent`  — the row is gone: signed out, revoked, or purged by the
 *                 expired-on-read cleanup. Ordinary, expected.
 *   - `expired` — the row is still there but `expires_at` has passed. Also
 *                 ordinary (30d `expiresIn`, 24h rolling `updateAge`).
 *   - `live`    — the row exists AND is unexpired, yet resolution failed
 *                 anyway. That is never ordinary: it means the cookie
 *                 signature did not verify (`BETTER_AUTH_SECRET` drift or a
 *                 secret mismatch across replicas) or the `ba:<token>` value
 *                 in Redis is corrupt — Better Auth's `findSession` returns
 *                 null on a JSON parse failure WITHOUT falling back to
 *                 Postgres. Both log a healthy user out mid-session.
 *
 * Without this the frontend's teardown telemetry only ever shows the symptom
 * ("probe says no user"), which is identical in all three cases.
 */
type SessionRowState = 'absent' | 'expired' | 'live' | 'unknown';

async function classifySessionRow(token: string): Promise<SessionRowState> {
  try {
    const db = getDrizzleInstance();
    const rows = await db
      .select({ expires_at: ba_sessions.expires_at })
      .from(ba_sessions)
      .where(eq(ba_sessions.token, token))
      .limit(1);
    const row = rows[0];
    if (!row) return 'absent';
    return row.expires_at.getTime() <= Date.now() ? 'expired' : 'live';
  } catch (err) {
    log.debug('[Session] row-classify failed: %s', (err as Error).message);
    return 'unknown';
  }
}

// Debounce the `[Session] resolve-null-with-token` warn line PER TOKEN PREFIX
// (not per route): one dying browser firing 10 parallel queries collapses to
// one line/30s, but two DIFFERENT dying sessions both stay visible (a per-route
// debounce would hide the second user entirely).
const RESOLVE_NULL_DEBOUNCE_MS = 30_000;
const lastResolveNullLogAt = new Map<string, number>();

function maybeLogResolveNull(
  tokenPrefix: string,
  token: string | undefined,
  path: string,
  sessionDataPresent: boolean
): void {
  const now = Date.now();
  const last = lastResolveNullLogAt.get(tokenPrefix) ?? 0;
  if (now - last < RESOLVE_NULL_DEBOUNCE_MS) return;
  lastResolveNullLogAt.set(tokenPrefix, now);
  const cutoff = now - RESOLVE_NULL_DEBOUNCE_MS * 2;
  for (const [k, t] of lastResolveNullLogAt) {
    if (t < cutoff) lastResolveNullLogAt.delete(k);
  }

  // The row lookup rides the same debounce as the log line, so one browser
  // firing ten parallel queries at a dead session costs one indexed SELECT
  // per 30s — not one per request.
  //
  // Diagnostics must never take the process down: this is fire-and-forget in a
  // hot auth path, and `apps/api` installs no global `unhandledRejection`
  // handler, so an unexpected throw from the logger or the Sentry SDK would
  // kill the whole cluster worker instead of just losing one log line.
  void (async () => {
    try {
      const rowState = token != null ? await classifySessionRow(token) : 'unknown';
      // The smoking gun: a session token was presented but resolved to null.
      // `db=` says which of the three causes it was (see SessionRowState);
      // `session_data_cookie=present` flags the cookie-cache-divergence window.
      log.warn(
        '[Session] resolve-null-with-token token=%s path=%s session_data_cookie=%s db=%s',
        tokenPrefix,
        path,
        sessionDataPresent ? 'present' : 'absent',
        rowState
      );
      if (rowState === 'live') {
        // A live, unexpired row that will not resolve is a real defect, not a
        // logged-out user — surface it instead of letting it hide inside the
        // frontend's session-teardown noise.
        captureAuthIssue({
          stage: 'session-resolve',
          cause: new Error('session row is live but getSession() returned null'),
          extras: { tokenPrefix, path, sessionDataPresent, rowState },
        });
      }
    } catch {
      // Nothing to report to — reporting is what just failed.
    }
  })();
}

/**
 * Returned by `tryResolveUser` (via {@link ResolveResult} kind `'unavailable'`)
 * when the auth backend (Postgres/Redis) failed while resolving the session —
 * as opposed to a genuine "no valid session". The distinction matters: an infra
 * hiccup must surface as 503, not 401, or the frontend treats a logged-in user
 * as logged out and forces a re-login (observed in production as sporadic
 * forced logouts).
 */
async function tryResolveUser(req: Request): Promise<ResolveResult> {
  if (
    env.NODE_ENV === 'development' &&
    env.ALLOW_DEV_AUTH_BYPASS &&
    env.DEV_AUTH_BYPASS_TOKEN != null
  ) {
    const bypassToken = req.headers['x-dev-auth-bypass'] || req.query.dev_auth_token;
    if (bypassToken && bypassToken === env.DEV_AUTH_BYPASS_TOKEN) {
      return { kind: 'user', user: DEV_BYPASS_USER };
    }
  }

  const cookies = classifySessionCookies(req.headers.cookie);
  // A bearer token (mobile/desktop) counts as a presented credential too.
  const hasCredential = cookies.hasSessionToken || req.headers.authorization != null;

  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (session?.user) {
      log.debug(
        '[Session] resolved user_id=%s email=%s url=%s',
        session.user.id,
        session.user.email,
        req.originalUrl
      );
      const user = toBetterAuthUser(session.user);
      // `session.user.locale` comes from Better Auth's 300s cookie cache and can
      // lag the DB. Overlay with the DB-backed, short-TTL cached value so every
      // downstream reader gets the current locale. Best-effort: keep the session
      // value if the lookup fails.
      // LOCALE_UNSET heißt: das Profil trägt kein Land. Dann muss auch das Feld
      // leer bleiben — ein Session-Schnappschuss aus der Zeit vor dem Reset
      // würde sonst weiter 'de-DE' behaupten, und das Nachfrage-Gate im Web
      // sähe nie einen Grund zu erscheinen.
      const freshLocale = await getUserLocale(user.id);
      if (freshLocale === LOCALE_UNSET) delete user.locale;
      else if (freshLocale) user.locale = freshLocale;
      return { kind: 'user', user };
    }
    const path = req.originalUrl.split('?')[0] ?? req.originalUrl;
    if (hasCredential) {
      // Credential presented but no session resolved → expired / revoked.
      if (cookies.tokenPrefix) {
        maybeLogResolveNull(cookies.tokenPrefix, cookies.token, path, cookies.sessionDataPresent);
      } else {
        // Bearer-only (mobile/desktop): no cookie token prefix to key on.
        log.warn('[Session] resolve-null-with-token token=bearer path=%s', path);
      }
      return {
        kind: 'none',
        reason: 'session_not_found',
        tokenPrefix: cookies.tokenPrefix,
        sessionDataPresent: cookies.sessionDataPresent,
      };
    }
    // No credential at all — the common logged-out path; debug to avoid noise.
    log.debug('[Session] resolve-null reason=no_cookie path=%s', path);
    return { kind: 'none', reason: 'no_cookie', sessionDataPresent: cookies.sessionDataPresent };
  } catch (err) {
    // Silent-catch boundary: this never reaches Express's error middleware,
    // so Sentry's `setupExpressErrorHandler` would never see it. Capture
    // explicitly to surface session-resolution failures (DB errors, Redis
    // outages, malformed cookies) that would otherwise be invisible.
    captureAuthIssue({ stage: 'session-resolve', cause: err, req });
    return { kind: 'unavailable' };
  }
}

// Per-route debounce for the [Auth] 401 log line. When a tab is left open
// after logout, background pollers (notifications, presence, etc.) flood
// the api with requests that all 401, producing dozens of identical log
// lines per minute per route. We emit at most one log per route per minute
// while still returning 401 for every request.
//
// Memory bound: in practice ~50-200 distinct routes ever reach this code,
// so the Map stays under ~20KB. Entries are pruned lazily on each log call
// to prevent unbounded growth in pathological cases.
const LOG_401_DEBOUNCE_MS = 60_000;
const last401LogAt = new Map<string, number>();

function maybeLog401Once(
  method: string,
  originalUrl: string,
  reason: string,
  requestId: string,
  tokenPrefix?: string
): void {
  // Strip query string so `?foo=1` and `?foo=2` debounce together.
  const path = originalUrl.split('?')[0] ?? originalUrl;
  const key = `${method} ${path}`;
  const now = Date.now();
  const last = last401LogAt.get(key) ?? 0;
  if (now - last < LOG_401_DEBOUNCE_MS) return;

  last401LogAt.set(key, now);
  log.warn(
    '[Session] 401 %s %s reason=%s token=%s req=%s',
    method,
    path,
    reason,
    tokenPrefix ?? '-',
    requestId
  );

  // Lazy prune: drop entries older than 2× the debounce window so the Map
  // can't grow unbounded if a long-running process sees a wide variety of
  // 401-ing routes over time.
  const cutoff = now - LOG_401_DEBOUNCE_MS * 2;
  for (const [k, t] of last401LogAt) {
    if (t < cutoff) last401LogAt.delete(k);
  }
}

async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (env.NODE_ENV === 'production' && env.ALLOW_DEV_AUTH_BYPASS) {
    console.error(
      '[CRITICAL SECURITY ALERT] Dev auth bypass is enabled in PRODUCTION environment!'
    );
    res.status(500).json({
      error: 'Critical security misconfiguration detected',
      message: 'Contact system administrator immediately',
    });
    return;
  }

  const resolved = await tryResolveUser(req);
  if (resolved.kind === 'unavailable') {
    // Auth backend failure, not a dead session — 503 instead of 401 so the
    // client neither wipes its auth state nor redirects to login. No
    // /auth/login redirect in the HTML branch either: that bounce is exactly
    // what forces an unnecessary re-login.
    const requestId = randomUUID().slice(0, 8);
    res.setHeader('X-Request-Id', requestId);
    res.status(503).json({
      error: 'auth_unavailable',
      code: 'auth_unavailable',
      requestId,
      message: 'Anmeldedienst vorübergehend nicht erreichbar',
    });
    return;
  }
  if (resolved.kind === 'user') {
    req.user = resolved.user;
    return next();
  }

  // No valid session. `code` distinguishes "never sent a credential"
  // (definitively logged out) from "credential presented but not found"
  // (expired/revoked — could be mid-rotation). Frontend uses it as a hint.
  const code = resolved.reason === 'no_cookie' ? 'no_session_cookie' : 'session_not_found';
  const requestId = randomUUID().slice(0, 8);
  res.setHeader('X-Request-Id', requestId);

  if (
    req.headers['content-type'] === 'application/json' ||
    req.headers.accept === 'application/json' ||
    req.originalUrl.startsWith('/api/')
  ) {
    // The human-facing warn is debounced per-route/60s (anti-flood), so only
    // the first 401's requestId lands in it. Emit every requestId at debug so
    // that with LOG_LEVEL=debug during an incident, EACH client-visible
    // requestId is greppable in the backend log (the token prefix remains the
    // reliable spine at info level).
    log.debug('[Session] 401 req=%s %s %s code=%s', requestId, req.method, req.originalUrl, code);
    maybeLog401Once(req.method, req.originalUrl, code, requestId, resolved.tokenPrefix);
    res.status(401).json({
      error: 'Authentication required',
      code,
      requestId,
      redirectUrl: '/auth/login',
    });
    return;
  }

  res.redirect('/auth/login');
}

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.user) {
    void requireAuth(req, res, next);
    return;
  }
  return next();
}

async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  // Already resolved by an earlier requireAuth/optionalAuth on a narrower prefix
  // (e.g. /api/subtitler/projects runs requireAuth before the prefix-wide
  // optionalAuth). Re-resolving would cost a second session lookup for nothing.
  if ((req as AuthenticatedRequest).user) {
    return next();
  }

  if (!req.headers.cookie && !req.headers.authorization && !req.headers['x-dev-auth-bypass']) {
    return next();
  }

  const resolved = await tryResolveUser(req);
  // 'unavailable' degrades to the guest view here instead of failing the whole
  // request: optional-auth routes serve public content, and a logged-in user
  // transiently seeing the guest variant beats a hard 503 on it.
  if (resolved.kind === 'user') {
    req.user = resolved.user;
  } else if (resolved.kind === 'none' && resolved.reason === 'session_not_found') {
    // A user who presented a (dead) credential is being silently served the
    // guest variant — itself a half-logged-in contributor. Surface it,
    // debounced per token prefix via the same map as the 401 path.
    maybeLogOptionalDegraded(req, resolved.tokenPrefix);
  }
  return next();
}

function maybeLogOptionalDegraded(req: Request, tokenPrefix?: string): void {
  const path = req.originalUrl.split('?')[0] ?? req.originalUrl;
  const key = tokenPrefix ?? 'bearer';
  const now = Date.now();
  const last = lastResolveNullLogAt.get(`opt:${key}`) ?? 0;
  if (now - last < RESOLVE_NULL_DEBOUNCE_MS) return;
  lastResolveNullLogAt.set(`opt:${key}`, now);
  log.info('[Session] optional-auth-degraded path=%s token=%s', path, tokenPrefix ?? '-');
  const cutoff = now - RESOLVE_NULL_DEBOUNCE_MS * 2;
  for (const [k, t] of lastResolveNullLogAt) {
    if (t < cutoff) lastResolveNullLogAt.delete(k);
  }
}

/**
 * Extract a branded {@link UserId} from an authenticated request.
 *
 * Use this at route-handler entry points to propagate a branded `UserId`
 * through service signatures, which lets the type system catch mixups
 * between `UserId`, `DocumentId`, `NotebookId`, etc. at compile time.
 *
 * Must be called *after* `requireAuth` has run — throws if `req.user` is
 * unset. Opt-in: existing handlers that read `req.user.id` as a plain
 * string continue to work; migrate call sites when touching the file.
 *
 * @example
 * router.get('/api/foo/:docId', requireAuth, async (req, res) => {
 *   const userId = getUserId(req);           // UserId (branded)
 *   const docId = fromParam<DocumentId>(req.params.docId);
 *   const doc = await documentService.get(docId, userId); // can't swap args
 * });
 */
function getUserId(req: Request): UserIdBrand {
  if (!req.user?.id) {
    throw new Error(
      'getUserId called on unauthenticated request — missing requireAuth middleware?'
    );
  }
  return UserId(req.user.id);
}

// `tryResolveUser` is exported for ONE caller: the notification SSE channel,
// which must tell 'no session' from 'auth backend down' itself because it
// answers in-band instead of with a status code (see routes/notifications/
// stream.ts). Everything else goes through requireAuth/optionalAuth — a
// third resolver in a route handler is how auth policy drifts apart.
export { requireAuth, requireAdmin, optionalAuth, getUserId, tryResolveUser };
export default { requireAuth, requireAdmin, optionalAuth, getUserId };
