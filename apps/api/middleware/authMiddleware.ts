/**
 * Authentication Middleware
 * Uses Better Auth sessions (cookie or bearer token)
 */

import { userProfileSchema, type UserProfile } from '@gruenerator/contracts';
import { fromNodeHeaders } from 'better-auth/node';
import { type Request, type Response, type NextFunction } from 'express';

import { auth, type BetterAuthUser } from '../config/betterAuth.js';
import { env } from '../config/env.js';
import { BRAND } from '../utils/domainUtils.js';
import { createLogger } from '../utils/logger.js';

import { type AuthenticatedRequest } from './types.js';

const log = createLogger('authMiddleware');

const DEV_BYPASS_USER: Express.User = {
  id: '00000000-0000-4000-a000-000000000001',
  email: BRAND.devEmail,
  display_name: 'Development User',
  avatar_robot_id: 1,
  beta_features: {},
  user_defaults: {},
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
  wordpress_enabled: true,
  created_at: new Date(),
  updated_at: new Date(),
};

function toBetterAuthUser(user: BetterAuthUser): UserProfile {
  // Better Auth's `$Infer.Session.user` already includes every `additionalFields`
  // column from config/betterAuth.ts — no cast needed to read custom columns.
  // Two storage quirks to smooth over before Zod parsing:
  //  1. Better Auth stores unset optional columns as SQL NULL, but Zod's
  //     `.default()` only triggers on `undefined`. We coerce `null → undefined`
  //     so the schema's defaults (mirroring additionalFields.defaultValue)
  //     kick in.
  //  2. Better Auth's base fields are named `name` / `createdAt` / `updatedAt`
  //     while our canonical schema uses `display_name` / `created_at` /
  //     `updated_at`. We rename at the boundary.
  // Any residual type mismatch (e.g. Better Auth returning a string where we
  // expect a number) throws ZodError at login instead of cascading as
  // undefined through the render tree.
  const nullStripped = Object.fromEntries(
    Object.entries(user).map(([k, v]) => [k, v === null ? undefined : v])
  );
  return userProfileSchema.parse({
    ...nullStripped,
    display_name: user.name,
    created_at: user.createdAt,
    updated_at: user.updatedAt,
  });
}

async function tryResolveUser(req: Request): Promise<Express.User | null> {
  if (
    env.NODE_ENV === 'development' &&
    env.ALLOW_DEV_AUTH_BYPASS &&
    env.DEV_AUTH_BYPASS_TOKEN != null
  ) {
    const bypassToken = req.headers['x-dev-auth-bypass'] || req.query.dev_auth_token;
    if (bypassToken && bypassToken === env.DEV_AUTH_BYPASS_TOKEN) {
      return DEV_BYPASS_USER;
    }
  }

  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (session?.user) {
      log.debug(
        '[Auth] Session resolved: user_id=%s, email=%s, url=%s',
        session.user.id,
        session.user.email,
        req.originalUrl
      );
      return toBetterAuthUser(session.user);
    }
    // No session was returned (no cookie / expired / no Bearer token).
    // This is the common "user not logged in" path; log at debug to avoid noise.
    log.debug(
      '[Auth] No session for %s (cookie=%s, authorization=%s)',
      req.originalUrl,
      req.headers.cookie ? 'present' : 'absent',
      req.headers.authorization ? 'present' : 'absent'
    );
  } catch (err) {
    log.error('[Auth] Session check threw for %s: %s', req.originalUrl, (err as Error).message);
  }

  return null;
}

async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (env.NODE_ENV === 'production' && env.ALLOW_DEV_AUTH_BYPASS) {
    console.error(
      '[CRITICAL SECURITY ALERT] Dev auth bypass is enabled in PRODUCTION environment!'
    );
    res.status(500).json({
      error: 'Critical security misconfiguration detected',
      message: 'Contact system administrator immediately',
    });
    return;
  }

  const user = await tryResolveUser(req);
  if (user) {
    req.user = user;
    return next();
  }

  if (
    req.headers['content-type'] === 'application/json' ||
    req.headers.accept === 'application/json' ||
    req.originalUrl.startsWith('/api/')
  ) {
    console.warn('[Auth] 401 — %s %s (no valid session)', req.method, req.originalUrl);
    res.status(401).json({
      error: 'Authentication required',
      redirectUrl: '/auth/login',
    });
    return;
  }

  res.redirect('/auth/login');
}

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.user) {
    void requireAuth(req, res, next);
    return;
  }
  return next();
}

async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (!req.headers.cookie && !req.headers.authorization && !req.headers['x-dev-auth-bypass']) {
    return next();
  }

  const user = await tryResolveUser(req);
  if (user) {
    req.user = user;
  }
  return next();
}

export { requireAuth, requireAdmin, optionalAuth };
export default { requireAuth, requireAdmin, optionalAuth };
