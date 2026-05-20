/**
 * Boot-time backfill: assign Notion-style slug suffixes to every group that
 * predates the slug feature. Idempotent via a marker row in `schema_migrations`
 * — once present, future boots short-circuit immediately.
 *
 * Unlike the notebook backfill (Qdrant payloads), groups are relational: this
 * is a plain SQL UPDATE loop. Uniqueness is enforced by the partial unique
 * index `idx_groups_slug_suffix`; a collision (Postgres 23505) just triggers a
 * regenerate-and-retry. New groups always get a suffix at creation time, so
 * this only ever touches legacy rows.
 *
 * Runs after PostgresService init finishes its SQL migrations.
 */

import { generateSlugSuffix } from '@gruenerator/shared/utils';

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('backfillGroupSlugSuffixes');

const MARKER = '__node_group_slug_backfill_v1';
const UNIQUE_VIOLATION = '23505';
const MAX_ATTEMPTS = 5;

/**
 * Assign a fresh, collision-free suffix to one group. Returns true on success,
 * false if it lost every retry to a unique-index collision (astronomically
 * unlikely with a 56^6 keyspace, but bounded so we never loop forever).
 */
async function assignSuffix(groupId: string): Promise<boolean> {
  const postgres = getPostgresInstance();
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const suffix = generateSlugSuffix();
    try {
      await postgres.query(
        'UPDATE groups SET slug_suffix = $1 WHERE id = $2 AND slug_suffix IS NULL',
        [suffix, groupId]
      );
      return true;
    } catch (error) {
      if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
        continue;
      }
      throw error;
    }
  }
  return false;
}

/**
 * Run the backfill if it hasn't been recorded yet. Failures are swallowed with
 * a warning — the column is non-critical (UUID URLs still work) and we don't
 * want to block API startup on a transient DB hiccup.
 */
export async function backfillGroupSlugSuffixes(): Promise<void> {
  const postgres = getPostgresInstance();

  try {
    const alreadyRun = await postgres.query<{ filename: string }>(
      'SELECT filename FROM schema_migrations WHERE filename = $1 LIMIT 1',
      [MARKER]
    );
    if (alreadyRun.length > 0) {
      log.debug('[backfillGroupSlugSuffixes] Marker present, skipping');
      return;
    }
  } catch (error) {
    log.warn(
      '[backfillGroupSlugSuffixes] Could not read schema_migrations — skipping:',
      (error as Error).message
    );
    return;
  }

  log.info('[backfillGroupSlugSuffixes] Marker absent, running backfill');
  try {
    const rows = await postgres.query<{ id: string }>(
      'SELECT id FROM groups WHERE slug_suffix IS NULL'
    );

    let updated = 0;
    for (const { id } of rows) {
      if (await assignSuffix(id)) {
        updated++;
      } else {
        log.warn(`[backfillGroupSlugSuffixes] Gave up assigning suffix for group ${id}`);
      }
    }
    log.info(`[backfillGroupSlugSuffixes] Completed: scanned=${rows.length} updated=${updated}`);

    await postgres.query(
      'INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING',
      [MARKER]
    );
    log.info('[backfillGroupSlugSuffixes] Marker recorded');
  } catch (error) {
    log.warn(
      '[backfillGroupSlugSuffixes] Backfill failed (non-critical, will retry on next boot):',
      (error as Error).message
    );
  }
}
