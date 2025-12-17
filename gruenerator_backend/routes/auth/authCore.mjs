import express from 'express';
import passport from '../../config/passportSetup.mjs';
import authMiddlewareModule from '../../middleware/authMiddleware.js';
import { createRequire } from 'module';
import { createLogger } from '../../utils/logger.js';
import { getOriginDomain, isAllowedDomain, buildDomainUrl, getLocaleFromDomain } from '../../utils/domainUtils.js';
const log = createLogger('authCore');


const require = createRequire(import.meta.url);
const chatMemory = require('../../services/chatMemoryService');

const { requireAuth: ensureAuthenticated } = authMiddlewareModule;

const router = express.Router();

router.use(passport.session());

router.use((req, res, next) => {
  const originalSend = res.send.bind(res);
  const originalJson = res.json.bind(res);

  res.send = function (body) {
    if (res.statusCode >= 400) {
      log.error(`[authCore] ${req.method} ${req.originalUrl} - Status: ${res.statusCode}`);
    }
    return originalSend(body);
  };

  res.json = function (body) {
    if (res.statusCode >= 400) {
      log.error(`[authCore] ${req.method} ${req.originalUrl} - Status: ${res.statusCode}`);
    }
    return originalJson(body);
  };

  next();
});

function isAllowedMobileRedirect(redirectUrl) {
  if (!redirectUrl) return false;
  const lower = redirectUrl.toLowerCase();
  if (lower.startsWith('http://') || lower.startsWith('https://')) return false;
  return redirectUrl.startsWith('gruenerator://');
}

function appendQueryParam(url, key, value) {
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


// Health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Backend is healthy' });
});

router.get('/test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Auth routes are working',
    timestamp: new Date().toISOString()
  });
});

// Session health check middleware
async function checkSessionHealth(req, res, next) {
  try {
    // Test session storage by attempting a write and read
    const testKey = '_session_health_test';
    const testValue = Date.now().toString();

    req.session[testKey] = testValue;

    // Save and verify
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Session health check timeout'));
      }, 3000);

      req.session.save((err) => {
        clearTimeout(timeout);
        if (err) {
          reject(err);
        } else {
          // Verify the value was saved
          if (req.session[testKey] === testValue) {
            delete req.session[testKey];
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
    return res.redirect('/auth/error?message=session_storage_unavailable&retry=true');
  }
}

// Initiates the login flow - all sources now use OIDC through Keycloak
router.get('/login', checkSessionHealth, async (req, res, next) => {
  const source = req.query.source;
  const { redirectTo, prompt } = req.query;

  // Store origin domain before OAuth flow for multi-domain support
  const originDomain = getOriginDomain(req);
  if (isAllowedDomain(originDomain)) {
    req.session.originDomain = originDomain;
    log.debug(`[Auth Login] Stored origin domain: ${originDomain}`);
  }

  // Store redirect URL in session for all login types
  if (redirectTo) {
    req.session.redirectTo = redirectTo;
  }

  // Store source preference for callback handling
  if (source) {
    req.session.preferredSource = source;
  }

  // Handle registration requests
  if (prompt === 'register') {
    req.session.isRegistration = true;
  }

  // Save session to ensure redirectTo and other params are persisted before OAuth flow
  try {
    await new Promise((resolve, reject) => {
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
    return res.redirect('/auth/error?message=session_storage_unavailable&retry=true');
  }

  let options = {
    scope: 'openid profile email offline_access',
  };

  // Add identity provider hint if specific source is requested
  if (source === 'netzbegruenung-login') {
    options.kc_idp_hint = 'netzbegruenung';
    options.prompt = 'login'; // Force re-authentication to respect identity provider hint
  } else if (source === 'gruenes-netz-login') {
    options.kc_idp_hint = 'gruenes-netz';
    options.prompt = 'login'; // Force re-authentication to respect identity provider hint
  } else if (source === 'gruene-oesterreich-login') {
    options.kc_idp_hint = 'gruene-at-login';
    options.prompt = 'login'; // Force re-authentication to respect identity provider hint
  } else if (source === 'gruenerator-login') {
    options.kc_idp_hint = 'gruenerator-user';
    // Set appropriate prompt based on registration intent
    if (prompt === 'register') {
      options.prompt = 'register'; // Explicitly pass registration prompt to Keycloak
    } else {
      options.prompt = 'login'; // Force re-authentication to respect identity provider hint
    }
  }

  // openid-client handles session persistence properly
  passport.authenticate('oidc', options)(req, res, next);
});

// OIDC callback (handles all authentication sources)
router.get('/callback',
  passport.authenticate('oidc', {
    failureRedirect: '/auth/error',
    failureMessage: true
  }),
  async (req, res, next) => {
    try {
      // Get redirectTo from user object (survives session regeneration) or fallback to session
      const intendedRedirect = req.user?._redirectTo || req.session.redirectTo;

      // Clean up
      if (req.user && req.user._redirectTo) {
        delete req.user._redirectTo;
      }
      delete req.session.redirectTo;
      delete req.session.preferredSource;
      delete req.session.isRegistration;

      // If redirect target is an allowed mobile deep link, issue a short-lived login_code
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
            jti
          })
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setExpirationTime('60s')
            .setIssuer('gruenerator-auth')
            .setAudience('gruenerator-app-login-code')
            .sign(secret);

          // Save then redirect to mobile deep link with code
          req.session.save((err) => {
            if (err) {
              log.error('[AuthCallback] Error saving session (mobile deep link):', err);
            }
            const redirectWithCode = appendQueryParam(intendedRedirect, 'code', code);
            return res.redirect(redirectWithCode);
          });
          return; // Stop further processing
        } catch (e) {
          log.error('[AuthCallback] Failed to create login_code for mobile redirect:', e);
          // fall through to normal redirect
        }
      }

      // Use stored origin domain for multi-domain support, fall back to BASE_URL
      const originDomain = req.session.originDomain;
      const isSecure = process.env.NODE_ENV === 'production' ||
                       req.secure ||
                       req.headers['x-forwarded-proto'] === 'https';

      let baseUrl;
      if (originDomain && isAllowedDomain(originDomain)) {
        baseUrl = buildDomainUrl(originDomain, '', isSecure);
        log.debug(`[AuthCallback] Using origin domain for redirect: ${baseUrl}`);
      } else {
        baseUrl = process.env.BASE_URL || 'http://localhost:3000';
        log.debug(`[AuthCallback] Using fallback BASE_URL: ${baseUrl}`);
      }

      let absoluteRedirect;
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

      // Clean up origin domain from session after use
      delete req.session.originDomain;

      const redirectTo = absoluteRedirect;

      req.session.save((err) => {
        if (err) {
          log.error('[AuthCallback] Error saving session:', err);
        }
        return res.redirect(redirectTo);
      });
      
    } catch (error) {
      log.error('[AuthCallback] General error in OIDC callback:', error);
      next(error);
    }
  }
);

