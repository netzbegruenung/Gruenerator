import express, { type Response, type Request } from 'express';

import { getNotebookStats } from '../../services/notebook/notebookStatsService.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('notebookStats');
const router = express.Router();

function parseRefresh(query: Request['query']): boolean {
  const raw = query.refresh;
  return raw === '1' || raw === 'true';
}

router.get('/collections/:id/stats', async (req: Request<{ id: string }>, res: Response) => {
  const collectionId = req.params.id;
  const refresh = parseRefresh(req.query);
  try {
    const stats = await getNotebookStats([collectionId], { refresh });
    res.json(stats);
  } catch (error) {
    log.error(
      `stats failed for ${collectionId}: ${error instanceof Error ? error.message : error}`
    );
    res.status(500).json({ error: 'stats_failed' });
  }
});

router.get('/stats', async (req: Request, res: Response) => {
  const raw = req.query.collections;
  const collectionIds = (typeof raw === 'string' ? raw : '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (collectionIds.length === 0) {
    return res.json({
      totalDocuments: 0,
      categoryDistribution: [],
      sourceDistribution: [],
      dateRange: { min: null, max: null },
      monthlyActivity: [],
      topWords: [],
    });
  }

  const refresh = parseRefresh(req.query);
  try {
    const stats = await getNotebookStats(collectionIds, { refresh });
    res.json(stats);
  } catch (error) {
    log.error(
      `multi-stats failed for ${collectionIds.join(',')}: ${error instanceof Error ? error.message : error}`
    );
    res.status(500).json({ error: 'stats_failed' });
  }
});

export default router;
