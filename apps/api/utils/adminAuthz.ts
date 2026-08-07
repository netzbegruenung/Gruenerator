/**
 * Shared admin authorization checks. `requireInstanceAdmin` replaces the
 * previously duplicated `verifyAdmin` (adminTemplates.ts) and `checkIsAdmin`
 * (skillVisibilityContractRouter.ts) — same logic, one place. Both call sites
 * keep their own response-writing mechanics (raw Express vs ts-rest), only
 * the underlying DB/env check is deduplicated here.
 *
 * `requireLandesverbandAdmin` is new: a global instance-admin passes too (a
 * super-admin can always act on any Landesverband), otherwise it checks for
 * an explicit `landesverband_admins` row. Callers MUST pass the
 * `landesverbandId` taken from the URL path (never only from the body), and
 * every query that follows in the same handler must reuse that exact,
 * already-verified value in its own `WHERE landesverband_id = ...` clause —
 * this is the structural guarantee behind scope isolation between LVs.
 */
import { getPostgresInstance } from '../database/services/PostgresService.js';

import { isAdminByEmail } from './adminEmails.js';
import { createLogger } from './logger.js';

const log = createLogger('adminAuthz');

export async function requireInstanceAdmin(
  userId: string,
  email?: string | null
): Promise<boolean> {
  if (isAdminByEmail(email)) return true;
  const postgres = getPostgresInstance();
  const profile = await postgres.queryOne(
    'SELECT is_admin, email FROM profiles WHERE id = $1',
    [userId],
    { table: 'profiles' }
  );
  const allowed = Boolean(profile?.is_admin);
  if (!allowed) {
    log.warn(
      '[adminAuthz] instance admin check denied: session user_id=%s session_email=%s profile_found=%s profile_email=%s profile_is_admin=%s',
      userId,
      email ?? '(none)',
      profile ? 'yes' : 'no',
      profile?.email ?? '(null)',
      profile?.is_admin
    );
  }
  return allowed;
}

export async function requireLandesverbandAdmin(
  userId: string,
  landesverbandId: string,
  email?: string | null
): Promise<boolean> {
  if (await requireInstanceAdmin(userId, email)) return true;

  const postgres = getPostgresInstance();
  const row = await postgres.queryOne(
    'SELECT 1 FROM landesverband_admins WHERE landesverband_id = $1 AND user_id = $2',
    [landesverbandId, userId],
    { table: 'landesverband_admins' }
  );
  const allowed = row !== null;
  if (!allowed) {
    log.warn(
      '[adminAuthz] landesverband admin check denied: session user_id=%s landesverband_id=%s',
      userId,
      landesverbandId
    );
  }
  return allowed;
}
