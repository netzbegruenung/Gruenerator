/**
 * Boot-time backfill: promote notebooks that have a `group_content_shares` row
 * but are still `share_mode='private'` to `share_mode='groups'`. Those
 * notebooks return "Kein Zugriff" to their group members because
 * checkNotebookAccess gates group reads on share_mode='groups' — the drift
 * comes from the generic group "share content" path, which historically wrote
 * the share row without promoting share_mode. Idempotent via a marker row in
 * the existing `schema_migrations` table — once present, future boots
 * short-circuit immediately.
 *
 * Runs after PostgresService init finishes its SQL migrations and the other
 * notebook backfills.
 */

import { NotebookQdrantHelper } from '../../database/services/NotebookQdrantHelper.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('backfillNotebookGroupShareMode');

const MARKER = '__node_notebook_group_sharemode_backfill_v1';

/**
 * Run the backfill if it hasn't been recorded yet. Failures are swallowed with
 * a warning — the next boot retries, and the dual-write fix in `shareContent`
 * already keeps new shares consistent, so we don't block API startup on a
 * Qdrant hiccup.
 */
export async function backfillNotebookGroupShareMode(): Promise<void> {
  const postgres = getPostgresInstance();

  try {
    const alreadyRun = await postgres.query<{ filename: string }>(
      'SELECT filename FROM schema_migrations WHERE filename = $1 LIMIT 1',
      [MARKER]
    );
    if (alreadyRun.length > 0) {
      log.debug('[backfillNotebookGroupShareMode] Marker present, skipping');
      return;
    }
  } catch (error) {
    log.warn(
      '[backfillNotebookGroupShareMode] Could not read schema_migrations — skipping:',
      (error as Error).message
    );
    return;
  }

  log.info('[backfillNotebookGroupShareMode] Marker absent, running backfill');
  try {
    const helper = new NotebookQdrantHelper();
    const result = await helper.backfillGroupShareModes();
    log.info(
      `[backfillNotebookGroupShareMode] Completed: scanned=${result.scanned} updated=${result.updated}`
    );

    await postgres.query(
      'INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING',
      [MARKER]
    );
    log.info('[backfillNotebookGroupShareMode] Marker recorded');
  } catch (error) {
    log.warn(
      '[backfillNotebookGroupShareMode] Backfill failed (non-critical, will retry on next boot):',
      (error as Error).message
    );
  }
}
