/**
 * Authentication Middleware for Keycloak SSO
 * Supports both JWT tokens (mobile) and Express sessions (web)
 */

import jwtAuthMiddleware from './jwtAuthMiddleware.js';
import { BRAND } from '../utils/domainUtils.js';

function requireAuth(req, res, next) {
  // SECURITY: Fail-fast if dev bypass is enabled in production
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEV_AUTH_BYPASS === 'true') {
    console.error('[CRITICAL SECURITY ALERT] Dev auth bypass is enabled in PRODUCTION environment - this is a critical security vulnerability!');
    console.error('[CRITICAL SECURITY ALERT] Blocking all requests. Set ALLOW_DEV_AUTH_BYPASS=false immediately!');
    return res.status(500).json({
      error: 'Critical security misconfiguration detected',
      message: 'Contact system administrator immediately'
    });
  }

  // Development-only auth bypass (requires explicit token)
  if (process.env.NODE_ENV === 'development' &&
      process.env.ALLOW_DEV_AUTH_BYPASS === 'true' &&
      process.env.DEV_AUTH_BYPASS_TOKEN) {

    const bypassToken = req.headers['x-dev-auth-bypass'] || req.query.dev_auth_token;

    if (bypassToken && bypassToken === process.env.DEV_AUTH_BYPASS_TOKEN) {
      console.warn('[Auth] DEV AUTH BYPASS USED - Development only!');
      req.user = {
        id: 'dev-user-123',
        email: BRAND.devEmail,
        display_name: 'Development User'
      };
      return next();
    }
  }

  jwtAuthMiddleware(req, res, (jwtError) => {
    if (!req.user && req.session?.passport?.user) {
      try {
        req.user = req.session.passport.user;
        if (typeof req.isAuthenticated !== 'function') {
          req.isAuthenticated = () => true;
        }
      } catch (attachErr) {
        // If anything goes wrong, continue to standard checks/logging
      }
    }

    if (req.isAuthenticated && req.isAuthenticated()) {
      return next();
    }

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

function requireAdmin(req, res, next) {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return requireAuth(req, res, next);
  }
  return next();
}

export { requireAuth, requireAdmin };
export default { requireAuth, requireAdmin };
