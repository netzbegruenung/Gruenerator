/**
 * Core authentication routes
 * Handles status, logout, profile, locale, health, and error pages
 * Login/callback handled by Better Auth at /api/auth/v2/*
 */

import { fromNodeHeaders } from 'better-auth/node';
import { and, eq, like } from 'drizzle-orm';
import express, { type Router, type Response } from 'express';

import { auth, type BetterAuthUser } from '../../config/betterAuth.js';
import { env } from '../../config/env.js';
import { ba_accounts } from '../../database/schema/auth.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
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
      const user = session.user as BetterAuthUser & { locale?: string };
      res.json({
        isAuthenticated: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          emailVerified: user.emailVerified,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          ...(user.locale && { locale: user.locale }),
        },
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

  try {
    await auth.api.signOut({ headers: fromNodeHeaders(req.headers) });
  } catch (err) {
    // Sign-out may fail if no session — log so we know it happened
    log.warn('[Auth Logout] auth.api.signOut threw: %s', (err as Error).message);
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
