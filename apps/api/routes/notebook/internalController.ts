import { Router, type Request, type Response } from 'express';

import { requireAdminToken } from '../../middleware/adminTokenMiddleware.js';
import {
  enrichAllCollections,
  enrichCollection,
  type EnrichmentMode,
} from '../../services/notebook/notebookEnrichmentService.js';
import {
  refreshAllKeywordSnapshots,
  refreshKeywordSnapshot,
} from '../../services/notebook/notebookKeywordSnapshotService.js';
import { toError } from '../../utils/errors/index.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('notebook-internal');
const router: Router = Router();

/**
 * Refresh notebook keyword snapshots. Called monthly by GitHub Actions cron
 * (apps/api isn't running an in-process scheduler).
 *
 * POST /api/internal/notebook/refresh-keywords
 *   body: { collectionId?: string, month?: 'YYYY-MM' }
 *   - no body → refresh all system collections for current month
 *   - { collectionId } → refresh just that one
 *   - { month } → store under that month label (defaults to current)
 */
router.post(
  '/refresh-keywords',
  requireAdminToken,
  async (req: Request, res: Response): Promise<void> => {
    const body = (req.body ?? {}) as { collectionId?: string; month?: string };
    const month = typeof body.month === 'string' && body.month ? body.month : undefined;

    try {
      if (typeof body.collectionId === 'string' && body.collectionId) {
        log.info(`Single-collection refresh: ${body.collectionId} (month=${month ?? 'current'})`);
        const result = await refreshKeywordSnapshot(body.collectionId, month);
        res.json({ success: true, results: result ? [result] : [] });
        return;
      }

      log.info(`Bulk refresh for all system collections (month=${month ?? 'current'})`);
      const results = await refreshAllKeywordSnapshots(month);
      res.json({ success: true, count: results.length, results });
    } catch (error) {
      log.error(`Snapshot refresh failed: ${toError(error).message}`);
      res.status(500).json({ error: toError(error).message });
    }
  }
);

/**
 * NLP-enrich notebook documents (themes + primary_topic + persons in the Qdrant
 * payload). Called nightly by GitHub Actions cron.
 *
 * POST /api/internal/notebook/enrich
 *   body: { collection?: string, mode?: 'missing' | 'all' }
 *   - no body → enrich all in-scope collections, missing/changed docs only
 *   - { collection } → enrich just that Qdrant collection
 *   - { mode: 'all' } → re-tag every doc (full backfill), ignoring markers
 */
router.post('/enrich', requireAdminToken, async (req: Request, res: Response): Promise<void> => {
  const body = (req.body ?? {}) as { collection?: string; mode?: string };
  const mode: EnrichmentMode = body.mode === 'all' ? 'all' : 'missing';

  try {
    if (typeof body.collection === 'string' && body.collection) {
      log.info(`Single-collection enrichment: ${body.collection} (mode=${mode})`);
      const result = await enrichCollection(body.collection, { mode });
      res.json({ success: true, results: [result] });
      return;
    }

    log.info(`Enrichment for all in-scope collections (mode=${mode})`);
    const results = await enrichAllCollections({ mode });
    res.json({ success: true, count: results.length, results });
  } catch (error) {
    log.error(`Enrichment failed: ${toError(error).message}`);
    res.status(500).json({ error: toError(error).message });
  }
});

export const internalNotebookRouter = router;
