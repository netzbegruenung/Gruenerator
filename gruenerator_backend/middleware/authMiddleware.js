/**
 * Authentication Middleware for Authentik SSO
 * Uses Express sessions and Passport authentication
 */

// Session-based authentication middleware for Authentik SSO
function requireAuth(req, res, next) {
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