/**
 * Push-ingest module — everything the external `/api/v1/push/*` endpoint needs.
 *
 * The WordPress `gruenerator-sync` plugin (and any future push client) calls the
 * thin contract router, which dispatches on the request's `target` to one of the
 * two targets here:
 *   - landesverbandTarget — curated LV system collections (scraper-equivalent)
 *   - notebookTarget       — user notebooks
 *
 * The push heartbeat (touched by the LV target) is read by the scheduled scraper
 * to back off for actively-pushing sources.
 */
export {
  ingestLandesverbandArticle,
  deleteLandesverbandArticle,
  type LandesverbandIngestInput,
  type IngestOutcome,
  type DeleteOutcome,
} from './landesverbandTarget.js';

export {
  ingestNotebookArticle,
  deleteNotebookArticle,
  type NotebookIngestInput,
} from './notebookTarget.js';

export { PushIngestError } from './errors.js';
export {
  getPushActiveSourceIds,
  touchPushHeartbeat,
  getPushFreshnessHours,
} from './pushHeartbeat.js';
