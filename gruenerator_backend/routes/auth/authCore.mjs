import express from 'express';
import passport from '../../config/passportSetup.mjs';
import { supabaseService } from '../../utils/supabaseClient.js';
import authMiddlewareModule from '../../middleware/authMiddleware.js';

const { requireAuth: ensureAuthenticated } = authMiddlewareModule;

const router = express.Router();

// Add Passport session middleware only for auth routes
router.use(passport.session());

// Add debugging middleware to all auth routes
router.use((req, res, next) => {
  console.log(`[Auth Core] ${req.method} ${req.originalUrl} - Session ID: ${req.sessionID} - Has cookies: ${!!req.headers.cookie}`);
  console.log(`[Auth Core] Full URL: ${req.url}, Path: ${req.path}, Route: ${req.route ? req.route.path : 'No route matched yet'}`);
  next();
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Backend is healthy' });
});

// Simple test endpoint to verify routing works
router.get('/test', (req, res) => {
  console.log('[Auth Core] Test endpoint hit');
  res.json({ 
    success: true, 
    message: 'Auth routes are working',
    timestamp: new Date().toISOString()
  });
});

// Initiates the login flow - all sources now use OIDC through Keycloak
router.get('/login', (req, res, next) => {
  console.log('[Auth Core /login] ENTERED /api/auth/login ROUTE');
  const source = req.query.source;
  const { redirectTo, prompt } = req.query;
  console.log('[Auth Core /login] req.session before login handling:', req.session);
  console.log(`[Auth Core /login] Source: ${source}, RedirectTo: ${redirectTo}, Prompt: ${prompt}`);

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
    console.log('[Auth Core /login] Registration request detected');
    req.session.isRegistration = true;
  }

  // All login sources now use OIDC through Keycloak
  console.log('[Auth Core /login] Using OIDC flow through Keycloak for source:', source || 'default');
  
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
  }
  // gruenerator-login uses default behavior (no kc_idp_hint) - shows all providers like old generic login

  console.log('[Auth Core /login] OIDC options:', options);
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
      console.log('[AuthCallback] req.session at start of OIDC callback:', req.session);
      console.log('[AuthCallback] User authenticated successfully via OIDC:', req.user?.id);
      
      const redirectTo = req.session.redirectTo || `${process.env.BASE_URL}/profile`;
      delete req.session.redirectTo;
      delete req.session.preferredSource;
      delete req.session.isRegistration;
      
      req.session.save((err) => {
        if (err) {
          console.error('[AuthCallback] Error saving session:', err);
        } else {
          console.log('[AuthCallback] Session saved successfully');
        }
        console.log(`[AuthCallback] Redirecting to: ${redirectTo}`);
        res.redirect(redirectTo);
      });
      
    } catch (error) {
      console.error('[AuthCallback] General error in OIDC callback:', error);
      console.error('[AuthCallback] req.user in error handler:', req.user);
      next(error);
    }
  }
);

