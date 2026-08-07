/**
 * Derives `profiles.landesverband_id` from the user's existing self-reported
 * roles (`user_defaults.profile.roles[].bundesland`) — there is no separate
 * onboarding step or email-domain auto-match. The first role (in array
 * order) that carries a `bundesland` wins; roles without one (e.g. Bund-Ebene)
 * are skipped, so a user with no Land-level role correctly stays unassigned.
 *
 * Called from ProfileService.updateUserDefault/setUserDefaultsGenerator
 * whenever `profile.roles` is written, and from the one-time boot backfill
 * for pre-existing role selections (backfillLandesverbandAssignment.ts).
 */
import { slugifyName } from '@gruenerator/shared/utils';

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('LandesverbandDerivationService');

interface RoleWithBundesland {
  bundesland?: string;
}

function findLandesverbandSlug(roles: RoleWithBundesland[] | null | undefined): string | null {
  if (!Array.isArray(roles)) return null;
  const withBundesland = roles.find(
    (role) => typeof role?.bundesland === 'string' && role.bundesland.trim().length > 0
  );
  if (!withBundesland?.bundesland) return null;
  return slugifyName(withBundesland.bundesland);
}

/**
 * Best-effort: never throws, so a derivation hiccup can't block the caller
 * from saving the user's role selection.
 */
export async function deriveLandesverbandFromRoles(
  userId: string,
  roles: RoleWithBundesland[] | null | undefined
): Promise<void> {
  try {
    const slug = findLandesverbandSlug(roles);
    const postgres = getPostgresInstance();

    if (!slug) {
      await postgres.query(
        'UPDATE profiles SET landesverband_id = NULL WHERE id = $1 AND landesverband_id IS NOT NULL',
        [userId]
      );
      return;
    }

    const landesverband = await postgres.queryOne('SELECT id FROM landesverbaende WHERE id = $1', [
      slug,
    ]);
    if (!landesverband) {
      log.warn(
        `[deriveLandesverbandFromRoles] No landesverband matches slug "${slug}" (user=${userId}) — leaving landesverband_id unchanged`
      );
      return;
    }

    await postgres.query('UPDATE profiles SET landesverband_id = $1 WHERE id = $2', [slug, userId]);
  } catch (error) {
    log.warn(`[deriveLandesverbandFromRoles] Failed for user ${userId}:`, (error as Error).message);
  }
}
