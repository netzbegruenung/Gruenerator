import express from 'express';
import passport from '../../config/passportSetup.mjs';
// Supabase deprecated – remove dependency
import authMiddlewareModule from '../../middleware/authMiddleware.js';
import { createRequire } from 'module';

// Import chat memory service for cleanup on logout
const require = createRequire(import.meta.url);
const chatMemory = require('../../services/chatMemoryService');

const { requireAuth: ensureAuthenticated } = authMiddlewareModule;

const router = express.Router();

// Add Passport session middleware only for auth routes
router.use(passport.session());

// Intelligent request/response logging for auth core
// - Correlates requests with a short ID
// - Logs minimal auth/session hints (no secrets)
// - Captures redirects and response status/content-type
router.use((req, res, next) => {
  const reqId = `AC-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  req._authReqId = reqId;

  const start = Date.now();
  const originalSend = res.send.bind(res);
  const originalJson = res.json.bind(res);
  const originalRedirect = res.redirect ? res.redirect.bind(res) : null;

  const logPrefix = `[authCore][${reqId}]`;

  try {
    // Basic request context (no sensitive data)
    console.log(`${logPrefix} Incoming ${req.method} ${req.originalUrl}`, {
      sessionID: req.sessionID,
      hasCookieHeader: !!req.headers['cookie'],
      accept: req.headers['accept'],
      contentType: req.headers['content-type'],
      isAuthenticated: typeof req.isAuthenticated === 'function' ? req.isAuthenticated() : false,
      hasReqUser: !!req.user,
      hasSessionPassportUser: !!(req.session?.passport?.user)
    });
  } catch (_) {}

  function logResponseBody(body, channel = 'send') {
    try {
      const elapsed = Date.now() - start;
      const status = res.statusCode;
      const ct = res.get('Content-Type');
      let snippet = '';
      if (typeof body === 'string') {
        snippet = body.slice(0, 180);
      } else if (Buffer.isBuffer(body)) {
        snippet = body.toString('utf8', 0, Math.min(body.length, 180));
      } else if (typeof body === 'object' && body !== null) {
        // Avoid logging tokens or large objects
        try {
          const safe = { ...body };
          if (safe.user) {
            const { id, email, locale } = safe.user;
            safe.user = { id, email, locale };
          }
          snippet = JSON.stringify(safe).slice(0, 220);
        } catch (_) {
          snippet = '[object]';
        }
      }
      const looksHtml = typeof snippet === 'string' && /<html|<!DOCTYPE html/i.test(snippet);
      console.log(`${logPrefix} Response via ${channel}`, {
        status,
        contentType: ct,
        durationMs: elapsed,
        looksHtml,
        bodySnippet: snippet
      });
    } catch (e) {
      console.warn(`${logPrefix} Failed to log response body:`, e.message);
    }
  }

  res.send = function (body) {
    logResponseBody(body, 'send');
    return originalSend(body);
  };

  res.json = function (body) {
    logResponseBody(body, 'json');
    return originalJson(body);
  };

  if (originalRedirect) {
    res.redirect = function (url) {
      const elapsed = Date.now() - start;
      console.log(`${logPrefix} Redirect`, { status: res.statusCode, url, durationMs: elapsed });
      return originalRedirect(url);
    };
  }

  res.on('finish', () => {
    // Fallback if body wasn’t captured
    const elapsed = Date.now() - start;
    const ct = res.get('Content-Type');
    console.log(`${logPrefix} Finished`, { status: res.statusCode, contentType: ct, durationMs: elapsed });
  });

  next();
});

// Helpers for mobile deep-link support
function parseAllowlist() {
  const raw = process.env.MOBILE_REDIRECT_ALLOWLIST || '';
  return raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

function isAllowedMobileRedirect(redirectUrl) {
  if (!redirectUrl) return false;
  // Only consider non-http(s) deep-links as mobile redirects
  const lower = redirectUrl.toLowerCase();
  if (lower.startsWith('http://') || lower.startsWith('https://')) return false;
  const allow = parseAllowlist();
  if (allow.length === 0) return false;
  return allow.some(prefix => redirectUrl.startsWith(prefix));
}

function appendQueryParam(url, key, value) {
  try {
    // For custom schemes, URL may throw; fallback to simple concatenation
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

// Simple test endpoint to verify routing works
router.get('/test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Auth routes are working',
    timestamp: new Date().toISOString()
  });
});

// Initiates the login flow - all sources now use OIDC through Keycloak
router.get('/login', (req, res, next) => {
  const source = req.query.source;
  const { redirectTo, prompt } = req.query;

  // Store redirect URL in session for all login types
  if (redirectTo) {
    req.session.redirectTo = redirectTo;
    console.log('[Auth Login] Storing redirectTo in session:', redirectTo);
    console.log('[Auth Login] Session ID:', req.sessionID);
  } else {
    console.log('[Auth Login] No redirectTo parameter provided');
  }

  // Store source preference for callback handling
  if (source) {
    req.session.preferredSource = source;
  }

  // Handle registration requests
  if (prompt === 'register') {
    req.session.isRegistration = true;
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
      console.log('[AuthCallback] Session ID:', req.sessionID);
      console.log('[AuthCallback] Intended redirect from session:', intendedRedirect);
      console.log('[AuthCallback] Session contents:', Object.keys(req.session || {}).join(', '));

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
          console.log('[AuthCallback] Mobile deep link allowed. Creating login_code...');
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
              console.error('[AuthCallback] Error saving session (mobile deep link):', err);
            }
            const redirectWithCode = appendQueryParam(intendedRedirect, 'code', code);
            console.log('[AuthCallback] Redirecting to mobile deep link:', redirectWithCode);
            return res.redirect(redirectWithCode);
          });
          return; // Stop further processing
        } catch (e) {
          console.error('[AuthCallback] Failed to create login_code for mobile redirect:', e);
          // fall through to normal redirect
        }
      } else if (intendedRedirect) {
        console.warn('[AuthCallback] Mobile deep link NOT allowed. Check MOBILE_REDIRECT_ALLOWLIST.', {
          intendedRedirect,
          allowlist: process.env.MOBILE_REDIRECT_ALLOWLIST || '(empty)'
        });
      }

      // Ensure all redirect URLs are absolute
      const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

      let absoluteRedirect;
      if (intendedRedirect) {
        if (intendedRedirect.startsWith('http://') || intendedRedirect.startsWith('https://')) {
          // Already absolute URL (including mobile deep-links)
          absoluteRedirect = intendedRedirect;
        } else if (intendedRedirect.includes('://')) {
          // Mobile deep-link (app://, gruenerator://, etc.)
          absoluteRedirect = intendedRedirect;
        } else {
          // Relative URL - convert to absolute
          absoluteRedirect = `${baseUrl}${intendedRedirect.startsWith('/') ? '' : '/'}${intendedRedirect}`;
        }
      } else {
        // Default fallback
        absoluteRedirect = `${baseUrl}/profile`;
      }

      const redirectTo = absoluteRedirect;

      console.log('[AuthCallback] URL conversion details:');
      console.log('  - Original intendedRedirect:', intendedRedirect);
      console.log('  - Base URL:', baseUrl);
      console.log('  - Final absolute redirect:', redirectTo);

      req.session.save((err) => {
        if (err) {
          console.error('[AuthCallback] Error saving session:', err);
        }
        console.log('[AuthCallback] Redirecting to web URL:', redirectTo);
        return res.redirect(redirectTo);
      });
      
    } catch (error) {
      console.error('[AuthCallback] General error in OIDC callback:', error);
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
  const errorMessage = req.query.message || 'An unspecified error occurred during authentication.';
  const keycloakError = req.session?.messages?.slice(-1)[0];
  if (req.session?.messages) delete req.session.messages;

  res.status(401).send(`Authentication Error: ${errorMessage}${keycloakError ? ` - Details: ${keycloakError}` : ''}`);
});

// Logout
router.get('/logout', async (req, res, next) => {
  // Clear chat memory for the user
  if (req.user?.id) {
    try {
      await chatMemory.clearConversation(req.user.id);
      console.log('[Auth Core GET /logout] Chat memory cleared for user:', req.user.id);
    } catch (error) {
      console.error('[Auth Core GET /logout] Error clearing chat memory:', error);
    }
  }

  req.logout(function(err) {
    if (err) {
      console.error("Failed to logout user:", err);
    }

    req.session.destroy((destroyErr) => {
      if (destroyErr) {
        console.error("[Auth Core GET /logout] Session destruction error:", destroyErr);
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

// Seite, die nach dem Logout von Keycloak angezeigt wird
router.get('/logged-out', (req, res) => {
  // Clear any remaining session data
  if (req.session) {
    req.session.destroy((err) => {
      if (err) {
        console.error('[Auth logged-out] Session cleanup error:', err);
      }
    });
  }
  
  // Clear session cookie
  res.clearCookie('gruenerator.sid', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  });
  
  // Redirect to frontend logged-out page
  const frontendUrl = process.env.BASE_URL || 'http://localhost:3000';
  res.redirect(`${frontendUrl}/logged-out`);
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
      console.log('[Auth Core POST /logout] Chat memory cleared for user:', req.user.id);
    } catch (error) {
      console.error('[Auth Core POST /logout] Error clearing chat memory:', error);
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
      console.error("[Auth Core POST /logout] Passport logout error:", err);
    }

    req.session.destroy((destroyErr) => {
      if (destroyErr) {
        console.error("[Auth Core POST /logout] Session destruction error:", destroyErr);
        
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
    console.error('[Auth /locale GET] Error:', error);
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
    console.error('[Auth /locale PUT] Error:', error);
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
