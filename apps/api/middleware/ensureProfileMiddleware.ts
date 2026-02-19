/**
 * Middleware that ensures a profile row exists for the authenticated user.
 *
 * When Keycloak login succeeds but the initial profile INSERT fails (transient DB error),
 * the session stores a fallback user with `_profileSyncPending: true` and no DB row.
 * This middleware retries profile creation so downstream routes never hit FK violations.
 */

import { type Response, type NextFunction } from 'express';

import { getProfileService } from '../services/user/ProfileService.js';
import { createLogger } from '../utils/logger.js';

import { type AuthenticatedRequest } from './types.js';

const log = createLogger('ensureProfile');

export function ensureProfile(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const user = req.user as any;

  if (!user || user._profileSyncPending !== true) {
    return next();
  }

  createProfileIfMissing(user, req)
    .then((resolved) => {
      if (resolved) {
        req.user = resolved as any;
      }
      next();
    })
    .catch(() => {
      res.status(503).json({
        error: 'profile_unavailable',
        message: 'Profil konnte nicht erstellt werden. Bitte versuche es später erneut.',
      });
    });
}

async function createProfileIfMissing(user: any, req: AuthenticatedRequest): Promise<any | null> {
  const profileService = getProfileService();

  // Profile may already exist (created by deserializeUser retry)
  const existing = await profileService.getProfileById(user.id);
  if (existing) {
    clearPendingFlag(user, req);
    return existing;
  }

  // Try to create it
  const profile = await profileService.createProfile({
    id: user.id,
    keycloak_id: user.keycloak_id,
    email: user.email ?? undefined,
    display_name: user.display_name || user.username || 'User',
    username: user.username,
    locale: user.locale || 'de-DE',
    avatar_robot_id: 1,
    beta_features: {},
  } as Parameters<typeof profileService.createProfile>[0]);

  log.info(
    `[ensureProfile] Created missing profile ${profile.id} for keycloak_id ${user.keycloak_id}`
  );
  clearPendingFlag(user, req);
  return profile;
}

function clearPendingFlag(user: any, req: AuthenticatedRequest): void {
  delete user._profileSyncPending;
  delete user._profileSyncError;

  if (req.session?.passport?.user) {
    delete (req.session.passport.user as any)._profileSyncPending;
    delete (req.session.passport.user as any)._profileSyncError;
  }
}
