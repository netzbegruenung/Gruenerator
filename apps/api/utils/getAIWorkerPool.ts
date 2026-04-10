import { type Request } from 'express';

import { type AIWorkerPool } from '../workers/types.js';

export function getAIWorkerPool(req: Request): AIWorkerPool {
  return req.app.locals.aiWorkerPool as AIWorkerPool;
}
