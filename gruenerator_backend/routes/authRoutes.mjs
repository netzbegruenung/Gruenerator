import express from 'express';
import passport from '../config/passportSetup.mjs';
import { supabaseService } from '../utils/supabaseClient.js';
import authMiddlewareModule from '../middleware/authMiddleware.js';
import { AuthentikApiClient } from '../utils/authentikApiClient.js';

const { requireAuth: ensureAuthenticated } = authMiddlewareModule;

const router = express.Router();

// Initialize Authentik API client for user management
const authentikClient = new AuthentikApiClient();

// Add Passport session middleware only for auth routes
router.use(passport.session());

// Add debugging middleware to all auth routes
router.use((req, res, next) => {
  console.log(`[Auth Router] ${req.method} ${req.originalUrl} - Session ID: ${req.sessionID} - Has cookies: ${!!req.headers.cookie}`);
  console.log(`[Auth Router] Full URL: ${req.url}, Path: ${req.path}, Route: ${req.route ? req.route.path : 'No route matched yet'}`);
  

  
  next();
});

// API endpoint to get authentication URL (for frontend)
/*
router.post('/initiate', (req, res) => {
  const { source } = req.body;
  
  console.log(`[Auth Routes /initiate] Entered. Request body:`, req.body);
  
  try {
    const authUrl = new URL('https://auth.services.moritz-waechter.de/application/o/authorize/');
    
    authUrl.searchParams.set('client_id', process.env.AUTHENTIK_CLIENT_ID);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'openid profile email');
    authUrl.searchParams.set('redirect_uri', `${process.env.AUTH_BASE_URL || process.env.BASE_URL}/api/auth/callback`);
    authUrl.searchParams.set('state', `source=${source || 'default'}`);
    
    if (source) {
      authUrl.searchParams.set('prompt', 'select_account');
    }
    
    const authUrlString = authUrl.toString();
    const responsePayload = {
      authUrl: authUrlString,
      source: source || 'default'
    };

    console.log(`[Auth Routes /initiate] Successfully generated auth URL. Payload to be sent:`, responsePayload);
    
    // Explicitly set status and then send JSON.
    res.status(200).json(responsePayload);

    console.log(`[Auth Routes /initiate] Response sent with status 200.`);

  } catch (error) {
    console.error('[Auth Routes /initiate] Error occurred in try block:', error);
    console.error('[Auth Routes /initiate] Error name:', error.name);
    console.error('[Auth Routes /initiate] Error message:', error.message);
    console.error('[Auth Routes /initiate] Error stack:', error.stack);
    
    // Ensure a response is always sent in catch block
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Failed to generate authentication URL due to an internal error.',
        details: error.message,
        errorName: error.name
      });
    } else {
      console.error("[Auth Routes /initiate] Headers already sent, couldn't send error response.");
    }
  }
});
*/

// Health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Backend is healthy' });
});

// Simple test endpoint to verify routing works
router.get('/test', (req, res) => {
  console.log('[Auth Routes] Test endpoint hit');
  res.json({ 
    success: true, 
    message: 'Auth routes are working',
    timestamp: new Date().toISOString()
  });
});



// === REGISTRATION & ACCOUNT MANAGEMENT ROUTES ===

// Note: Registration is now handled through Authentik enrollment flows
// Users are redirected to Authentik's registration interface

// Email Verification (placeholder for future implementation)
router.get('/verify-email', async (req, res) => {
  const { token, userId } = req.query;
  
  try {
    console.log('[Auth Routes /verify-email] Email verification attempt:', { userId, token: token ? 'present' : 'missing' });
    
    if (!token || !userId) {
      return res.status(400).json({
        success: false,
        message: 'Ungültiger Verifizierungslink'
      });
    }

    // TODO: Implement email verification logic
    // This would typically involve:
    // 1. Validating the token
    // 2. Activating the user in Authentik
    // 3. Updating user status in Supabase if needed

    res.json({
      success: true,
      message: 'E-Mail-Verifizierung erfolgreich! Sie können sich jetzt anmelden.'
    });

  } catch (error) {
    console.error('[Auth Routes /verify-email] Verification error:', error.message);
    res.status(500).json({
      success: false,
      message: 'E-Mail-Verifizierung fehlgeschlagen'
    });
  }
});

