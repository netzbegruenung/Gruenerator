/**
 * Boot-time backfill: assign Notion-style slug suffixes to every chat thread
 * that predates the slug feature. Idempotent via a marker row in
 * `schema_migrations` — once present, future boots short-circuit immediately.
 *
 * Plain SQL UPDATE loop like the group backfill. Uniqueness is enforced by the
 * partial unique index `idx_chat_threads_slug_suffix`; a collision (Postgres
 * 23505) just triggers a regenerate-and-retry. New threads always get a suffix
 * at creation time, so this only ever touches legacy rows.
 *
 * Runs after PostgresService init finishes its SQL migrations.
 */

import { generateSlugSuffix } from '@gruenerator/shared/utils';

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('backfillChatThreadSlugSuffixes');

const MARKER = '__node_chat_thread_slug_backfill_v1';
const UNIQUE_VIOLATION = '23505';
const MAX_ATTEMPTS = 5;

async function assignSuffix(threadId: string): Promise<boolean> {
  const postgres = getPostgresInstance();
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const suffix = generateSlugSuffix();
    try {
      await postgres.query(
        'UPDATE chat_threads SET slug_suffix = $1 WHERE id = $2 AND slug_suffix IS NULL',
        [suffix, threadId]
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
 * a warning — the column is non-critical (threads still open via the sidebar)
 * and we don't want to block API startup on a transient DB hiccup.
 */
export async function backfillChatThreadSlugSuffixes(): Promise<void> {
  const postgres = getPostgresInstance();

  try {
    const alreadyRun = await postgres.query<{ filename: string }>(
      'SELECT filename FROM schema_migrations WHERE filename = $1 LIMIT 1',
      [MARKER]
    );
    if (alreadyRun.length > 0) {
      log.debug('[backfillChatThreadSlugSuffixes] Marker present, skipping');
      return;
    }
  } catch (error) {
    log.warn(
      '[backfillChatThreadSlugSuffixes] Could not read schema_migrations — skipping:',
      (error as Error).message
    );
    return;
  }

  log.info('[backfillChatThreadSlugSuffixes] Marker absent, running backfill');
  try {
    const rows = await postgres.query<{ id: string }>(
      'SELECT id FROM chat_threads WHERE slug_suffix IS NULL'
    );

    let updated = 0;
    for (const { id } of rows) {
      if (await assignSuffix(id)) {
        updated++;
      } else {
        log.warn(`[backfillChatThreadSlugSuffixes] Gave up assigning suffix for thread ${id}`);
      }
    }
    log.info(
      `[backfillChatThreadSlugSuffixes] Completed: scanned=${rows.length} updated=${updated}`
    );

    await postgres.query(
      'INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING',
      [MARKER]
    );
    log.info('[backfillChatThreadSlugSuffixes] Marker recorded');
  } catch (error) {
    log.warn(
      '[backfillChatThreadSlugSuffixes] Backfill failed (non-critical, will retry on next boot):',
      (error as Error).message
    );
  }
}
