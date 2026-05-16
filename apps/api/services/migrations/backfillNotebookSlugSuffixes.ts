/**
 * Boot-time backfill: assign Notion-style slug suffixes to every notebook
 * that predates the slug feature. Idempotent via a marker row in the
 * existing `schema_migrations` table — once the marker is present, future
 * boots short-circuit immediately.
 *
 * Runs after PostgresService init finishes its SQL migrations.
 */

import { NotebookQdrantHelper } from '../../database/services/NotebookQdrantHelper.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('backfillNotebookSlugSuffixes');

const MARKER = '__node_notebook_slug_backfill_v1';

/**
 * Run the backfill if it hasn't been recorded yet. Failures are swallowed
 * with a warning — the slug column is non-critical (UUID URLs still work)
 * and we don't want to block API startup on a Qdrant hiccup.
 */
export async function backfillNotebookSlugSuffixes(): Promise<void> {
  const postgres = getPostgresInstance();

  try {
    const alreadyRun = await postgres.query<{ filename: string }>(
      'SELECT filename FROM schema_migrations WHERE filename = $1 LIMIT 1',
      [MARKER]
    );
    if (alreadyRun.length > 0) {
      log.debug('[backfillNotebookSlugSuffixes] Marker present, skipping');
      return;
    }
  } catch (error) {
    log.warn(
      '[backfillNotebookSlugSuffixes] Could not read schema_migrations — skipping:',
      (error as Error).message
    );
    return;
  }

  log.info('[backfillNotebookSlugSuffixes] Marker absent, running backfill');
  try {
    const helper = new NotebookQdrantHelper();
    const result = await helper.backfillSlugSuffixes();
    log.info(
      `[backfillNotebookSlugSuffixes] Completed: scanned=${result.scanned} updated=${result.updated}`
    );

    await postgres.query(
      'INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING',
      [MARKER]
    );
    log.info('[backfillNotebookSlugSuffixes] Marker recorded');
  } catch (error) {
    log.warn(
      '[backfillNotebookSlugSuffixes] Backfill failed (non-critical, will retry on next boot):',
      (error as Error).message
    );
  }
}
