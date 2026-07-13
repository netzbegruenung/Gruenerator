/**
 * Core authentication routes
 * Handles logout, profile, locale, health, and error pages
 * Session reads are served by Better Auth's native /api/auth/v2/get-session
 * Login/callback handled by Better Auth at /api/auth/v2/*
 */

import { fromNodeHeaders } from 'better-auth/node';
import { and, eq, like } from 'drizzle-orm';
import express, { type Router, type Request, type Response } from 'express';

import { auth } from '../../config/betterAuth.js';
import { env } from '../../config/env.js';
import { ba_accounts } from '../../database/schema/auth.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import authMiddlewareModule from '../../middleware/authMiddleware.js';
import * as chatMemory from '../../services/chat/ChatMemoryService.js';
import { forwardBetterAuthCookies } from '../../utils/betterAuthBridge.js';
import { createLogger } from '../../utils/logger.js';
import { captureAuthIssue } from '../../utils/observability/captureAuthIssue.js';

import type { AuthRequest, LocaleUpdateBody } from './types.js';

const log = createLogger('authCore');
const { requireAuth: ensureAuthenticated } = authMiddlewareModule;

const router: Router = express.Router();

/**
 * Sign the user out of Better Auth AND forward the cookie-clearing headers to
 * the Express response. `auth.api.signOut({ headers, asResponse: true })`
 * returns a Response carrying `Set-Cookie: ba.session_token=; Max-Age=0`
 * (plus the same for `ba.session_data`, the 300s cookie cache). Without this
 * forwarding step those headers are discarded by the Express handler, so the
 * browser keeps both cookies — and because the cookie cache stores a signed
 * copy of the session, subsequent `auth.api.getSession()` calls return the
 * cached user for up to 300s even though the DB row has been deleted. That's
 * the "logs me back in immediately after logout" bug.
 *
 * Pattern straight from Better Auth issue #7034 (Express/NestJS context).
 * Multiple Set-Cookie headers must be forwarded — `res.setHeader('Set-Cookie',
 * cookies)` with an array does this correctly.
 */
async function signOutAndForwardCookies(req: Request, res: Response): Promise<void> {
  try {
    const betterAuthResponse = await auth.api.signOut({
      headers: fromNodeHeaders(req.headers),
      asResponse: true,
    });
    const cookies: string[] = [];
    betterAuthResponse.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'set-cookie') cookies.push(value);
    });
    if (cookies.length) res.setHeader('Set-Cookie', cookies);
  } catch (err) {
    log.warn('[Auth Logout] auth.api.signOut threw: %s', (err as Error).message);
    captureAuthIssue({ stage: 'logout', cause: err, req });
  }
}

/**
 * Re-read the session from the DB (bypassing the cookie cache) and forward the
 * refreshed `Set-Cookie: ba.session_data=...` header to the browser. Better Auth
 * caches a signed copy of the whole user object — including `locale` — in the
 * `ba.session_data` cookie for 300s (`betterAuth.ts` session.cookieCache). A DB
 * write alone (e.g. `PUT /locale`) does NOT touch that cookie, so the next
 * `getSession()` returns the stale cached user for up to 300s and the frontend
 * reverts the change. `getSession({ query: { disableCookieCache: true } })`
 * forces a fresh DB read and re-writes the cache cookie; forwarding its
 * Set-Cookie makes the just-persisted value visible immediately. Same hazard,
 * and same forwarding pattern, as `signOutAndForwardCookies` above.
 */
async function refreshSessionCookieCache(req: Request, res: Response): Promise<void> {
  try {
    const betterAuthResponse = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
      query: { disableCookieCache: true },
      asResponse: true,
    });
    forwardBetterAuthCookies(res, betterAuthResponse);
  } catch (err) {
    log.warn('[Auth /locale PUT] session cache refresh threw: %s', (err as Error).message);
    captureAuthIssue({ stage: 'locale-update', cause: err, req });
  }
}

// ============================================================================
// Health & Test Routes
// ============================================================================

router.get('/health', (_req: AuthRequest, res: Response): void => {
  res.status(200).json({ status: 'ok', message: 'Backend is healthy' });
});

