import crypto from 'crypto';

import { Router, type Request, type Response, type NextFunction } from 'express';

import { executeDueAgents } from '../../services/briefing/BriefingSchedulerService.js';
import { toError } from '../../utils/errors/index.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('briefing-internal');
const router: Router = Router();

function requireAdminToken(req: Request, res: Response, next: NextFunction): void {
  const adminToken = req.headers['x-admin-token'];
  const expectedToken = process.env.ADMIN_TOKEN;

  if (!expectedToken || !adminToken || typeof adminToken !== 'string') {
    res.status(403).json({ error: 'Admin authentication required' });
    return;
  }

  const tokenBuffer = Buffer.from(adminToken);
  const expectedBuffer = Buffer.from(expectedToken);
  if (
    tokenBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(tokenBuffer, expectedBuffer)
  ) {
    res.status(403).json({ error: 'Admin authentication required' });
    return;
  }

  next();
}

router.post(
  '/execute-due',
  requireAdminToken,
  async (_req: Request, res: Response): Promise<void> => {
    try {
      log.info('Executing due briefing agents (triggered externally)');
      const result = await executeDueAgents();
      res.json({ success: true, ...result });
    } catch (error) {
      log.error(`Execute-due failed: ${toError(error).message}`);
      res.status(500).json({ error: toError(error).message });
    }
  }
);

export const internalBriefingRouter = router;
