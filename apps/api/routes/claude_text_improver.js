import express from 'express';
import { processGraphRequest } from '../agents/langgraph/promptProcessor.js';
import { createLogger } from '../utils/logger.js';
const log = createLogger('text_improver');

const router = express.Router();

router.post('/', async (req, res) => {
  log.debug('[claude_text_improver] Request received');
  await processGraphRequest('text_improver', req, res);
});

export default router;