// Get authentication status
router.get('/status', async (req, res) => {
  if (req.session && !req.user && req.session.passport?.user) {
    await new Promise(resolve => setImmediate(resolve));
  }

  const finalIsAuth = req.isAuthenticated() && req.user;

  if (finalIsAuth) {
    // Ensure locale is included in user object
    const userWithLocale = {
      ...req.user,
      locale: req.user.locale || 'de-DE'
    };
    return res.json({ isAuthenticated: true, user: userWithLocale });
  }
  return res.json({ isAuthenticated: false, user: null });
});

// Simple status test route to verify routing is working
router.get('/status-test', (req, res) => {
  res.json({ 
    message: 'Status test route works',
    timestamp: new Date().toISOString(),
    sessionID: req.sessionID
  });
});

// Error handling route
router.get('/error', (req, res) => {
  const errorCode = req.query.message || 'unknown_error';
  const correlationId = req.query.correlationId || 'N/A';
  const keycloakError = req.session?.messages?.slice(-1)[0];
  if (req.session?.messages) delete req.session.messages;

  log.error(`[Auth Error] Code: ${errorCode}, Correlation: ${correlationId}, Keycloak: ${keycloakError || 'none'}`);

  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  res.status(401).send(`Authentication Error: ${errorCode}. Please try again or contact support with correlation ID: ${correlationId}`);
});

// Logout
router.get('/logout', async (req, res, next) => {
  // Clear chat memory for the user
  if (req.user?.id) {
    try {
      await chatMemory.clearConversation(req.user.id);
      log.debug('[Auth Core GET /logout] Chat memory cleared for user:', req.user.id);
    } catch (error) {
      log.error('[Auth Core GET /logout] Error clearing chat memory:', error);
    }
  }

  req.logout(function(err) {
    if (err) {
      log.error("Failed to logout user:", err);
    }

    req.session.destroy((destroyErr) => {
      if (destroyErr) {
        log.error("[Auth Core GET /logout] Session destruction error:", destroyErr);
      }

      res.clearCookie('gruenerator.sid', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
      });

      res.status(200).json({ success: true, message: 'Logout completed', sessionCleared: true });
    });
  });
});

