import express, { type Router, type Request, type Response } from 'express';

import { processGraphRequest } from '../../agents/langgraph/PromptProcessor.js';
import { processGraphRequestStreaming } from '../../agents/langgraph/streamingProcessor.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('claude_gruene_j');
const router: Router = express.Router();

const routeHandler = async (req: Request, res: Response): Promise<void> => {
  log.debug('[claude_gruene_jugend] Request received via promptProcessor');
  if (req.query.stream === 'true' || req.headers.accept === 'text/event-stream') {
    return processGraphRequestStreaming('gruene_jugend', req, res);
  }
  await processGraphRequest('gruene_jugend', req, res);
};

router.post('/', routeHandler);

export default router;
