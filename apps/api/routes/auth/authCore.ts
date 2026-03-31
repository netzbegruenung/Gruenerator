/**
 * Core authentication routes
 * Handles status, logout, profile, locale, health, and error pages
 * Login/callback handled by Better Auth at /api/auth/v2/*
 */

import { fromNodeHeaders } from 'better-auth/node';
import express, { type Router, type Response, type NextFunction } from 'express';

import { auth, type BetterAuthUser } from '../../config/betterAuth.js';
import authMiddlewareModule from '../../middleware/authMiddleware.js';
import * as chatMemory from '../../services/chat/ChatMemoryService.js';
import { createLogger } from '../../utils/logger.js';

import type { AuthRequest, AuthStatusResponse, LocaleUpdateBody } from './types.js';

const log = createLogger('authCore');
const { requireAuth: ensureAuthenticated } = authMiddlewareModule;

const router: Router = express.Router();

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
// Status Route
// ============================================================================

router.get('/status', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (session?.user) {
      const user = session.user as BetterAuthUser;
      res.json({
        isAuthenticated: true,
        user: { ...user, locale: user.locale || 'de-DE' },
      });
      return;
    }
  } catch {
    // Session check failed
  }

  res.json({ isAuthenticated: false, user: null } as AuthStatusResponse);
});

// ============================================================================
// Error Route
// ============================================================================

router.get('/error', (req: AuthRequest, res: Response): void => {
  const htmlEscape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const errorCode = htmlEscape(String(req.query.message || 'unknown_error'));
  const correlationId = htmlEscape(String(req.query.correlationId || 'N/A'));
  const retry = req.query.retry === 'true';

  log.error(`[Auth Error] Code: ${errorCode}, Correlation: ${correlationId}`);

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

  try {
    await auth.api.signOut({ headers: fromNodeHeaders(req.headers) });
  } catch {
    // Sign-out may fail if no session — that's fine
  }

  res.status(200).json({ success: true, message: 'Logout completed', sessionCleared: true });
});

router.post('/logout', async (req: AuthRequest, res: Response): Promise<void> => {
  const keycloakBaseUrl = process.env.KEYCLOAK_BASE_URL || 'https://user.netzbegruenung.de';
  const keycloakLogoutUrl = `${keycloakBaseUrl}/realms/${process.env.KEYCLOAK_REALM || 'gruenerator'}/protocol/openid-connect/logout`;

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
      const { getPostgresInstance } = await import('../../database/services/PostgresService.js');
      const db = getPostgresInstance();
      const rows = await db.query<{ id_token: string }>(
        `SELECT id_token FROM ba_accounts WHERE user_id = $1 AND provider_id LIKE 'keycloak-%' AND id_token IS NOT NULL LIMIT 1`,
        [req.user.id]
      );
      if (rows[0]?.id_token) {
        keycloakBackgroundLogoutUrl = `${keycloakLogoutUrl}?id_token_hint=${rows[0].id_token}`;
      }
    } catch {
      // Account lookup may fail — proceed without SSO logout
    }
  }

  try {
    await auth.api.signOut({ headers: fromNodeHeaders(req.headers) });
  } catch {
    // Sign-out may fail if no session
  }

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

router.get('/profile', ensureAuthenticated, (req: AuthRequest, res: Response): void => {
  res.json({ user: req.user || null });
});

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

      res.json({ success: true, message: 'Locale updated successfully', locale });
    } catch (error) {
      log.error('[Auth /locale PUT] Error:', error);
      res.status(500).json({ success: false, error: 'Failed to update locale' });
    }
  }
);

export default router;
