/**
 * Core authentication routes
 * Handles login, logout, callback, status, and locale management
 */

import express, { type Router, type Response, type NextFunction } from 'express';

import passport from '../../config/passportSetup.js';
import authMiddlewareModule from '../../middleware/authMiddleware.js';
import * as chatMemory from '../../services/chat/ChatMemoryService.js';
import { getOriginDomain, isAllowedDomain, buildDomainUrl } from '../../utils/domainUtils.js';
import { createLogger } from '../../utils/logger.js';

import type {
  AuthRequest,
  AuthSessionRequest,
  LocaleUpdateBody,
  AuthStatusResponse,
} from './types.js';

const log = createLogger('authCore');
const { requireAuth: ensureAuthenticated } = authMiddlewareModule;

const router: Router = express.Router();

router.use(passport.session());

// Response logging middleware for errors
router.use((req: AuthRequest, res: Response, next: NextFunction): void => {
  const originalSend = res.send.bind(res);
  const originalJson = res.json.bind(res);

  res.send = function (body: any) {
    if (res.statusCode >= 400) {
      log.error(`[authCore] ${req.method} ${req.originalUrl} - Status: ${res.statusCode}`);
    }
    return originalSend(body);
  };

  res.json = function (body: any) {
    if (res.statusCode >= 400) {
      log.error(`[authCore] ${req.method} ${req.originalUrl} - Status: ${res.statusCode}`);
    }
    return originalJson(body);
  };

  next();
});

// ============================================================================
// Helper Functions
// ============================================================================

function isAllowedMobileRedirect(redirectUrl: string | undefined): boolean {
  if (!redirectUrl) return false;
  const lower = redirectUrl.toLowerCase();
  if (lower.startsWith('http://') || lower.startsWith('https://')) return false;
  return lower.startsWith('gruenerator://') || lower.startsWith('gruenerator-docs://');
}

function appendQueryParam(url: string, key: string, value: string): string {
  try {
    const hasQuery = url.includes('?');
    const sep = hasQuery ? '&' : '?';
    return `${url}${sep}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
  } catch {
    const hasQuery = url.includes('?');
    const sep = hasQuery ? '&' : '?';
    return `${url}${sep}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
  }
}

// Session health check middleware
async function checkSessionHealth(
  req: AuthSessionRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const testKey = '_session_health_test';
    const testValue = Date.now().toString();

    (req.session as any)[testKey] = testValue;

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Session health check timeout'));
      }, 3000);

      req.session.save((err) => {
        clearTimeout(timeout);
        if (err) {
          reject(err);
        } else {
          if ((req.session as any)[testKey] === testValue) {
            delete (req.session as any)[testKey];
            resolve();
          } else {
            reject(new Error('Session verification failed'));
          }
        }
      });
    });

    next();
  } catch (error) {
    log.error('[Auth] Session health check failed:', error);
    res.redirect('/auth/error?message=session_storage_unavailable&retry=true');
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
// Login Flow
// ============================================================================

router.get(
  '/login',
  checkSessionHealth,
  async (req: AuthSessionRequest, res: Response, next: NextFunction): Promise<void> => {
    const source = req.query.source as string | undefined;
    const redirectTo = req.query.redirectTo as string | undefined;
    const prompt = req.query.prompt as string | undefined;
    const originParam = req.query.origin as string | undefined;

    const originDomain = getOriginDomain(req);
    if (isAllowedDomain(originDomain)) {
      req.session.originDomain = originDomain;
      log.debug(`[Auth Login] Stored origin domain: ${originDomain}`);
    } else if (originParam) {
      try {
        const originHost = new URL(originParam).host;
        if (isAllowedDomain(originHost)) {
          req.session.originDomain = originHost;
          log.debug(`[Auth Login] Stored origin domain from query param: ${originHost}`);
        }
      } catch {
        log.debug(`[Auth Login] Invalid origin query param: ${originParam}`);
      }
    }

    if (redirectTo) {
      req.session.redirectTo = redirectTo;
    }

    if (source) {
      req.session.preferredSource = source;
    }

    if (prompt === 'register') {
      req.session.isRegistration = true;
    }

    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Session save timeout before auth'));
        }, 3000);

        req.session.save((err) => {
          clearTimeout(timeout);
          if (err) {
            log.error('[Auth Login] Failed to save session before auth:', err);
            reject(err);
          } else {
            resolve();
          }
        });
      });
    } catch (error) {
      log.error('[Auth Login] Session save error:', error);
      res.redirect('/auth/error?message=session_storage_unavailable&retry=true');
      return;
    }

    const options: Record<string, string> = {
      scope: 'openid profile email offline_access',
    };

    if (source === 'netzbegruenung-login') {
      options.kc_idp_hint = 'netzbegruenung';
      options.prompt = 'login';
    } else if (source === 'gruenes-netz-login') {
      options.kc_idp_hint = 'gruenes-netz';
      options.prompt = 'login';
    } else if (source === 'gruene-oesterreich-login') {
      options.kc_idp_hint = 'gruene-at-login';
      options.prompt = 'login';
    } else if (source === 'gruenerator-login') {
      options.kc_idp_hint = 'gruenerator-user';
      if (prompt === 'register') {
        options.prompt = 'register';
      } else {
        options.prompt = 'login';
      }
    }

    passport.authenticate('oidc', options)(req, res, next);
  }
);