router.get('/test', (_req: AuthRequest, res: Response): void => {
  res.json({
    success: true,
    message: 'Auth routes are working',
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// Error Route
// ============================================================================

router.get('/error', (req: AuthRequest, res: Response): void => {
  const htmlEscape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const rawMessage = typeof req.query.message === 'string' ? req.query.message : null;
  const errorCode = htmlEscape(rawMessage ?? 'unknown_error');
  const correlationId = htmlEscape(String(req.query.correlationId || 'N/A'));
  const retry = req.query.retry === 'true';

  log.error(`[Auth Error] Code: ${errorCode}, Correlation: ${correlationId}`);

  // Capture the upstream failure with the error code as the synthetic error
  // name so events cluster per code in GlitchTip (e.g. all `account_not_linked`
  // failures in one issue). Skip when no `?message=` query is present — that
  // means a user landed here directly (bookmark, browser back) with no real
  // signal to report. Benign codes like `please_restart_the_process` are
  // suppressed by `captureAuthIssue`'s built-in filter.
  if (rawMessage) {
    const synthetic = new Error(`auth-error-route: ${rawMessage}`);
    synthetic.name = rawMessage;
    captureAuthIssue({
      stage: 'auth-error-route',
      cause: synthetic,
      req,
      extras: { errorCode: rawMessage, correlationId, retry },
    });
  }

  if (retry) {
    res.status(401).send(`<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="2;url=/auth/login">
  <title>Anmeldung fehlgeschlagen</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f5f5f5; color: #333; }
    .card { background: #fff; border-radius: 12px; padding: 2.5rem; max-width: 420px; text-align: center; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
    h1 { color: #316049; font-size: 1.25rem; margin: 0 0 0.75rem; }
    p { margin: 0 0 1rem; line-height: 1.5; font-size: 0.95rem; }
    a { color: #316049; font-weight: 600; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .hint { font-size: 0.8rem; color: #888; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Anmeldung fehlgeschlagen</h1>
    <p>Du wirst in wenigen Sekunden automatisch weitergeleitet&hellip;</p>
    <p><a href="/auth/login">Jetzt erneut anmelden</a></p>
    <p class="hint">Fehler: ${errorCode} &middot; Referenz: ${correlationId}</p>
  </div>
</body>
</html>`);
    return;
  }

  res
    .status(401)
    .send(
      `Authentication Error: ${errorCode}. Please try again or contact support with correlation ID: ${correlationId}`
    );
});

// ============================================================================
// Logout Routes
// ============================================================================

router.get('/logout', async (req: AuthRequest, res: Response): Promise<void> => {
  if (req.user?.id) {
    try {
      await chatMemory.clearConversation(req.user.id);
    } catch (error) {
      log.error('[Auth GET /logout] Error clearing chat memory:', error);
    }
  }

  await signOutAndForwardCookies(req, res);

  res.status(200).json({ success: true, message: 'Logout completed', sessionCleared: true });
});

router.post('/logout', async (req: AuthRequest, res: Response): Promise<void> => {
  const keycloakLogoutUrl = `${env.KEYCLOAK_BASE_URL}/realms/${env.KEYCLOAK_REALM}/protocol/openid-connect/logout`;

  if (req.user?.id) {
    try {
      await chatMemory.clearConversation(req.user.id);
    } catch (error) {
      log.error('[Auth POST /logout] Error clearing chat memory:', error);
    }
  }

  // Look up id_token from ba_accounts for Keycloak SSO logout
  let keycloakBackgroundLogoutUrl: string | null = null;
  if (req.user?.id) {
    try {
      const db = getDrizzleInstance();
      const rows = await db
        .select({ idToken: ba_accounts.id_token })
        .from(ba_accounts)
        .where(
          and(eq(ba_accounts.user_id, req.user.id), like(ba_accounts.provider_id, 'keycloak-%'))
        )
        .limit(1);
      log.info(
        '[Auth Logout] ba_accounts lookup for user_id=%s: rows=%d, has_id_token=%s',
        req.user.id,
        rows.length,
        rows[0]?.idToken != null ? 'yes' : 'no'
      );
      if (rows[0]?.idToken) {
        keycloakBackgroundLogoutUrl = `${keycloakLogoutUrl}?id_token_hint=${rows[0].idToken}`;
      }
    } catch (err) {
      // Account lookup may fail — proceed without SSO logout, but log the error
      log.error(
        '[Auth Logout] ba_accounts query threw for user_id=%s: %s',
        req.user.id,
        (err as Error).message
      );
    }
  }

  await signOutAndForwardCookies(req, res);

  res.json({
    success: true,
    message: 'Logout successful',
    sessionDestroyed: true,
    sessionCleared: true,
    cookieCleared: true,
    redirectToHome: true,
    timestamp: Date.now(),
    keycloakBackgroundLogoutUrl,
    authentikBackgroundLogoutUrl: keycloakBackgroundLogoutUrl,
  });
});

// ============================================================================
// Profile & Locale Routes
// ============================================================================

// NOTE: `GET /profile` is intentionally NOT defined here. It is served by the
// ts-rest `userProfileContract` (userProfileContractRouter), which mounts in
// routes.ts BEFORE this authRouter and therefore registers `/api/auth/profile`
// first. The contracted handler reads the full profile from ProfileService
// (with a display_name fallback) and returns the typed `{ success, user }`
// shape; the old `res.json({ user: req.user })` duplicate here was dead,
// shadowed code and has been removed.

router.get('/locale', ensureAuthenticated, (req: AuthRequest, res: Response): void => {
  try {
    const userLocale = req.user?.locale || 'de-DE';
    res.json({ success: true, locale: userLocale });
  } catch (error) {
    log.error('[Auth /locale GET] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to get locale' });
  }
});

router.put(
  '/locale',
  ensureAuthenticated,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { locale } = req.body as LocaleUpdateBody;

      if (!locale || !['de-DE', 'de-AT'].includes(locale)) {
        res.status(400).json({
          success: false,
          error: 'Invalid locale. Must be de-DE or de-AT',
        });
        return;
      }

      const { getProfileService } = await import('../../services/user/ProfileService.js');
      const profileService = getProfileService();

      await profileService.updateProfile(req.user!.id, { locale });
      req.user!.locale = locale;

      // Persist to the DB is not enough: Better Auth serves `getSession` from the
      // 300s `ba.session_data` cookie cache, which still holds the old locale.
      // Refresh it so the switch sticks instead of reverting on the next reload.
      await refreshSessionCookieCache(req, res);

      res.json({ success: true, message: 'Locale updated successfully', locale });
    } catch (error) {
      log.error('[Auth /locale PUT] Error:', error);
      res.status(500).json({ success: false, error: 'Failed to update locale' });
    }
  }
);

export default router;