// Get authentication status
router.get('/status', async (req, res) => {
  console.log('[Auth Status] *** ROUTE HIT *** - This should appear when /status is accessed');
  
  console.log('\n========== AUTH STATUS ROUTE DEBUG ==========');
  console.log('[1] Initial Request State:', {
    sessionID: req.sessionID,
    hasSession: !!req.session,
    hasSessionCookie: !!req.headers.cookie?.includes('gruenerator.sid'),
    cookieHeader: req.headers.cookie,
    origin: req.headers.origin,
  });

  if (req.session) {
    console.log('[2] Session Details:', {
      sessionID: req.session.id,
      cookie: req.session.cookie,
      passport: req.session.passport,
      hasPassportUser: !!req.session.passport?.user,
      passportUserId: req.session.passport?.user?.id,
    });
  }

  console.log('[3] User State (before isAuthenticated):', {
    hasUser: !!req.user,
    userId: req.user?.id,
    userObject: req.user ? Object.keys(req.user) : 'No user',
  });

  const isAuthResult = req.isAuthenticated ? req.isAuthenticated() : null;
  console.log('[4] isAuthenticated() result:', isAuthResult);

  if (req.session && !req.user && req.session.passport?.user) {
    console.log('[5] Session has passport.user but req.user is missing - attempting manual deserialize');
    
    await new Promise(resolve => setImmediate(resolve));
    
    console.log('[6] After setImmediate - User state:', {
      hasUser: !!req.user,
      userId: req.user?.id,
      isAuthResult: req.isAuthenticated ? req.isAuthenticated() : null,
    });
  }

  const finalIsAuth = req.isAuthenticated() && req.user;
  console.log('[7] Final Authentication Decision:', {
    finalIsAuth,
    isAuthenticated: req.isAuthenticated(),
    hasUser: !!req.user,
    reason: !finalIsAuth ? (
      !req.isAuthenticated() ? 'isAuthenticated() returned false' :
      !req.user ? 'req.user is missing' :
      'Unknown'
    ) : 'Both checks passed'
  });
  console.log('============================================\n');
  
  if (finalIsAuth) {
    try {
      console.log('[Auth Status] BEFORE auth user fetch - Session beta_features:', req.user?.beta_features);
      console.log('[Auth Status] BEFORE auth user fetch - Session user_metadata.beta_features:', req.user?.user_metadata?.beta_features);
      
      console.log('[Auth Status] Using profile-only auth - no Supabase session needed');

      // Load user's groups if not already loaded and groups beta feature is enabled
      if (req.user && req.user.beta_features?.groups && !req.user.groups) {
        try {
          const { data: memberships } = await supabaseService
            .from('group_memberships')
            .select(`
              group_id,
              role,
              joined_at,
              groups!inner(id, name, created_at, created_by, join_token)
            `)
            .eq('user_id', req.user.id);

          if (memberships) {
            req.user.groups = memberships.map(m => ({
              id: m.groups.id,
              name: m.groups.name,
              created_at: m.groups.created_at,
              created_by: m.groups.created_by,
              join_token: m.groups.join_token,
              role: m.role,
              joined_at: m.joined_at,
              isAdmin: m.groups.created_by === req.user.id || m.role === 'admin'
            }));
          }
        } catch (groupError) {
          console.warn('[Auth Status] Error loading groups:', groupError);
          // Don't fail the request if groups fail to load
        }
      }

      // Log for debugging bundestag API slider issue
      console.log('[Auth Status] Returning user data:', {
        userId: req.user?.id,
        igelModus: req.user?.igel_modus,
        bundestagApiEnabled: req.user?.bundestag_api_enabled,
        source: '/auth/status'
      });

      res.json({
        isAuthenticated: true,
        user: req.user,
        supabaseSession: null
      });
    } catch (error) {
      console.error('[Auth Status] Error in auth status:', error);
      res.json({
        isAuthenticated: true,
        user: req.user,
        supabaseSession: null
      });
    }
  } else {
    res.json({
      isAuthenticated: false,
      user: null,
      supabaseSession: null
    });
  }
});

// Simple status test route to verify routing is working
router.get('/status-test', (req, res) => {
  console.log('[Auth Core] STATUS-TEST ROUTE HIT!');
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
  console.error(`[AuthErrorPage] Displaying error: ${errorMessage}`, keycloakError ? `Keycloak/OIDC Error: ${keycloakError}` : '');
  if (req.session?.messages) delete req.session.messages;

  res.status(401).send(`Authentication Error: ${errorMessage}${keycloakError ? ` - Details: ${keycloakError}` : ''}`);
});

