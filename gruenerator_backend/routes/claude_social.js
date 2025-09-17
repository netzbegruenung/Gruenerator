import express from 'express';
import { createAuthenticatedRouter } from '../utils/createAuthenticatedRouter.js';
import { createRequire } from 'module';

// Use createRequire for CommonJS modules
const require = createRequire(import.meta.url);
const { processGraphRequest } = require('../agents/langgraph/promptProcessor');

// Create authenticated router
const router = createAuthenticatedRouter();

const routeHandler = async (req, res) => {
  console.log('[claude_social] Request received via promptProcessor');
  await processGraphRequest('social', req, res);
};

router.post('/', routeHandler);

export default router;