// Check if user can be deleted (must be gruenerator user)
const canDeleteAccount = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Nicht angemeldet'
      });
    }

    // Get user details from Authentik
    const authentikUser = await authentikClient.findUserByEmail(req.user.email);
    
    if (!authentikUser) {
      return res.status(404).json({
        success: false,
        message: 'Benutzer nicht gefunden'
      });
    }

    // Check if user is from gruenerator source
    if (!authentikClient.isGrueneratorUser(authentikUser)) {
      return res.status(403).json({
        success: false,
        message: 'Nur Grünerator-Benutzer können ihr Konto löschen. Nutzer von externen Quellen müssen ihr Konto über das jeweilige System verwalten.'
      });
    }

    req.authentikUser = authentikUser;
    next();

  } catch (error) {
    console.error('[Auth Routes canDeleteAccount] Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Fehler beim Überprüfen der Kontoberechtigung'
    });
  }
};

// Account Deletion
router.delete('/delete-account', ensureAuthenticated, canDeleteAccount, async (req, res) => {
  try {
    console.log('[Auth Routes /delete-account] Account deletion request:', req.user.email);
    
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({
        success: false,
        message: 'Passwort zur Bestätigung erforderlich'
      });
    }

    // TODO: Verify password before deletion
    // This would require implementing password verification against Authentik

    const userId = req.authentikUser.pk; // Authentik user ID
    
    // Delete user from Authentik
    await authentikClient.deleteUser(userId);
    console.log('[Auth Routes /delete-account] User deleted from Authentik:', userId);

    // Delete user data from Supabase if exists
    if (req.user.id) {
      try {
        const { error: supabaseError } = await supabaseService.auth.admin.deleteUser(req.user.id);
        if (supabaseError) {
          console.warn('[Auth Routes /delete-account] Supabase deletion warning:', supabaseError.message);
        } else {
          console.log('[Auth Routes /delete-account] User data deleted from Supabase');
        }
      } catch (supabaseErr) {
        console.warn('[Auth Routes /delete-account] Supabase deletion error (non-blocking):', supabaseErr.message);
      }
    }

    // Clear session
    req.logout(function(err) {
      if (err) {
        console.error('[Auth Routes /delete-account] Logout error:', err);
      }
    });

    res.json({
      success: true,
      message: 'Konto erfolgreich gelöscht'
    });

  } catch (error) {
    console.error('[Auth Routes /delete-account] Deletion error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Kontolöschung fehlgeschlagen',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Password Reset Request
router.post('/reset-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: 'E-Mail-Adresse ist erforderlich'
      });
    }

    console.log('[Auth Routes /reset-password] Password reset request:', email);

    // Check if user exists and is from gruenerator source
    const user = await authentikClient.findUserByEmail(email.toLowerCase().trim());
    
    if (!user) {
      // Don't reveal if user exists or not for security
      return res.json({
        success: true,
        message: 'Falls ein Konto mit dieser E-Mail-Adresse existiert, wurde eine Passwort-Reset-E-Mail gesendet.'
      });
    }

    if (!authentikClient.isGrueneratorUser(user)) {
      return res.json({
        success: true,
        message: 'Falls ein Konto mit dieser E-Mail-Adresse existiert, wurde eine Passwort-Reset-E-Mail gesendet.'
      });
    }

    // TODO: Implement password reset email sending
    // This requires configuring a recovery flow in Authentik
    const resetSent = await authentikClient.sendPasswordResetEmail(email);
    
    res.json({
      success: true,
      message: 'Falls ein Konto mit dieser E-Mail-Adresse existiert, wurde eine Passwort-Reset-E-Mail gesendet.',
      resetSent // For development debugging
    });

  } catch (error) {
    console.error('[Auth Routes /reset-password] Reset error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Passwort-Reset fehlgeschlagen'
    });
  }
});

// === END REGISTRATION & ACCOUNT MANAGEMENT ROUTES ===

