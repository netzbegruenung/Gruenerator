/**
 * Authentication Middleware for Keycloak SSO
 * Supports both JWT tokens (mobile) and Express sessions (web)
 */

const jwtAuthMiddleware = require('./jwtAuthMiddleware');
const { BRAND } = require('../utils/domainUtils.js');

// MOBILE AUTH DISABLED - Mobile token rate limiting
// const mobileTokenRateLimiter = new Map();
// const MOBILE_TOKEN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
// const MOBILE_TOKEN_MAX_REQUESTS = 100; // 100 requests per window

// function checkMobileTokenRateLimit(token) {
//   const now = Date.now();
//   const key = `mobile_token:${token}`;

//   if (!mobileTokenRateLimiter.has(key)) {
//     mobileTokenRateLimiter.set(key, { count: 1, resetAt: now + MOBILE_TOKEN_WINDOW_MS });
//     return { allowed: true, remaining: MOBILE_TOKEN_MAX_REQUESTS - 1 };
//   }

//   const record = mobileTokenRateLimiter.get(key);

//   if (now > record.resetAt) {
//     mobileTokenRateLimiter.set(key, { count: 1, resetAt: now + MOBILE_TOKEN_WINDOW_MS });
//     return { allowed: true, remaining: MOBILE_TOKEN_MAX_REQUESTS - 1 };
//   }

//   if (record.count >= MOBILE_TOKEN_MAX_REQUESTS) {
//     return {
//       allowed: false,
//       remaining: 0,
//       retryAfter: Math.ceil((record.resetAt - now) / 1000)
//     };
//   }

//   record.count++;
//   return { allowed: true, remaining: MOBILE_TOKEN_MAX_REQUESTS - record.count };
// }

// setInterval(() => {
//   const now = Date.now();
//   for (const [key, record] of mobileTokenRateLimiter.entries()) {
//     if (now > record.resetAt) {
//       mobileTokenRateLimiter.delete(key);
//     }
//   }
// }, 60 * 60 * 1000);

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

  // MOBILE AUTH DISABLED - Mobile app token authentication
  // const appToken = req.headers['x-app-token'];
  // if (appToken && process.env.MOBILE_APP_TOKEN && appToken === process.env.MOBILE_APP_TOKEN) {
  //   const rateLimitResult = checkMobileTokenRateLimit(appToken);

  //   if (!rateLimitResult.allowed) {
  //     console.warn('[Auth] Mobile token rate limit exceeded');
  //     return res.status(429).json({
  //       error: 'Rate limit exceeded',
  //       retryAfter: rateLimitResult.retryAfter
  //     });
  //   }

  //   req.user = {
  //     id: 'mobile-app',
  //     email: 'app@gruenerator.de',
  //     display_name: 'Mobile App',
  //     isMobileApp: true
  //   };
  //   return next();
  // }

  jwtAuthMiddleware(req, res, (jwtError) => {
    // MOBILE AUTH DISABLED
    // if (req.mobileAuth) {
    //   return next();
    // }

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