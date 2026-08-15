import { type Request } from 'express';

import { type AiClient } from '../services/ai/types.js';

export function getAiClient(req: Request): AiClient {
  const pool: unknown = req.app.locals.aiClient;
  return pool as AiClient;
}
