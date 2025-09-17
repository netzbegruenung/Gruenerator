import express from 'express';
import authMiddlewareModule from '../middleware/authMiddleware.js';
import { createRequire } from 'module';

// Use createRequire for CommonJS modules
const require = createRequire(import.meta.url);
const { processGraphRequest } = require('../agents/langgraph/promptProcessor');

const { requireAuth } = authMiddlewareModule;
const router = express.Router();

router.post('/', async (req, res) => {
  console.log('[custom_generator] Request received via promptProcessor');
  await processGraphRequest('custom_generator', req, res);
});

export default router;