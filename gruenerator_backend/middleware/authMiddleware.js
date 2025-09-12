/**
 * Authentication Middleware for Keycloak SSO
 * Supports both JWT tokens (mobile) and Express sessions (web)
 */

const jwtAuthMiddleware = require('./jwtAuthMiddleware');

// Dual authentication middleware - supports both JWT and session auth
function requireAuth(req, res, next) {
  // Development environment bypass - always grant authentication
  if (process.env.NODE_ENV === 'development') {
    console.log('[AuthMiddleware] Development mode - bypassing authentication');
    req.user = { 
      id: 'dev-user-123', 
      email: 'dev@gruenerator.de',
      display_name: 'Development User'
    };
    return next();
  }

  // First try JWT authentication
  jwtAuthMiddleware(req, res, (jwtError) => {
    if (req.mobileAuth) {
      // JWT auth successful
      return next();
    }
    
    // Fall back to session-based auth
    // In this app, Passport session middleware is only attached on auth routes.
    // For API routes, recognize an authenticated session by checking req.session.passport.user
    if (!req.user && req.session?.passport?.user) {
      try {
        // Attach the passport user from the session to req.user for downstream handlers
        req.user = req.session.passport.user;
        // Provide isAuthenticated compatibility when passport.session() is not globally enabled
        if (typeof req.isAuthenticated !== 'function') {
          req.isAuthenticated = () => true;
        }
      } catch (attachErr) {
        // If anything goes wrong, continue to standard checks/logging
      }
    }

    console.log('[Auth] Checking authentication status:', {
      isAuthenticated: req.isAuthenticated ? req.isAuthenticated() : false,
      hasUser: !!req.user,
      sessionId: req.sessionID,
      url: req.originalUrl
    });

    if (req.isAuthenticated && req.isAuthenticated()) {
      console.log('[Auth] User authenticated:', { id: req.user?.id, email: req.user?.email });
      return next();
    }
    
    console.log('[Auth] User not authenticated, returning 401');
    
    // For API calls (JSON requests)
    if (req.headers['content-type'] === 'application/json' || 
        req.headers.accept === 'application/json' ||
        req.originalUrl.startsWith('/api/')) {
      return res.status(401).json({ 
        error: 'Authentication required',
        redirectUrl: '/auth/login'
      });
    }
    
    // For browser requests
    res.redirect('/auth/login');
  });
}

// Optional: Admin middleware (if you need admin-only routes)
function requireAdmin(req, res, next) {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return requireAuth(req, res, next);
  }
  
  // Add admin check logic here if needed
  // For now, just pass through
  return next();
}

module.exports = {
  requireAuth,
  requireAdmin
}; 