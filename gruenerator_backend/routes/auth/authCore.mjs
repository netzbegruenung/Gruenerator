import express from 'express';
import passport from '../../config/passportSetup.mjs';
// Supabase deprecated – remove dependency
import authMiddlewareModule from '../../middleware/authMiddleware.js';

const { requireAuth: ensureAuthenticated } = authMiddlewareModule;

const router = express.Router();

// Add Passport session middleware only for auth routes
router.use(passport.session());


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
      const redirectTo = req.session.redirectTo || `${process.env.BASE_URL}/profile`;
      delete req.session.redirectTo;
      delete req.session.preferredSource;
      delete req.session.isRegistration;
      
      req.session.save((err) => {
        if (err) {
          console.error('[AuthCallback] Error saving session:', err);
        }
        res.redirect(redirectTo);
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
    return res.json({ isAuthenticated: true, user: req.user });
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
router.get('/logout', (req, res, next) => {
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
router.post('/logout', (req, res, next) => {
  const keycloakBaseUrl = process.env.KEYCLOAK_BASE_URL || 'https://auth.services.moritz-waechter.de';
  const keycloakLogoutUrl = `${keycloakBaseUrl}/realms/Gruenerator/protocol/openid-connect/logout`;

  const originalSessionId = req.sessionID;
  const wasAuthenticated = req.isAuthenticated();
  const idToken = req.user?.id_token;

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
