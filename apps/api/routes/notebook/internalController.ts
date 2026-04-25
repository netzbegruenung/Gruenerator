import { Router, type Request, type Response } from 'express';

import { requireAdminToken } from '../../middleware/adminTokenMiddleware.js';
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

export const internalNotebookRouter = router;
