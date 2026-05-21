import { Router, type Request, type Response, type NextFunction } from 'express';

import { env } from '../../config/env.js';
import { getWolkeWatchService } from '../../services/sync/WolkeWatchService.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('wolke-watch');
const router: Router = Router();

interface AdminRequest extends Request {
  headers: Request['headers'] & {
    'x-admin-token'?: string;
  };
}

const requireAdmin = (req: AdminRequest, res: Response, next: NextFunction): void => {
  const adminToken = req.headers['x-admin-token'];

  if (!adminToken || adminToken !== env.ADMIN_TOKEN) {
    res.status(403).json({
      error: 'Admin authentication required',
      message: 'This endpoint requires admin privileges',
    });
    return;
  }

  next();
};

/**
 * POST /internal/wolke-watch/run
 * Scan every auto_sync notebook for new Wolke files, record them as pending,
 * and notify owners. Triggered hourly by .github/workflows/wolke-watch-hourly.yml.
 * Runs synchronously so the workflow can report the result.
 */
router.post('/run', requireAdmin, async (_req: AdminRequest, res: Response): Promise<void> => {
  try {
    const result = await getWolkeWatchService().runAll();
    log.info(
      `Wolke watch run complete: ${result.totalNewFiles} new across ${result.collectionsWithNewFiles} notebooks (${result.durationMs}ms)`
    );
    res.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(`Wolke watch run failed: ${message}`);
    res.status(500).json({ success: false, error: message });
  }
});

export default router;
