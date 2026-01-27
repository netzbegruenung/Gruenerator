/**
 * JWT Authentication Middleware
 *
 * Validates Bearer tokens from mobile/desktop apps and attaches user to request.
 * Falls through to session-based auth if no Bearer token is present.
 *
 * Usage: Apply before routes that need to support both session and JWT auth.
 */

import { jwtVerify } from 'jose';

import type { UserProfile } from '../services/user/types.js';
import type { Request, Response, NextFunction } from 'express';

const JWT_SECRET = new TextEncoder().encode(
  process.env.SESSION_SECRET || 'fallback-secret-please-change'
);

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      jwtAuth?: boolean;
      jwtUserId?: string;
    }
  }
}

/**
 * JWT Authentication Middleware
 *
 * Checks for Bearer token in Authorization header:
 * - If valid: loads user and attaches to req.user, sets req.jwtAuth = true
 * - If invalid/expired: returns 401 (don't fall through to session)
 * - If absent: falls through to session-based auth (next())
 */
async function jwtAuthMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  // No Bearer token - fall through to session auth
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.substring(7);

  // Empty token after "Bearer " - fall through
  if (!token) {
    return next();
  }

  try {
    // Verify the JWT
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      issuer: 'gruenerator-api',
      audience: 'gruenerator-app',
    });

    // Validate payload
    if (payload.token_use !== 'access' || !payload.sub) {
      res.status(401).json({
        success: false,
        error: 'invalid_token',
        message: 'Invalid token type',
      });
      return;
    }

    const userId = payload.sub as string;

    // Load user from database
    const { getProfileService } = await import('../services/user/ProfileService.js');
    const profileService = getProfileService();
    const user = await profileService.getProfileById(userId);

    if (!user) {
      res.status(401).json({
        success: false,
        error: 'user_not_found',
        message: 'User account not found',
      });
      return;
    }

    // Attach user to request
    req.user = user as UserProfile & { id_token?: string };
    req.jwtAuth = true;
    req.jwtUserId = userId;

    return next();
  } catch (_error) {
    // JWT verification failed - return 401, don't fall through
    // This prevents confused auth state where session auth might succeed
    // after JWT auth was explicitly attempted
    res.status(401).json({
      success: false,
      error: 'invalid_token',
      message: 'Access token is invalid or expired',
    });
    return;
  }
}

export default jwtAuthMiddleware;
