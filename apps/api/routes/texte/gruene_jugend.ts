import express, { Router, Request, Response } from 'express';
import { processGraphRequest } from '../../agents/langgraph/PromptProcessor.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('claude_gruene_j');
const router: Router = express.Router();

const routeHandler = async (req: Request, res: Response): Promise<void> => {
  log.debug('[claude_gruene_jugend] Request received via promptProcessor');
  await processGraphRequest('gruene_jugend', req, res);
};

router.post('/', routeHandler);

export default router;