// Initiates the login flow (OIDC or SAML based on source)
router.get('/login', (req, res, next) => {
  console.log('[Auth Routes /login] ENTERED /api/auth/login ROUTE');
  const source = req.query.source;
  const { redirectTo, prompt } = req.query;
  console.log('[Auth Routes /login] req.session before passport.authenticate:', req.session);
  console.log(`[Auth Routes /login] Source: ${source}, RedirectTo: ${redirectTo}, Prompt: ${prompt}`);


  // Handle registration requests through direct flow endpoint
  if (prompt === 'register' && source === process.env.AUTHENTIK_GRUENERATOR_SOURCE_SLUG) {
    console.log('[Auth Routes /login] Registration request detected, using direct flow endpoint');
    
    const authentikBaseUrl = process.env.AUTHENTIK_API_BASE_URL || 'https://auth.services.moritz-waechter.de';
    
    // Build direct flow URL for registration
    const registrationUrl = `${authentikBaseUrl}/if/flow/gruenerator-registration-flow/`;
    
    // Store that this is a registration attempt and redirect URL
    req.session.isRegistration = true;
    if (redirectTo) {
      req.session.redirectTo = redirectTo;
    }
    
    console.log(`[Auth Routes /login] Redirecting to direct registration flow URL: ${registrationUrl}`);
    return res.redirect(registrationUrl);
  }

  if (redirectTo) {
    req.session.redirectTo = redirectTo;
  }

  // Check if this is a SAML login request (Netzbegrünung)
  if (source === process.env.AUTHENTIK_NETZBEGRUENUNG_SOURCE_SLUG || source === 'netzbegruenung-login') {
    console.log('[Auth Routes /login] SAML login detected for Netzbegrünung source');
    
    // Check if SAML strategy is available
    const samlStrategy = passport._strategy('saml-netzbegruenung');
    
    if (!samlStrategy) {
      console.log('[Auth Routes /login] ❌ SAML strategy not configured, falling back to OIDC');
      // Fall back to OIDC if SAML is not configured
      req.session.preferredSource = source;
      let options = { scope: 'openid profile email offline_access', loginHint: source };
      passport.authenticate('oidc', options)(req, res, next);
      return;
    }
    
    // Clear any existing authentication to force fresh SAML login
    req.logout(function(err) {
      if (err) {
        console.log('[Auth Routes /login] Logout error (non-blocking):', err);
      }
    });
    
    // Store the source preference in session
    req.session.preferredSource = source;
    
    // Use SAML strategy for Netzbegrünung login
    console.log('[Auth Routes /login] Using SAML strategy for Netzbegrünung login');
    passport.authenticate('saml-netzbegruenung', {
      failureRedirect: '/auth/error',
      failureMessage: true,
      forceAuthn: true // Force fresh authentication
    })(req, res, next);
    return;
  }

  // Check if this is a SAML login request (Grünes Netz)
  if (source === process.env.AUTHENTIK_GRUENES_NETZ_SOURCE_SLUG || source === 'gruenes-netz-login') {
    console.log('[Auth Routes /login] SAML login detected for Grünes Netz source');
    
    // Check if SAML strategy is available
    const samlStrategy = passport._strategy('saml-gruenes-netz');
    
    if (!samlStrategy) {
      console.log('[Auth Routes /login] ❌ Grünes Netz SAML strategy not configured, falling back to OIDC');
      // Fall back to OIDC if SAML is not configured
      req.session.preferredSource = source;
      let options = { scope: 'openid profile email offline_access', loginHint: source };
      passport.authenticate('oidc', options)(req, res, next);
      return;
    }
    
    // Clear any existing authentication to force fresh SAML login
    req.logout(function(err) {
      if (err) {
        console.log('[Auth Routes /login] Logout error (non-blocking):', err);
      }
    });
    
    // Store the source preference in session
    req.session.preferredSource = source;
    
    // Use SAML strategy for Grünes Netz login
    console.log('[Auth Routes /login] Using SAML strategy for Grünes Netz login');
    passport.authenticate('saml-gruenes-netz', {
      failureRedirect: '/auth/error',
      failureMessage: true,
      forceAuthn: true // Force fresh authentication
    })(req, res, next);
    return;
  }

  // Default to OIDC for all other sources (gruenerator-login, etc.)
  console.log('[Auth Routes /login] Using OIDC flow (not Netzbegrünung SAML)');
  let options = {
    scope: 'openid profile email offline_access',
  };

  if (source) {
    req.session.preferredSource = source;
    if (source !== process.env.AUTHENTIK_GRUENERATOR_SOURCE_SLUG) {
        options.loginHint = source;
    }
  }
  console.log('[Auth Routes /login] PREPARING to call passport.authenticate with OIDC options:', options);
  passport.authenticate('oidc', options)(req, res, next);
  console.log('[Auth Routes /login] Executing passport.authenticate for OIDC login initiation.');
});

