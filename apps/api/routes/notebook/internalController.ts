import { Router, type Request, type Response } from 'express';

import { requireAdminToken } from '../../middleware/adminTokenMiddleware.js';
import {
  enrichAllCollections,
  enrichCollection,
  type EnrichmentMode,
} from '../../services/notebook/notebookEnrichmentService.js';
import { toError } from '../../utils/errors/index.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('notebook-internal');
const router: Router = Router();

/**
 * NLP-enrich notebook documents (themes + primary_topic + persons in the Qdrant
 * payload). Called nightly by GitHub Actions cron.
 *
 * POST /api/internal/notebook/enrich
 *   body: { collection?: string, mode?: 'missing' | 'all', maxDocs?: number }
 *   - no body → enrich all in-scope collections, missing/changed docs only
 *   - { collection } → enrich just that Qdrant collection
 *   - { mode: 'all' } → re-tag every doc (full backfill), ignoring markers. This
 *     is uncapped and can outlast the proxy — prefer the backfill script.
 *   - { maxDocs } → work budget for this request (0 = uncapped); a ~3 min clock
 *     applies on top. Whatever the budget leaves over comes back as `pending`, so a caller facing a large
 *     backlog POSTs again until that reaches 0 instead of running into the
 *     reverse proxy's ~5 min cut-off.
 */
router.post('/enrich', requireAdminToken, async (req: Request, res: Response): Promise<void> => {
  const body = (req.body ?? {}) as { collection?: string; mode?: string; maxDocs?: unknown };
  const mode: EnrichmentMode = body.mode === 'all' ? 'all' : 'missing';
  const maxDocs =
    typeof body.maxDocs === 'number' && Number.isFinite(body.maxDocs) && body.maxDocs >= 0
      ? Math.floor(body.maxDocs)
      : null;

  try {
    if (typeof body.collection === 'string' && body.collection) {
      log.info(`Single-collection enrichment: ${body.collection} (mode=${mode})`);
      const result = await enrichCollection(body.collection, { mode, maxDocs });
      res.json({ success: true, results: [result] });
      return;
    }

    log.info(`Enrichment for all in-scope collections (mode=${mode})`);
    const results = await enrichAllCollections({ mode, maxDocs });
    res.json({ success: true, count: results.length, results });
  } catch (error) {
    log.error(`Enrichment failed: ${toError(error).message}`);
    res.status(500).json({ error: toError(error).message });
  }
});

export const internalNotebookRouter = router;
