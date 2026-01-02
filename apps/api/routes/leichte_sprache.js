import express from 'express';
import { createAuthenticatedRouter } from '../utils/keycloak/index.js';
import { createRequire } from 'module';
import { createLogger } from '../utils/logger.js';
const log = createLogger('leichte_sprache');


// Use createRequire for CommonJS modules
const require = createRequire(import.meta.url);
import { processGraphRequest } from '../agents/langgraph/PromptProcessor.js';

// Create authenticated router
const router = createAuthenticatedRouter();

const routeHandler = async (req, res) => {
  log.debug('[leichte_sprache] Request received via promptProcessor');
  await processGraphRequest('leichte_sprache', req, res);
};

router.post('/', routeHandler);

export default router;