// OIDC callback
router.get('/callback',
  passport.authenticate('oidc', {
    failureRedirect: '/auth/error',
    failureMessage: true
  }),
  async (req, res, next) => {
    try {
      console.log('[AuthCallback] req.session at start of OIDC callback:', req.session);
      // At this point, req.user has already been set by the Passport strategy
      console.log('[AuthCallback] User authenticated successfully via OIDC:', req.user?.id);
      
      // Get redirect destination from session or use default
      const redirectTo = req.session.redirectTo || `${process.env.BASE_URL}/profile`;
      delete req.session.redirectTo;
      delete req.session.preferredSource;
      
      // Save session before redirect to ensure it persists
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

// SAML callback (for Netzbegrünung)
router.post('/saml/callback',
  passport.authenticate('saml-netzbegruenung', {
    failureRedirect: '/auth/error',
    failureMessage: true
  }),
  async (req, res, next) => {
    try {
      console.log('[SAMLCallback] req.session at start of SAML callback:', req.session);
      // At this point, req.user has already been set by the SAML strategy
      console.log('[SAMLCallback] User authenticated successfully via SAML:', req.user?.id);
      
      // Get redirect destination from session or use default
      const redirectTo = req.session.redirectTo || `${process.env.BASE_URL}/profile`;
      delete req.session.redirectTo;
      delete req.session.preferredSource;
      
      // Save session before redirect to ensure it persists
      req.session.save((err) => {
        if (err) {
          console.error('[SAMLCallback] Error saving session:', err);
        } else {
          console.log('[SAMLCallback] Session saved successfully');
        }
        console.log(`[SAMLCallback] Redirecting to: ${redirectTo}`);
        res.redirect(redirectTo);
      });
      
    } catch (error) {
      console.error('[SAMLCallback] General error in SAML callback:', error);
      console.error('[SAMLCallback] req.user in error handler:', req.user);
      next(error);
    }
  }
);

// SAML callback (for Grünes Netz)
router.post('/saml/gruenes-netz/callback',
  passport.authenticate('saml-gruenes-netz', {
    failureRedirect: '/auth/error',
    failureMessage: true
  }),
  async (req, res, next) => {
    try {
      console.log('[Grünes Netz SAMLCallback] req.session at start of SAML callback:', req.session);
      // At this point, req.user has already been set by the SAML strategy
      console.log('[Grünes Netz SAMLCallback] User authenticated successfully via SAML:', req.user?.id);
      
      // Get redirect destination from session or use default
      const redirectTo = req.session.redirectTo || `${process.env.BASE_URL}/profile`;
      delete req.session.redirectTo;
      delete req.session.preferredSource;
      
      // Save session before redirect to ensure it persists
      req.session.save((err) => {
        if (err) {
          console.error('[Grünes Netz SAMLCallback] Error saving session:', err);
        } else {
          console.log('[Grünes Netz SAMLCallback] Session saved successfully');
        }
        console.log(`[Grünes Netz SAMLCallback] Redirecting to: ${redirectTo}`);
        res.redirect(redirectTo);
      });
      
    } catch (error) {
      console.error('[Grünes Netz SAMLCallback] General error in SAML callback:', error);
      console.error('[Grünes Netz SAMLCallback] req.user in error handler:', req.user);
      next(error);
    }
  }
);

// SAML metadata endpoint (for Netzbegrünung SP configuration)
router.get('/saml/metadata', async (req, res) => {
  try {
    console.log('[SAML Metadata] Generating SP metadata for Netzbegrünung');
    
    // Import the passport strategy to get metadata generation
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    
    // We'll generate simple SP metadata for now
    // In production, this should use the actual strategy's generateServiceProviderMetadata method
    const spMetadata = `<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${process.env.AUTH_BASE_URL || process.env.BASE_URL}/api/auth/saml/callback">
  <md:SPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:NameIDFormat>urn:oasis:names:tc:SAML:2.0:nameid-format:persistent</md:NameIDFormat>
    <md:AssertionConsumerService isDefault="true" index="0" Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${process.env.AUTH_BASE_URL || process.env.BASE_URL}/api/auth/saml/callback"/>
  </md:SPSSODescriptor>
</md:EntityDescriptor>`;
    
    res.set('Content-Type', 'application/xml');
    res.send(spMetadata);
  } catch (error) {
    console.error('[SAML Metadata] Error generating metadata:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate SAML metadata'
    });
  }
});

// SAML metadata endpoint (for Grünes Netz SP configuration)
router.get('/saml/gruenes-netz/metadata', async (req, res) => {
  try {
    console.log('[SAML Metadata] Generating SP metadata for Grünes Netz');
    
    // Import the passport strategy to get metadata generation
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    
    // We'll generate simple SP metadata for now
    // In production, this should use the actual strategy's generateServiceProviderMetadata method
    const spMetadata = `<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${process.env.AUTH_BASE_URL || process.env.BASE_URL}/api/auth/saml/gruenes-netz/callback">
  <md:SPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:NameIDFormat>urn:oasis:names:tc:SAML:2.0:nameid-format:persistent</md:NameIDFormat>
    <md:AssertionConsumerService isDefault="true" index="0" Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${process.env.AUTH_BASE_URL || process.env.BASE_URL}/api/auth/saml/gruenes-netz/callback"/>
  </md:SPSSODescriptor>
</md:EntityDescriptor>`;
    
    res.set('Content-Type', 'application/xml');
    res.send(spMetadata);
  } catch (error) {
    console.error('[Grünes Netz SAML Metadata] Error generating metadata:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate Grünes Netz SAML metadata'
    });
  }
});

// Test if route registration works
console.log('[Auth Routes] ✅ Registering /status route at startup...');

// Get authentication status
router.get('/status', async (req, res) => {
  console.log('[Auth Status] *** ROUTE HIT *** - This should appear when /status is accessed');
  
  // Comprehensive logging to diagnose the issue
  console.log('\n========== AUTH STATUS ROUTE DEBUG ==========');
  console.log('[1] Initial Request State:', {
    sessionID: req.sessionID,
    hasSession: !!req.session,
    hasSessionCookie: !!req.headers.cookie?.includes('gruenerator.sid'),
    cookieHeader: req.headers.cookie,
    origin: req.headers.origin,
  });

  // Log session details
  if (req.session) {
    console.log('[2] Session Details:', {
      sessionID: req.session.id,
      cookie: req.session.cookie,
      passport: req.session.passport,
      hasPassportUser: !!req.session.passport?.user,
      passportUserId: req.session.passport?.user?.id,
    });
  }

  // Log user state before isAuthenticated check
  console.log('[3] User State (before isAuthenticated):', {
    hasUser: !!req.user,
    userId: req.user?.id,
    userObject: req.user ? Object.keys(req.user) : 'No user',
  });

  // Check if isAuthenticated is available and what it returns
  const isAuthResult = req.isAuthenticated ? req.isAuthenticated() : null;
  console.log('[4] isAuthenticated() result:', isAuthResult);

  // Force session reload to ensure it's current
  if (req.session && !req.user && req.session.passport?.user) {
    console.log('[5] Session has passport.user but req.user is missing - attempting manual deserialize');
    
    // Wait a tick to see if deserialization completes
    await new Promise(resolve => setImmediate(resolve));
    
    console.log('[6] After setImmediate - User state:', {
      hasUser: !!req.user,
      userId: req.user?.id,
      isAuthResult: req.isAuthenticated ? req.isAuthenticated() : null,
    });
  }

  // Log final decision
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
      // Create or refresh Supabase session for authenticated user
      let supabaseSession = req.user.supabaseSession;

      // Immer authUser laden, um die aktuelle user_metadata zu erhalten
      const { data: authUser } = await supabaseService.auth.admin.getUserById(req.user.id);

      // Füge user_metadata (inkl. beta_features) an req.user an, damit das Frontend sie sofort hat
      if (authUser?.user?.user_metadata) {
        req.user.user_metadata = authUser.user.user_metadata;
      }

      // Falls Session fehlt oder abgelaufen ist → neu erstellen
      if (!supabaseSession || (supabaseSession.expires_at && supabaseSession.expires_at < Math.floor(Date.now() / 1000))) {
        console.log('[Auth Status] Creating new Supabase session for user:', req.user.id);

        if (authUser?.user) {
          const { createSupabaseSessionForUser } = await import('../config/passportSetup.mjs');
          supabaseSession = await createSupabaseSessionForUser(authUser.user);

          // Update user object in session with new session
          req.user.supabaseSession = supabaseSession;

          // Persist updated user object (inkl. Session) in Passport session store
          if (req.session && req.session.passport) {
            req.session.passport.user = req.user;
            req.session.save((err) => {
              if (err) {
                console.warn('[Auth Status] Failed to persist Supabase session in express-session:', err.message);
              } else {
                console.log('[Auth Status] Supabase session persisted in express-session.');
              }
            });
          }
        }
      }

      res.json({
        isAuthenticated: true,
        user: req.user,
        supabaseSession: supabaseSession
      });
    } catch (error) {
      console.error('[Auth Status] Error creating Supabase session:', error);
      // Return user without Supabase session if creation fails
      res.json({
        isAuthenticated: true,
        user: req.user,
        supabaseSession: null,
        supabaseError: 'Failed to create Supabase session'
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
  console.log('[Auth Routes] STATUS-TEST ROUTE HIT!');
  res.json({ 
    message: 'Status test route works',
    timestamp: new Date().toISOString(),
    sessionID: req.sessionID
  });
});

// Error handling route
router.get('/error', (req, res) => {
  const errorMessage = req.query.message || 'An unspecified error occurred during authentication.';
  const authentikError = req.session?.messages?.slice(-1)[0];
  console.error(`[AuthErrorPage] Displaying error: ${errorMessage}`, authentikError ? `Authentik/OIDC Error: ${authentikError}` : '');
  if (req.session?.messages) delete req.session.messages;

  res.status(401).send(`Authentication Error: ${errorMessage}${authentikError ? ` - Details: ${authentikError}` : ''}`);
});

// Logout
router.get('/logout', (req, res, next) => {
  console.log("====== [Auth Routes GET /logout] ROUTE HIT ======");
  console.log("[Auth Routes GET /logout] process.env.AUTHENTIK_API_BASE_URL:", process.env.AUTHENTIK_API_BASE_URL);
  console.log("[Auth Routes GET /logout] process.env.BASE_URL:", process.env.BASE_URL);

  // Use AUTHENTIK_API_BASE_URL environment variable
  const authentikBaseUrl = process.env.AUTHENTIK_API_BASE_URL || 'https://auth.services.moritz-waechter.de';
  const authentikLogoutUrl = `${authentikBaseUrl}/application/o/gruenerator/end-session/`;
  const postLogoutRedirectUri = `${process.env.BASE_URL}/`;

  console.log(`[Auth Routes /logout] Using logout URL: ${authentikLogoutUrl}`);
  console.log(`[Auth Routes /logout] Post-logout redirect URI: ${postLogoutRedirectUri}`);

  req.logout(function(err) {
    if (err) { 
      console.error("Failed to logout user:", err);
      // Even if req.logout fails, try to destroy session and redirect
    }
    const idToken = req.user?.id_token; // Still attempt to get it for logging, if user object exists
    console.log("[Auth Routes GET /logout] ID Token from req.user (before session destroy):", idToken ? "Present" : "Not Present");

    // DEBUGGING: Session destruction disabled for debugging purposes
    /*
    req.session.destroy((sessionErr) => {
      if (sessionErr) {
        console.error("Failed to destroy session during logout.", sessionErr);
      }
      res.clearCookie('gruenerator.sid');
      console.log("[Auth Routes GET /logout] Session destroyed. Forcing redirect to /auth/logged-out for debugging.");
      // Force redirect to local logged-out page to enable re-login for debugging
      res.redirect(`${process.env.BASE_URL}/auth/logged-out`);
      return; // Ensure no further code in this handler is executed
    });
    */
    
    // DEBUGGING: Direct redirect without session destruction
    console.log("[Auth Routes GET /logout] Session destruction DISABLED for debugging. Logout complete.");
    res.status(200).json({ success: true, message: 'Logout completed' });

    // The following Authentik redirect code will be bypassed by the return above for now
    /* 
    try {
        const logoutUrl = new URL(authentikLogoutUrl);
        if (idToken) {
          logoutUrl.searchParams.append('id_token_hint', idToken);
        }
        logoutUrl.searchParams.append('post_logout_redirect_uri', postLogoutRedirectUri);
        
        console.log(`[Auth Routes GET /logout] Attempting to redirect to Authentik logout URL: ${logoutUrl.toString()}`);
        res.redirect(logoutUrl.toString());
      } catch (urlError) {
        console.error("Failed to create logout URL:", urlError);
        res.redirect(`${process.env.BASE_URL}/auth/logged-out`);
      }
    */
  });
});

// Seite, die nach dem Logout von Authentik angezeigt wird
router.get('/logged-out', (req, res) => {
  res.status(200).json({ success: true, message: 'Logout completed' });
});

// API endpoint for frontend-triggered logout (returns JSON instead of redirect)
router.post('/logout', (req, res, next) => {
  console.log("====== [Auth Routes POST /logout] ROUTE HIT ======");
  console.log("[Auth Routes POST /logout] process.env.AUTHENTIK_API_BASE_URL:", process.env.AUTHENTIK_API_BASE_URL);
  console.log("[Auth Routes POST /logout] process.env.BASE_URL:", process.env.BASE_URL);

  // Use AUTHENTIK_API_BASE_URL environment variable
  const authentikBaseUrl = process.env.AUTHENTIK_API_BASE_URL || 'https://auth.services.moritz-waechter.de';
  // Ensure the "gruenerator" slug is part of the path
  const authentikLogoutUrl = `${authentikBaseUrl}/application/o/gruenerator/end-session/`;
  const postLogoutRedirectUri = `${process.env.BASE_URL}/`;

  console.log(`[Auth Routes POST /logout] API logout requested`);

  req.logout(function(err) {
    if (err) { 
      console.error("Failed to logout user:", err);
      // Even if req.logout fails, try to destroy session and respond
    }
    const idToken = req.user?.id_token; // Still attempt to get it for logging
    console.log("[Auth Routes POST /logout] ID Token from req.user (before session destroy):", idToken ? "Present" : "Not Present");

    // DEBUGGING: Session destruction disabled for debugging purposes
    /*
    req.session.destroy((sessionErr) => {
      if (sessionErr) {
        console.error("Failed to destroy session during logout.", sessionErr);
      }
      res.clearCookie('gruenerator.sid');
      console.log("[Auth Routes POST /logout] Session destroyed. Forcing JSON response for successful local logout for debugging.");
      // Force JSON response indicating local logout success
      res.json({
        success: true,
        message: 'Local logout successful for debugging. Authentik logout temporarily bypassed.',
        logoutUrl: `${process.env.BASE_URL}/auth/logged-out` // Provide a dummy URL or the local one
      });
      return; // Ensure no further code in this handler is executed
    });
    */
    
    // DEBUGGING: Direct JSON response without session destruction
    console.log("[Auth Routes POST /logout] Session destruction DISABLED for debugging. Responding directly.");
    res.json({
      success: true,
      message: 'Local logout successful for debugging. Session destruction disabled.',
      debug: 'Session and cookie preserved for debugging'
    });

    // The following Authentik redirect code will be bypassed by the return above for now
    /*
    try {
        const logoutUrl = new URL(authentikLogoutUrl);
        if (idToken) {
          logoutUrl.searchParams.append('id_token_hint', idToken);
        }
        logoutUrl.searchParams.append('post_logout_redirect_uri', postLogoutRedirectUri);
        
        console.log(`[Auth Routes POST /logout] Constructed Authentik logout URL for JSON response: ${logoutUrl.toString()}`);
        res.json({
          success: true,
          message: 'Logout successful',
          logoutUrl: logoutUrl.toString()
        });
      } catch (urlError) {
        console.error("Failed to create logout URL:", urlError);
        res.json({
          success: true,
          message: 'Session cleared, but external logout may have failed',
          error: urlError.message
        });
      }
    */
  });
});

// Get user profile (example protected route)
router.get('/profile', ensureAuthenticated, (req, res) => {
  res.json({ user: req.user || null });
});

// === PROFILE MANAGEMENT ENDPOINTS ===

// Update user profile
router.put('/profile', ensureAuthenticated, async (req, res) => {
  try {
    console.log('[Auth Routes /profile PUT] Profile update request for user:', req.user.id);
    const { first_name, last_name, display_name, avatar_robot_id, email } = req.body;
    
    // Validate input
    if (avatar_robot_id && (avatar_robot_id < 1 || avatar_robot_id > 9)) {
      return res.status(400).json({
        success: false,
        message: 'Avatar Robot ID muss zwischen 1 und 9 liegen.'
      });
    }
    
    // Prepare update data
    const updateData = {
      id: req.user.id,
      updated_at: new Date().toISOString()
    };
    
    if (first_name !== undefined) updateData.first_name = first_name || null;
    if (last_name !== undefined) updateData.last_name = last_name || null;
    if (display_name !== undefined) updateData.display_name = display_name || null;
    if (avatar_robot_id !== undefined) updateData.avatar_robot_id = avatar_robot_id;
    if (email !== undefined) updateData.email = email || null;
    
    console.log('[Auth Routes /profile PUT] Update data:', updateData);
    
    // Update profile using Service Role Key (bypasses RLS)
    const { data, error } = await supabaseService
      .from('profiles')
      .upsert(updateData)
      .select()
      .single();
      
    if (error) {
      console.error('[Auth Routes /profile PUT] Supabase error:', error);
      throw new Error(error.message);
    }
    
    console.log('[Auth Routes /profile PUT] Profile updated successfully:', data.id);
    
    // Update user object in session
    if (req.user) {
      Object.assign(req.user, data);
    }
    
    res.json({ 
      success: true, 
      profile: data,
      message: 'Profil erfolgreich aktualisiert!'
    });
    
  } catch (error) {
    console.error('[Auth Routes /profile PUT] Error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Fehler beim Aktualisieren des Profils.'
    });
  }
});

// Update user avatar
router.patch('/profile/avatar', ensureAuthenticated, async (req, res) => {
  try {
    console.log('[Auth Routes /profile/avatar PATCH] Avatar update request for user:', req.user.id);
    const { avatar_robot_id } = req.body;
    
    // Validate avatar_robot_id
    if (!avatar_robot_id || avatar_robot_id < 1 || avatar_robot_id > 9) {
      return res.status(400).json({
        success: false,
        message: 'Avatar Robot ID muss zwischen 1 und 9 liegen.'
      });
    }
    
    // Update avatar using Service Role Key
    const { data, error } = await supabaseService
      .from('profiles')
      .upsert({
        id: req.user.id,
        avatar_robot_id: avatar_robot_id,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();
      
    if (error) {
      console.error('[Auth Routes /profile/avatar PATCH] Supabase error:', error);
      throw new Error(error.message);
    }
    
    console.log('[Auth Routes /profile/avatar PATCH] Avatar updated successfully');
    
    // Update user object in session
    if (req.user) {
      req.user.avatar_robot_id = avatar_robot_id;
    }
    
    res.json({ 
      success: true, 
      profile: data,
      message: 'Avatar erfolgreich aktualisiert!'
    });
    
  } catch (error) {
    console.error('[Auth Routes /profile/avatar PATCH] Error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Fehler beim Aktualisieren des Avatars.'
    });
  }
});

// Update user beta features
router.patch('/profile/beta-features', ensureAuthenticated, async (req, res) => {
  try {
    console.log('[Auth Routes /profile/beta-features PATCH] Beta features update for user:', req.user.id);
    const { feature, enabled } = req.body;
    
    if (!feature || typeof enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'Feature name und enabled status sind erforderlich.'
      });
    }
    
    // Get current user metadata from Supabase Auth
    const { data: authUser, error: getUserError } = await supabaseService.auth.admin.getUserById(req.user.id);
    
    if (getUserError) {
      console.error('[Auth Routes /profile/beta-features PATCH] Get user error:', getUserError);
      throw new Error('Benutzer nicht gefunden');
    }
    
    const currentMetadata = authUser.user.user_metadata || {};
    const currentBetaFeatures = currentMetadata.beta_features || {};
    
    // Update beta features
    const updatedBetaFeatures = {
      ...currentBetaFeatures,
      [feature]: enabled
    };
    
    const updatedMetadata = {
      ...currentMetadata,
      beta_features: updatedBetaFeatures
    };
    
    // Update user metadata in Supabase Auth
    const { error: updateError } = await supabaseService.auth.admin.updateUserById(req.user.id, {
      user_metadata: updatedMetadata
    });
    
    if (updateError) {
      console.error('[Auth Routes /profile/beta-features PATCH] Update error:', updateError);
      throw new Error('Beta Features konnten nicht aktualisiert werden');
    }
    
    console.log(`[Auth Routes /profile/beta-features PATCH] Beta feature '${feature}' updated to ${enabled}`);
    
    res.json({ 
      success: true, 
      betaFeatures: updatedBetaFeatures,
      message: 'Beta Features erfolgreich aktualisiert!'
    });
    
  } catch (error) {
    console.error('[Auth Routes /profile/beta-features PATCH] Error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Fehler beim Aktualisieren der Beta Features.'
    });
  }
});