// API endpoint for frontend-triggered logout (returns JSON instead of redirect)
router.post('/logout', async (req, res, next) => {
  const keycloakBaseUrl = process.env.KEYCLOAK_BASE_URL || 'https://auth.services.moritz-waechter.de';
  const keycloakLogoutUrl = `${keycloakBaseUrl}/realms/Gruenerator/protocol/openid-connect/logout`;

  const originalSessionId = req.sessionID;
  const wasAuthenticated = req.isAuthenticated();
  const idToken = req.user?.id_token;

  // Clear chat memory for the user (if authenticated)
  if (wasAuthenticated && req.user?.id) {
    try {
      await chatMemory.clearConversation(req.user.id);
      log.debug('[Auth Core POST /logout] Chat memory cleared for user:', req.user.id);
    } catch (error) {
      log.error('[Auth Core POST /logout] Error clearing chat memory:', error);
    }
  }

  // If not authenticated, return immediate success
  if (!wasAuthenticated) {
    return res.json({
      success: true,
      message: 'Already logged out',
      sessionCleared: true,
      redirectToHome: true,
      alreadyLoggedOut: true,
      timestamp: Date.now()
    });
  }

  req.logout(function(err) {
    if (err) { 
      log.error("[Auth Core POST /logout] Passport logout error:", err);
    }

    req.session.destroy((destroyErr) => {
      if (destroyErr) {
        log.error("[Auth Core POST /logout] Session destruction error:", destroyErr);
        
        return res.status(500).json({
          success: false,
          error: 'session_destruction_failed',
          message: 'Failed to destroy session completely',
          sessionDestroyed: false,
          cookieCleared: false,
          originalSessionId: originalSessionId,
          timestamp: Date.now(),
          keycloakBackgroundLogoutUrl: idToken ? `${keycloakLogoutUrl}?id_token_hint=${idToken}` : null,
          recoveryInstructions: 'Clear browser cookies manually and try again'
        });
      }
      
      res.clearCookie('gruenerator.sid', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
      });
      
      let keycloakBackgroundLogoutUrl = null;
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
        authentikBackgroundLogoutUrl: keycloakBackgroundLogoutUrl
      });
    });
  });
});

// Get user profile (example protected route)
router.get('/profile', ensureAuthenticated, (req, res) => {
  res.json({ user: req.user || null });
});

// Get current user's locale
router.get('/locale', ensureAuthenticated, (req, res) => {
  try {
    const userLocale = req.user?.locale || 'de-DE';
    res.json({
      success: true,
      locale: userLocale
    });
  } catch (error) {
    log.error('[Auth /locale GET] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get locale'
    });
  }
});

// Update user's locale
router.put('/locale', ensureAuthenticated, async (req, res) => {
  try {
    const { locale } = req.body;

    // Validate locale
    if (!locale || !['de-DE', 'de-AT'].includes(locale)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid locale. Must be de-DE or de-AT'
      });
    }

    // Update user's locale in database
    const { getProfileService } = await import('../../services/ProfileService.mjs');
    const profileService = getProfileService();

    await profileService.updateProfile(req.user.id, { locale });

    // Update session user object
    req.user.locale = locale;

    res.json({
      success: true,
      message: 'Locale updated successfully',
      locale: locale
    });

  } catch (error) {
    log.error('[Auth /locale PUT] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update locale'
    });
  }
});

// Debug session endpoint (development only)
if (process.env.NODE_ENV !== 'production') {
  router.get('/debug/session', (req, res) => {
    res.json({
      session: {
        id: req.sessionID,
        authenticated: req.isAuthenticated(),
        user: req.user || null,
        cookie: req.session.cookie,
        maxAge: req.session.cookie.maxAge,
        sessionData: req.session
      },
      headers: {
        'user-agent': req.headers['user-agent'],
        'x-forwarded-for': req.headers['x-forwarded-for'],
        'x-real-ip': req.headers['x-real-ip']
      },
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        BASE_URL: process.env.BASE_URL
      }
    });
  });
}

export default router; 
