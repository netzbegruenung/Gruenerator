import express, { type Router, type Request, type Response } from 'express';

import { processGraphRequest } from '../../agents/langgraph/PromptProcessor.js';
import { processGraphRequestStreaming } from '../../agents/langgraph/streamingProcessor.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('texte/universal');

function wantsStream(req: Request): boolean {
  return req.query.stream === 'true' || req.headers.accept === 'text/event-stream';
}

const universalRouter: Router = express.Router();

const universalHandler = async (req: Request, res: Response): Promise<void> => {
  log.debug('[texte/universal] Request received via promptProcessor');
  if (wantsStream(req)) return processGraphRequestStreaming('universal', req, res);
  await processGraphRequest('universal', req, res);
};

universalRouter.post('/', universalHandler);

export { universalRouter };