// Update user message color
router.patch('/profile/message-color', ensureAuthenticated, async (req, res) => {
  try {
    console.log('[Auth Routes /profile/message-color PATCH] Message color update for user:', req.user.id);
    const { color } = req.body;
    
    if (!color || typeof color !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Farbe ist erforderlich.'
      });
    }
    
    // Get current user metadata from Supabase Auth
    const { data: authUser, error: getUserError } = await supabaseService.auth.admin.getUserById(req.user.id);
    
    if (getUserError) {
      console.error('[Auth Routes /profile/message-color PATCH] Get user error:', getUserError);
      throw new Error('Benutzer nicht gefunden');
    }
    
    const currentMetadata = authUser.user.user_metadata || {};
    
    // Update message color
    const updatedMetadata = {
      ...currentMetadata,
      chat_color: color
    };
    
    // Update user metadata in Supabase Auth
    const { error: updateError } = await supabaseService.auth.admin.updateUserById(req.user.id, {
      user_metadata: updatedMetadata
    });
    
    if (updateError) {
      console.error('[Auth Routes /profile/message-color PATCH] Update error:', updateError);
      throw new Error('Nachrichtenfarbe konnte nicht aktualisiert werden');
    }
    
    console.log(`[Auth Routes /profile/message-color PATCH] Message color updated to ${color}`);
    
    res.json({ 
      success: true, 
      messageColor: color,
      message: 'Nachrichtenfarbe erfolgreich aktualisiert!'
    });
    
  } catch (error) {
    console.error('[Auth Routes /profile/message-color PATCH] Error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Fehler beim Aktualisieren der Nachrichtenfarbe.'
    });
  }
});

// === END PROFILE MANAGEMENT ENDPOINTS ===

// API endpoint to get the OIDC client ID
router.get('/client-id', (req, res) => {
  // Implementation of getting client ID
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