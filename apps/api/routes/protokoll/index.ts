/**
 * Protokoll API Route
 * Generates structured meeting protocols from input text
 */

import express, { type Request, type Response } from 'express';

import { processGraphRequest } from '../../agents/langgraph/PromptProcessor.js';
import authMiddleware from '../../middleware/authMiddleware.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('protokoll');
const { requireAuth } = authMiddleware;

const router = express.Router();

const protokollHandler = async (req: Request, res: Response): Promise<void> => {
  log.debug('[protokoll] Request received via promptProcessor');
  await processGraphRequest('protokoll', req, res);
};

router.post('/', requireAuth, protokollHandler);

export default router;
