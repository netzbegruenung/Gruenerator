/**
 * Authentication Middleware
 * Uses Better Auth sessions (cookie or bearer token)
 */

import { fromNodeHeaders } from 'better-auth/node';
import { type Response, type NextFunction } from 'express';

import { auth } from '../config/betterAuth.js';
import { BRAND } from '../utils/domainUtils.js';

import { type AuthenticatedRequest } from './types.js';

async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  // SECURITY: Fail-fast if dev bypass is enabled in production
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEV_AUTH_BYPASS === 'true') {
    console.error(
      '[CRITICAL SECURITY ALERT] Dev auth bypass is enabled in PRODUCTION environment - this is a critical security vulnerability!'
    );
    res.status(500).json({
      error: 'Critical security misconfiguration detected',
      message: 'Contact system administrator immediately',
    });
    return;
  }

  // Development-only auth bypass (requires explicit token)
  if (
    process.env.NODE_ENV === 'development' &&
    process.env.ALLOW_DEV_AUTH_BYPASS === 'true' &&
    process.env.DEV_AUTH_BYPASS_TOKEN
  ) {
    const bypassToken = req.headers['x-dev-auth-bypass'] || req.query.dev_auth_token;

    if (bypassToken && bypassToken === process.env.DEV_AUTH_BYPASS_TOKEN) {
      req.user = {
        id: '00000000-0000-4000-a000-000000000001',
        email: BRAND.devEmail,
        display_name: 'Development User',
        avatar_robot_id: 1,
        beta_features: {},
        user_defaults: {},
        igel_modus: false,
        groups_enabled: false,
        custom_generators: false,
        database_access: false,
        collab: false,
        notebook: false,
        sharepic: false,
        anweisungen: false,
        labor_enabled: false,
        sites_enabled: false,
        chat: false,
        interactive_antrag_enabled: false,
        vorlagen: false,
        video_editor: false,
        created_at: new Date(),
        updated_at: new Date(),
      };
      return next();
    }
  }

  // Better Auth session (cookie or bearer token)
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (session?.user) {
      req.user = session.user as any;
      if (typeof req.isAuthenticated !== 'function') {
        (req as any).isAuthenticated = () => true;
      }
      return next();
    }
  } catch {
    // Session check failed
  }

  if (
    req.headers['content-type'] === 'application/json' ||
    req.headers.accept === 'application/json' ||
    req.originalUrl.startsWith('/api/')
  ) {
    res.status(401).json({
      error: 'Authentication required',
      redirectUrl: '/auth/login',
    });
    return;
  }

  res.redirect('/auth/login');
}

function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    requireAuth(req, res, next);
    return;
  }
  return next();
}

export { requireAuth, requireAdmin };
export default { requireAuth, requireAdmin };
