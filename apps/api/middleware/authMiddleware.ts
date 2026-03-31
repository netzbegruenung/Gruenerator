/**
 * Authentication Middleware
 * Uses Better Auth sessions (cookie or bearer token)
 */

import { fromNodeHeaders } from 'better-auth/node';
import { type Response, type NextFunction } from 'express';

import { auth, type BetterAuthUser } from '../config/betterAuth.js';
import { BRAND } from '../utils/domainUtils.js';

import { type AuthenticatedRequest } from './types.js';

async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
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

  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (session?.user) {
      req.user = toBetterAuthUser(session.user);
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
  if (!req.user) {
    requireAuth(req, res, next);
    return;
  }
  return next();
}

function toBetterAuthUser(user: BetterAuthUser): Express.User {
  return {
    id: user.id,
    email: user.email,
    display_name: user.name,
    avatar_robot_id: user.avatar_robot_id ?? 1,
    chat_color: user.chat_color ?? undefined,
    beta_features: {},
    user_defaults: {},
    locale: (user.locale as 'de-DE' | 'de-AT') ?? 'de-DE',
    keycloak_id: user.keycloak_id ?? undefined,
    username: user.username ?? undefined,
    groups_enabled: user.groups_enabled ?? false,
    custom_generators: user.custom_generators ?? false,
    database_access: user.database_access ?? false,
    collab: user.collab ?? false,
    notebook: user.notebook ?? false,
    sharepic: user.sharepic ?? false,
    anweisungen: user.anweisungen ?? false,
    labor_enabled: user.labor_enabled ?? false,
    sites_enabled: user.sites_enabled ?? true,
    chat: user.chat ?? false,
    interactive_antrag_enabled: user.interactive_antrag_enabled ?? true,
    vorlagen: user.vorlagen ?? false,
    video_editor: user.video_editor ?? false,
    bundestag_api_enabled: user.bundestag_api_enabled ?? false,
    memory_enabled: user.memory_enabled ?? false,
    created_at: user.createdAt,
    updated_at: user.updatedAt,
  };
}

export { requireAuth, requireAdmin };
export default { requireAuth, requireAdmin };
