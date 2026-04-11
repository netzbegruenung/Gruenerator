import { type Request } from 'express';

import { type AIWorkerPool } from '../workers/types.js';

export function getAIWorkerPool(req: Request): AIWorkerPool {
  const pool: unknown = req.app.locals.aiWorkerPool;
  return pool as AIWorkerPool;
}
