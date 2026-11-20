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
 *
 * Step 2 (#5851), own marker: once step 1 is recorded, delete the project
 * shares of notebooks that are still private. Those are no longer drift —
 * `addGroupShare` promotes now — but owners who went back to "Privat", which
 * since #5851 drops all shares, as it does for agents and recipes. Gated on
 * step 1's marker: running it before step 1 would delete the very rows step 1
 * exists to rescue.
 */

import { NotebookQdrantHelper } from '../../database/services/NotebookQdrantHelper.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { createLogger } from '../../utils/logger.js';
import { removeAllGroupShares } from '../groups/groupShareWriter.js';

const log = createLogger('backfillNotebookGroupShareMode');

const MARKER = '__node_notebook_group_sharemode_backfill_v1';
const PRIVATE_DROP_MARKER = '__node_notebook_private_drops_group_shares_v1';

async function hasMarker(marker: string): Promise<boolean> {
  const rows = await getPostgresInstance().query<{ filename: string }>(
    'SELECT filename FROM schema_migrations WHERE filename = $1 LIMIT 1',
    [marker]
  );
  return rows.length > 0;
}

async function recordMarker(marker: string): Promise<void> {
  await getPostgresInstance().query(
    'INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING',
    [marker]
  );
}

/**
 * Run the backfill if it hasn't been recorded yet. Failures are swallowed with
 * a warning — the next boot retries, and the dual-write fix in `shareContent`
 * already keeps new shares consistent, so we don't block API startup on a
 * Qdrant hiccup.
 */
export async function backfillNotebookGroupShareMode(): Promise<void> {
  const promoted = await promotePrivateSharedNotebooks();
  if (promoted) await dropSharesOfPrivateNotebooks();
}

/** Step 1. `true` once its marker is recorded (now or on an earlier boot). */
async function promotePrivateSharedNotebooks(): Promise<boolean> {
  try {
    if (await hasMarker(MARKER)) {
      log.debug('[backfillNotebookGroupShareMode] Marker present, skipping');
      return true;
    }
  } catch (error) {
    log.warn(
      '[backfillNotebookGroupShareMode] Could not read schema_migrations — skipping:',
      (error as Error).message
    );
    return false;
  }

  log.info('[backfillNotebookGroupShareMode] Marker absent, running backfill');
  try {
    const helper = new NotebookQdrantHelper();
    const result = await helper.backfillGroupShareModes();
    log.info(
      `[backfillNotebookGroupShareMode] Completed: scanned=${result.scanned} updated=${result.updated}`
    );
    await recordMarker(MARKER);
    log.info('[backfillNotebookGroupShareMode] Marker recorded');
    return true;
  } catch (error) {
    log.warn(
      '[backfillNotebookGroupShareMode] Backfill failed (non-critical, will retry on next boot):',
      (error as Error).message
    );
    return false;
  }
}

/** Step 2: forget the projects a private notebook was once in. */
async function dropSharesOfPrivateNotebooks(): Promise<void> {
  try {
    if (await hasMarker(PRIVATE_DROP_MARKER)) return;
    // Must run after step 1 — it promotes private+shared drift to 'groups',
    // and this would otherwise delete what step 1 rescues.
    const ids = await new NotebookQdrantHelper().listPrivateNotebookIdsWithGroupShares();
    let deleted = 0;
    for (const id of ids) {
      deleted += await removeAllGroupShares({ contentType: 'notebook_collections', contentId: id });
    }
    log.info(
      `[backfillNotebookGroupShareMode] Private notebooks left their projects: notebooks=${ids.length} deleted=${deleted}`
    );
    await recordMarker(PRIVATE_DROP_MARKER);
  } catch (error) {
    log.warn(
      '[backfillNotebookGroupShareMode] Private share cleanup failed (non-critical, will retry on next boot):',
      (error as Error).message
    );
  }
}
