import express from 'express';
const router = express.Router();
import { processGraphRequest } from '../agents/langgraph/PromptProcessor.js';
import { createLogger } from '../utils/logger.js';
const log = createLogger('claude_gruene_j');


const routeHandler = async (req, res) => {
  log.debug('[claude_gruene_jugend] Request received via promptProcessor');
  await processGraphRequest('gruene_jugend', req, res);
};

router.post('/', routeHandler);

export default router;