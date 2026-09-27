/**
 * Boot-time backfill: apply the Landesverband derivation (see
 * LandesverbandDerivationService) to every profile that already had a
 * `profile.roles` selection before this feature existed, so nobody has to
 * re-save their role to get assigned. Idempotent via a marker row in
 * `schema_migrations` — once present, future boots short-circuit immediately.
 *
 * Runs after PostgresService init finishes its SQL migrations.
 */
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { createLogger } from '../../utils/logger.js';
import { deriveLandesverbandFromRoles } from '../landesverband/LandesverbandDerivationService.js';

const log = createLogger('backfillLandesverbandAssignment');

const MARKER = '__node_landesverband_backfill_v1';

interface ProfileDefaultsRow {
  id: string;
  user_defaults: Record<string, Record<string, unknown>> | null;
}

export async function backfillLandesverbandAssignment(): Promise<void> {
  const postgres = getPostgresInstance();

  try {
    const alreadyRun = await postgres.query<{ filename: string }>(
      'SELECT filename FROM schema_migrations WHERE filename = $1 LIMIT 1',
      [MARKER]
    );
    if (alreadyRun.length > 0) {
      log.debug('[backfillLandesverbandAssignment] Marker present, skipping');
      return;
    }
  } catch (error) {
    log.warn(
      '[backfillLandesverbandAssignment] Could not read schema_migrations — skipping:',
      (error as Error).message
    );
    return;
  }

  log.info('[backfillLandesverbandAssignment] Marker absent, running backfill');
  try {
    const rows = await postgres.query<ProfileDefaultsRow>(
      'SELECT id, user_defaults FROM profiles WHERE landesverband_id IS NULL'
    );

    let updated = 0;
    for (const { id, user_defaults } of rows) {
      const roles = user_defaults?.profile?.roles;
      if (!Array.isArray(roles) || roles.length === 0) continue;
      await deriveLandesverbandFromRoles(id, roles as { bundesland?: string }[]);
      updated++;
    }
    log.info(
      `[backfillLandesverbandAssignment] Completed: scanned=${rows.length} touched=${updated}`
    );

    await postgres.query(
      'INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING',
      [MARKER]
    );
    log.info('[backfillLandesverbandAssignment] Marker recorded');
  } catch (error) {
    log.warn(
      '[backfillLandesverbandAssignment] Backfill failed (non-critical, will retry on next boot):',
      (error as Error).message
    );
  }
}