// ============================================================================
// OIDC Callback
// ============================================================================

router.get(
  '/callback',
  passport.authenticate('oidc', {
    failureRedirect: '/auth/error',
    failureMessage: true,
  }),
  async (req: AuthSessionRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const intendedRedirect = req.user?._redirectTo || req.session.redirectTo;

      if (req.user && req.user._redirectTo) {
        delete req.user._redirectTo;
      }
      delete req.session.redirectTo;
      delete req.session.preferredSource;
      delete req.session.isRegistration;

      if (intendedRedirect && isAllowedMobileRedirect(intendedRedirect)) {
        try {
          const { SignJWT } = await import('jose');
          const { randomUUID } = await import('crypto');
          const secret = new TextEncoder().encode(
            process.env.SESSION_SECRET || 'fallback-secret-please-change'
          );

          const jti = randomUUID();
          const code = await new SignJWT({
            token_use: 'app_login_code',
            sub: req.user?.id,
            keycloak_id: req.user?.keycloak_id || null,
            jti,
          })
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setExpirationTime('60s')
            .setIssuer('gruenerator-auth')
            .setAudience('gruenerator-app-login-code')
            .sign(secret);

          req.session.save((err) => {
            if (err) {
              log.error('[AuthCallback] Error saving session (mobile deep link):', err);
            }
            const redirectWithCode = appendQueryParam(intendedRedirect, 'code', code);
            res.redirect(redirectWithCode);
          });
          return;
        } catch (e) {
          log.error('[AuthCallback] Failed to create login_code for mobile redirect:', e);
        }
      }

      const originDomain = req.user?._originDomain || req.session.originDomain;
      const originSource = req.user?._originDomain
        ? 'user._originDomain'
        : req.session.originDomain
          ? 'session'
          : 'none';
      log.debug(`[AuthCallback] originDomain=${originDomain} (source: ${originSource})`);

      const isSecure =
        process.env.NODE_ENV === 'production' ||
        req.secure ||
        req.headers['x-forwarded-proto'] === 'https';

      if (req.user && req.user._originDomain) {
        delete req.user._originDomain;
      }

      let baseUrl: string;
      if (originDomain && isAllowedDomain(originDomain)) {
        baseUrl = buildDomainUrl(originDomain, '', isSecure);
        log.debug(`[AuthCallback] Using origin domain for redirect: ${baseUrl}`);
      } else {
        baseUrl = process.env.BASE_URL || 'http://localhost:3000';
        log.debug(`[AuthCallback] Using fallback BASE_URL: ${baseUrl}`);
      }

      let absoluteRedirect: string;
      if (intendedRedirect) {
        if (intendedRedirect.startsWith('http://') || intendedRedirect.startsWith('https://')) {
          absoluteRedirect = intendedRedirect;
        } else if (intendedRedirect.includes('://')) {
          absoluteRedirect = intendedRedirect;
        } else {
          absoluteRedirect = `${baseUrl}${intendedRedirect.startsWith('/') ? '' : '/'}${intendedRedirect}`;
        }
      } else {
        absoluteRedirect = `${baseUrl}/profile`;
      }

      delete req.session.originDomain;

      req.session.save((err) => {
        if (err) {
          log.error('[AuthCallback] Error saving session:', err);
        }
        res.redirect(absoluteRedirect);
      });
    } catch (error) {
      log.error('[AuthCallback] General error in OIDC callback:', error);
      next(error);
    }
  }
);

// ============================================================================
// Status Routes
// ============================================================================

router.get('/status', async (req: AuthSessionRequest, res: Response): Promise<void> => {
  if (req.session && !req.user && req.session.passport?.user) {
    await new Promise((resolve) => setImmediate(resolve));
  }

  const finalIsAuth = req.isAuthenticated() && req.user;

  if (finalIsAuth) {
    const userWithLocale = {
      ...req.user,
      locale: req.user!.locale || 'de-DE',
    };
    res.json({ isAuthenticated: true, user: userWithLocale } as AuthStatusResponse);
    return;
  }
  res.json({ isAuthenticated: false, user: null } as AuthStatusResponse);
});

router.get('/status-test', (req: AuthRequest, res: Response): void => {
  res.json({
    message: 'Status test route works',
    timestamp: new Date().toISOString(),
    sessionID: req.sessionID,
  });
});

// ============================================================================
// Error Route
// ============================================================================

