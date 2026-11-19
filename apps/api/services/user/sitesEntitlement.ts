/**
 * Who may use Sites, the candidate-site builder.
 *
 * The one place that answers the question. In the test version only accounts an
 * instance admin has unlocked (`profiles.sites_unlocked`) and instance admins
 * (`profiles.is_admin`, the DB column only, as in the web gate and Hocuspocus)
 * may use it; without a decision the answer is no.
 *
 * Read fresh from the database, not from the session: the session snapshot of
 * the person an admin just switched lags behind by the cookie cache.
 *
 * `profiles.sites_enabled` is a different flag: an older, self-service switch
 * that defaults to `true` and therefore cannot express an unlock.
 */

import { type RequestHandler } from 'express';

import { getProfileService } from './ProfileService.js';

export function isSitesEntitled(decision: boolean | null | undefined): boolean {
  return decision === true;
}

export async function isUserSitesEntitled(userId: string): Promise<boolean> {
  const profile = await getProfileService().getProfileById(userId);
  return isSitesEntitled(profile?.sites_unlocked) || profile?.is_admin === true;
}

export const requireSitesAccess: RequestHandler = async (req, res, next) => {
  const userId = (req as { user?: { id?: string } }).user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Nicht authentifiziert' });
    return;
  }
  try {
    if (!(await isUserSitesEntitled(userId))) {
      res.status(403).json({ error: 'Sites ist für dein Konto nicht freigeschaltet' });
      return;
    }
  } catch (error) {
    next(error);
    return;
  }
  next();
};
