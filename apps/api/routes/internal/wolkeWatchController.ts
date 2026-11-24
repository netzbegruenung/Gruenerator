import { Router, type Request, type Response, type NextFunction } from 'express';

import { env } from '../../config/env.js';
import { runAllProjectCloudSources } from '../../services/groups/projectCloudSources.js';
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
 * and notify owners; then sync the Wolke folders and Drive files attached to projects. Triggered hourly by .github/workflows/wolke-watch-hourly.yml.
 * Runs synchronously so the workflow can report the result.
 */
router.post('/run', requireAdmin, async (_req: AdminRequest, res: Response): Promise<void> => {
  try {
    const result = await getWolkeWatchService().runAll();
    log.info(
      `Wolke watch run complete: ${result.totalNewFiles} new across ${result.collectionsWithNewFiles} notebooks (${result.durationMs}ms)`
    );
    // Projekt-Quellen (#5945, Wolke und Drive): anders als Notebooks werden sie direkt eingelesen,
    // gedeckelt je Lauf. Ein Fehler hier kostet den Notebook-Teil nicht.
    let projects: Awaited<ReturnType<typeof runAllProjectCloudSources>> | { error: string };
    try {
      projects = await runAllProjectCloudSources();
      log.info(
        `Project cloud sync: ${projects.imported} imported, ${projects.removed} removed, ${projects.pending} pending across ${projects.scannedSources} sources (${projects.durationMs}ms)`
      );
    } catch (error) {
      projects = { error: error instanceof Error ? error.message : String(error) };
      log.error(`Project cloud sync failed: ${projects.error}`);
    }
    res.json({ success: true, ...result, projects });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(`Wolke watch run failed: ${message}`);
    res.status(500).json({ success: false, error: message });
  }
});

export default router;
