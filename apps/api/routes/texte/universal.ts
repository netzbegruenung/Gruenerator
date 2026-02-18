import express, { type Router, type Request, type Response } from 'express';

import { processGraphRequest } from '../../agents/langgraph/PromptProcessor.js';
import { processGraphRequestStreaming } from '../../agents/langgraph/streamingProcessor.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('claude_universa');

function wantsStream(req: Request): boolean {
  return req.query.stream === 'true' || req.headers.accept === 'text/event-stream';
}

// Router for Universal Text Generation
const universalRouter: Router = express.Router();

const universalHandler = async (req: Request, res: Response): Promise<void> => {
  log.debug('[claude_universal] Request received via promptProcessor');
  if (wantsStream(req)) return processGraphRequestStreaming('universal', req, res);
  await processGraphRequest('universal', req, res);
};

universalRouter.post('/', universalHandler);

// Router for Rede Generation
const redeRouter: Router = express.Router();

const redeHandler = async (req: Request, res: Response): Promise<void> => {
  log.debug('[claude_rede] Request received via promptProcessor');
  if (wantsStream(req)) return processGraphRequestStreaming('rede', req, res);
  await processGraphRequest('rede', req, res);
};

redeRouter.post('/', redeHandler);

// Router for Wahlprogramm Generation
const wahlprogrammRouter: Router = express.Router();

const wahlprogrammHandler = async (req: Request, res: Response): Promise<void> => {
  log.debug('[claude_wahlprogramm] Request received via promptProcessor');
  if (wantsStream(req)) return processGraphRequestStreaming('wahlprogramm', req, res);
  await processGraphRequest('wahlprogramm', req, res);
};

wahlprogrammRouter.post('/', wahlprogrammHandler);

// Router for Bürgeranfragen Generation
const buergeranfragenRouter: Router = express.Router();

const buergeranfragenHandler = async (req: Request, res: Response): Promise<void> => {
  log.debug('[claude_buergeranfragen] Request received via promptProcessor');
  if (wantsStream(req)) return processGraphRequestStreaming('buergeranfragen', req, res);
  await processGraphRequest('buergeranfragen', req, res);
};

buergeranfragenRouter.post('/', buergeranfragenHandler);

export { universalRouter, redeRouter, wahlprogrammRouter, buergeranfragenRouter };