// Logout
router.get('/logout', (req, res, next) => {
  console.log("====== [Auth Core GET /logout] ROUTE HIT ======");
  console.log("[Auth Core GET /logout] process.env.KEYCLOAK_BASE_URL:", process.env.KEYCLOAK_BASE_URL);
  console.log("[Auth Core GET /logout] process.env.BASE_URL:", process.env.BASE_URL);

  const keycloakBaseUrl = process.env.KEYCLOAK_BASE_URL || 'https://auth.services.moritz-waechter.de';
  const keycloakLogoutUrl = `${keycloakBaseUrl}/realms/Gruenerator/protocol/openid-connect/logout`;
  const postLogoutRedirectUri = `${process.env.BASE_URL}/`;

  console.log(`[Auth Core /logout] Using logout URL: ${keycloakLogoutUrl}`);
  console.log(`[Auth Core /logout] Post-logout redirect URI: ${postLogoutRedirectUri}`);

  req.logout(function(err) {
    if (err) { 
      console.error("Failed to logout user:", err);
    }
    const idToken = req.user?.id_token;
    console.log("[Auth Core GET /logout] ID Token from req.user (before session destroy):", idToken ? "Present" : "Not Present");

    // CRITICAL: Properly destroy session for security  
    req.session.destroy((destroyErr) => {
      if (destroyErr) {
        console.error("[Auth Core GET /logout] Session destruction error:", destroyErr);
      } else {
        console.log("[Auth Core GET /logout] Session destroyed successfully");
      }
      
      // Clear the session cookie
      res.clearCookie('gruenerator.sid', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
      });
      
      console.log("[Auth Core GET /logout] Logout completed with session destruction");
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
  console.log("====== [Auth Core POST /logout] ROUTE HIT ======");
  console.log("[Auth Core POST /logout] process.env.KEYCLOAK_BASE_URL:", process.env.KEYCLOAK_BASE_URL);
  console.log("[Auth Core POST /logout] process.env.BASE_URL:", process.env.BASE_URL);

  const keycloakBaseUrl = process.env.KEYCLOAK_BASE_URL || 'https://auth.services.moritz-waechter.de';
  const keycloakLogoutUrl = `${keycloakBaseUrl}/realms/Gruenerator/protocol/openid-connect/logout`;

  console.log(`[Auth Core POST /logout] API logout requested`);

  // Track original session for verification
  const originalSessionId = req.sessionID;
  const wasAuthenticated = req.isAuthenticated();
  const idToken = req.user?.id_token;
  
  console.log("[Auth Core POST /logout] Original session ID:", originalSessionId);
  console.log("[Auth Core POST /logout] Was authenticated:", wasAuthenticated);
  console.log("[Auth Core POST /logout] ID Token from req.user (before session destroy):", idToken ? "Present" : "Not Present");

  // If not authenticated, return immediate success
  if (!wasAuthenticated) {
    console.log("[Auth Core POST /logout] User not authenticated, returning immediate success");
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
      // Continue with session destruction even if passport logout fails
    }

    // CRITICAL: Properly destroy session for security
    req.session.destroy((destroyErr) => {
      const sessionDestroyed = !destroyErr;
      const cookieCleared = sessionDestroyed; // Only clear cookie if session destroyed successfully
      
      if (destroyErr) {
        console.error("[Auth Core POST /logout] Session destruction error:", destroyErr);
        
        // Return error response but with recovery information
        return res.status(500).json({
          success: false,
          error: 'session_destruction_failed',
          message: 'Failed to destroy session completely',
          sessionDestroyed: false,
          cookieCleared: false,
          originalSessionId: originalSessionId,
          timestamp: Date.now(),
          // Still provide Keycloak logout URL for manual cleanup
          keycloakBackgroundLogoutUrl: idToken ? `${keycloakLogoutUrl}?id_token_hint=${idToken}` : null,
          recoveryInstructions: 'Clear browser cookies manually and try again'
        });
      }
      
      console.log("[Auth Core POST /logout] Session destroyed successfully");
      
      // Clear the session cookie only after successful session destruction
      res.clearCookie('gruenerator.sid', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
      });
      
      // Prepare Keycloak logout information
      let keycloakBackgroundLogoutUrl = null;
      if (idToken) {
        keycloakBackgroundLogoutUrl = `${keycloakLogoutUrl}?id_token_hint=${idToken}`;
        console.log("[Auth Core POST /logout] Keycloak logout URL prepared for background request:", keycloakBackgroundLogoutUrl);
      } else {
        console.log("[Auth Core POST /logout] No ID token available for Keycloak logout");
      }
      
      console.log("[Auth Core POST /logout] Logout completed successfully with session destruction");
      
      // Return comprehensive success response
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
        // Deprecated fields for backward compatibility
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