router.get('/error', (req: AuthSessionRequest, res: Response): void => {
  const errorCode = req.query.message || 'unknown_error';
  const correlationId = req.query.correlationId || 'N/A';
  const retry = req.query.retry === 'true';
  const keycloakError = req.session?.messages?.slice(-1)[0];
  if (req.session?.messages) delete req.session.messages;

  log.error(
    `[Auth Error] Code: ${errorCode}, Correlation: ${correlationId}, Keycloak: ${keycloakError || 'none'}`
  );

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
      log.debug('[Auth Core GET /logout] Chat memory cleared for user:', req.user.id);
    } catch (error) {
      log.error('[Auth Core GET /logout] Error clearing chat memory:', error);
    }
  }

  req.logout(function (err) {
    if (err) {
      log.error('Failed to logout user:', err);
    }

    req.session.destroy((destroyErr) => {
      if (destroyErr) {
        log.error('[Auth Core GET /logout] Session destruction error:', destroyErr);
      }

      res.clearCookie('gruenerator.sid', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
      });

      res.status(200).json({ success: true, message: 'Logout completed', sessionCleared: true });
    });
  });
});

router.post('/logout', async (req: AuthRequest, res: Response): Promise<void> => {
  const keycloakBaseUrl =
    process.env.KEYCLOAK_BASE_URL || 'https://auth.services.moritz-waechter.de';
  const keycloakLogoutUrl = `${keycloakBaseUrl}/realms/Gruenerator/protocol/openid-connect/logout`;

  const originalSessionId = req.sessionID;
  const wasAuthenticated = req.isAuthenticated();
  const idToken = req.user?.id_token;

  if (wasAuthenticated && req.user?.id) {
    try {
      await chatMemory.clearConversation(req.user.id);
      log.debug('[Auth Core POST /logout] Chat memory cleared for user:', req.user.id);
    } catch (error) {
      log.error('[Auth Core POST /logout] Error clearing chat memory:', error);
    }
  }

  if (!wasAuthenticated) {
    res.json({
      success: true,
      message: 'Already logged out',
      sessionCleared: true,
      redirectToHome: true,
      alreadyLoggedOut: true,
      timestamp: Date.now(),
    });
    return;
  }

  req.logout(function (err) {
    if (err) {
      log.error('[Auth Core POST /logout] Passport logout error:', err);
    }

    req.session.destroy((destroyErr) => {
      if (destroyErr) {
        log.error('[Auth Core POST /logout] Session destruction error:', destroyErr);

        res.status(500).json({
          success: false,
          error: 'session_destruction_failed',
          message: 'Failed to destroy session completely',
          sessionDestroyed: false,
          cookieCleared: false,
          originalSessionId: originalSessionId,
          timestamp: Date.now(),
          keycloakBackgroundLogoutUrl: idToken
            ? `${keycloakLogoutUrl}?id_token_hint=${idToken}`
            : null,
          recoveryInstructions: 'Clear browser cookies manually and try again',
        });
        return;
      }

      res.clearCookie('gruenerator.sid', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
      });

      let keycloakBackgroundLogoutUrl: string | null = null;
      if (idToken) {
        keycloakBackgroundLogoutUrl = `${keycloakLogoutUrl}?id_token_hint=${idToken}`;
      }

      res.json({
        success: true,
        message: 'Logout successful',
        sessionDestroyed: true,
        sessionCleared: true,
        cookieCleared: true,
        redirectToHome: true,
        originalSessionId: originalSessionId,
        timestamp: Date.now(),
        keycloakBackgroundLogoutUrl: keycloakBackgroundLogoutUrl,
        authentikBackgroundLogoutUrl: keycloakBackgroundLogoutUrl,
      });
    });
  });
});

// ============================================================================
// Profile & Locale Routes
// ============================================================================

router.get('/profile', ensureAuthenticated as any, (req: AuthRequest, res: Response): void => {
  res.json({ user: req.user || null });
});

router.get('/locale', ensureAuthenticated as any, (req: AuthRequest, res: Response): void => {
  try {
    const userLocale = req.user?.locale || 'de-DE';
    res.json({
      success: true,
      locale: userLocale,
    });
  } catch (error) {
    log.error('[Auth /locale GET] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get locale',
    });
  }
});

router.put(
  '/locale',
  ensureAuthenticated as any,
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

      res.json({
        success: true,
        message: 'Locale updated successfully',
        locale: locale,
      });
    } catch (error) {
      log.error('[Auth /locale PUT] Error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update locale',
      });
    }
  }
);

// ============================================================================
// Debug Routes (Development Only)
// ============================================================================

if (process.env.NODE_ENV !== 'production') {
  router.get('/debug/session', (req: AuthRequest, res: Response): void => {
    res.json({
      session: {
        id: req.sessionID,
        authenticated: req.isAuthenticated(),
        user: req.user || null,
        cookie: req.session.cookie,
        maxAge: req.session.cookie.maxAge,
        sessionData: req.session,
      },
      headers: {
        'user-agent': req.headers['user-agent'],
        'x-forwarded-for': req.headers['x-forwarded-for'],
        'x-real-ip': req.headers['x-real-ip'],
      },
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        BASE_URL: process.env.BASE_URL,
      },
    });
  });
}

export default router;
