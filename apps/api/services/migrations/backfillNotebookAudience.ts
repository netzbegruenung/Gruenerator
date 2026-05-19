/**
 * Boot-time backfill: rewrite legacy `audience='all'` (and rows missing the
 * field) on `notebook_collections` to the owner's actual locale. After this
 * runs once, the `'all'` audience value is gone from production data and the
 * Zod enum can safely be narrowed to `'de-DE' | 'de-AT'`.
 *
 * Idempotent via a marker row in `schema_migrations`. Runs after PostgresService
 * init finishes its SQL migrations and after the slug-suffix backfill.
 */

import { NotebookQdrantHelper } from '../../database/services/NotebookQdrantHelper.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('backfillNotebookAudience');

const MARKER = '__node_notebook_audience_backfill_v1';

export async function backfillNotebookAudience(): Promise<void> {
  const postgres = getPostgresInstance();

  try {
    const alreadyRun = await postgres.query<{ filename: string }>(
      'SELECT filename FROM schema_migrations WHERE filename = $1 LIMIT 1',
      [MARKER]
    );
    if (alreadyRun.length > 0) {
      log.debug('[backfillNotebookAudience] Marker present, skipping');
      return;
    }
  } catch (error) {
    log.warn(
      '[backfillNotebookAudience] Could not read schema_migrations — skipping:',
      (error as Error).message
    );
    return;
  }

  log.info('[backfillNotebookAudience] Marker absent, running backfill');
  try {
    const helper = new NotebookQdrantHelper();
    const result = await helper.backfillAudience();
    log.info(
      `[backfillNotebookAudience] Completed: scanned=${result.scanned} updated=${result.updated}`
    );

    await postgres.query(
      'INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING',
      [MARKER]
    );
    log.info('[backfillNotebookAudience] Marker recorded');
  } catch (error) {
    log.warn(
      '[backfillNotebookAudience] Backfill failed (non-critical, will retry on next boot):',
      (error as Error).message
    );
  }
}
