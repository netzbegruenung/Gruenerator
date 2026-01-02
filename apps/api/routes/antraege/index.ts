/**
 * Antraege Routes Index
 *
 * Routes for Antrag/Anfrage generation with two modes:
 * - /generate-simple - Direct generation via LangGraph
 * - /experimental - Interactive multi-step generation
 */

import express, { Request, Response, NextFunction } from 'express';
import { createLogger } from '../../utils/logger.js';
import simpleGenerationRouter from './simpleGeneration.js';
import interactiveGenerationRouter from './interactiveGeneration.js';

const router = express.Router();
const log = createLogger('antraege');

/**
 * Middleware for all /api/antraege routes
 * Logs incoming requests for debugging
 */
router.use((req: Request, res: Response, next: NextFunction) => {
  log.debug(`Antraege API Request: ${req.method} ${req.originalUrl}`);
  next();
});

/**
 * Simple Antrag generation endpoint
 * POST /api/antraege/generate-simple
 */
router.use('/generate-simple', simpleGenerationRouter);

/**
 * Interactive Antrag generation endpoints
 * POST /api/antraege/experimental/initiate
 * POST /api/antraege/experimental/continue
 * GET /api/antraege/experimental/status/:sessionId
 */
router.use('/experimental', interactiveGenerationRouter);

export default router;
