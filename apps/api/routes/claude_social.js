import express from 'express';
import { createAuthenticatedRouter } from '../utils/createAuthenticatedRouter.js';
import { createRequire } from 'module';
import { createLogger } from '../utils/logger.js';
const log = createLogger('claude_social');


// Use createRequire for CommonJS modules
const require = createRequire(import.meta.url);
import { processGraphRequest } from '../agents/langgraph/promptProcessor.js';

// Create authenticated router
const router = createAuthenticatedRouter();

const routeHandler = async (req, res) => {
  log.debug('[claude_social] Request received via promptProcessor');
  await processGraphRequest('social', req, res);
};

router.post('/', routeHandler);

export default router;