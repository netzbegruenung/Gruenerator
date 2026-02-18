import express, { type Router, type Request, type Response } from 'express';

import { processGraphRequest } from '../../agents/langgraph/PromptProcessor.js';
import { processGraphRequestStreaming } from '../../agents/langgraph/streamingProcessor.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('text_improver');
const router: Router = express.Router();

router.post('/', async (req: Request, res: Response): Promise<void> => {
  log.debug('[claude_text_improver] Request received');
  if (req.query.stream === 'true' || req.headers.accept === 'text/event-stream') {
    return processGraphRequestStreaming('text_improver', req, res);
  }
  await processGraphRequest('text_improver', req, res);
});

export default router;
