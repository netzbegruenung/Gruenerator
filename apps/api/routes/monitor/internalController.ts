import { Router, type Request, type Response } from 'express';

import { requireAdminToken } from '../../middleware/adminTokenMiddleware.js';
import { refreshMonitor, refreshInstagram } from '../../services/monitor/MonitorService.js';
import { toError } from '../../utils/errors/index.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('monitor-internal');
const router: Router = Router();

router.post('/refresh', requireAdminToken, async (_req: Request, res: Response): Promise<void> => {
  try {
    log.info('Monitor refresh triggered externally');
    const snapshot = await refreshMonitor();
    res.json({
      success: true,
      totalArticles: snapshot.totalArticles,
      activeTopics: snapshot.topics.filter((t) => t.articleCount > 0).length,
    });
  } catch (error) {
    log.error(`Monitor refresh failed: ${toError(error).message}`);
    res.status(500).json({ error: toError(error).message });
  }
});

router.post(
  '/refresh-instagram',
  requireAdminToken,
  async (_req: Request, res: Response): Promise<void> => {
    try {
      log.info('Instagram refresh triggered externally');
      const count = await refreshInstagram();
      res.json({ success: true, posts: count });
    } catch (error) {
      log.error(`Instagram refresh failed: ${toError(error).message}`);
      res.status(500).json({ error: toError(error).message });
    }
  }
);

export const internalMonitorRouter = router;
