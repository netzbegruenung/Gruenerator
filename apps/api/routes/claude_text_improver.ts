import express, { Router, Request, Response } from 'express';
import { processGraphRequest } from '../agents/langgraph/PromptProcessor.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('text_improver');
const router: Router = express.Router();

router.post('/', async (req: Request, res: Response): Promise<void> => {
  log.debug('[claude_text_improver] Request received');
  await processGraphRequest('text_improver', req, res);
});

export default router;
