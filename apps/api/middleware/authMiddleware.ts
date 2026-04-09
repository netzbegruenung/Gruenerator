/**
 * Authentication Middleware
 * Uses Better Auth sessions (cookie or bearer token)
 */

import { fromNodeHeaders } from 'better-auth/node';
import { type Request, type Response, type NextFunction } from 'express';

import { auth, type BetterAuthUser } from '../config/betterAuth.js';
import { BRAND } from '../utils/domainUtils.js';

import { type AuthenticatedRequest } from './types.js';

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

function toBetterAuthUser(user: BetterAuthUser): Express.User {
  // Better Auth session user only has base fields — custom profile columns accessed via record cast
  const u = user as unknown as Record<string, unknown>;
  return {
    id: user.id,
    email: user.email,
    display_name: user.name,
    avatar_robot_id: (u.avatar_robot_id as number) ?? 1,
    ...(u.chat_color != null && { chat_color: u.chat_color as string }),
    beta_features: (u.beta_features as Record<string, boolean>) ?? {},
    user_defaults: (u.user_defaults as Record<string, Record<string, unknown>>) ?? {},
    ...(u.locale != null && { locale: u.locale as 'de-DE' | 'de-AT' }),
    ...(u.keycloak_id != null && { keycloak_id: u.keycloak_id as string }),
    ...(u.username != null && { username: u.username as string }),
    groups_enabled: (u.groups_enabled as boolean) ?? false,
    custom_generators: (u.custom_generators as boolean) ?? false,
    database_access: (u.database_access as boolean) ?? false,
    collab: (u.collab as boolean) ?? false,
    notebook: (u.notebook as boolean) ?? false,
    sharepic: (u.sharepic as boolean) ?? false,
    anweisungen: (u.anweisungen as boolean) ?? false,
    labor_enabled: (u.labor_enabled as boolean) ?? false,
    sites_enabled: (u.sites_enabled as boolean) ?? true,
    chat: (u.chat as boolean) ?? false,
    interactive_antrag_enabled: (u.interactive_antrag_enabled as boolean) ?? true,
    vorlagen: (u.vorlagen as boolean) ?? false,
    video_editor: (u.video_editor as boolean) ?? false,
    ...(u.bundestag_api_enabled != null && { bundestag_api_enabled: u.bundestag_api_enabled as boolean }),
    ...(u.memory_enabled != null && { memory_enabled: u.memory_enabled as boolean }),
    ...(u.wordpress_enabled != null && { wordpress_enabled: u.wordpress_enabled as boolean }),
    created_at: user.createdAt,
    updated_at: user.updatedAt,
  };
}

async function tryResolveUser(req: Request): Promise<Express.User | null> {
  if (
    process.env.NODE_ENV === 'development' &&
    process.env.ALLOW_DEV_AUTH_BYPASS === 'true' &&
    process.env.DEV_AUTH_BYPASS_TOKEN
  ) {
    const bypassToken = req.headers['x-dev-auth-bypass'] || req.query.dev_auth_token;
    if (bypassToken && bypassToken === process.env.DEV_AUTH_BYPASS_TOKEN) {
      return DEV_BYPASS_USER;
    }
  }

  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (session?.user) {
      return toBetterAuthUser(session.user);
    }
  } catch (err) {
    console.warn('[Auth] Session check failed for %s: %s', req.originalUrl, (err as Error).message);
  }

  return null;
}

async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEV_AUTH_BYPASS === 'true') {
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
    (req as AuthenticatedRequest).user = user;
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
    (req as AuthenticatedRequest).user = user;
  }
  return next();
}

export { requireAuth, requireAdmin, optionalAuth };
export default { requireAuth, requireAdmin, optionalAuth };
