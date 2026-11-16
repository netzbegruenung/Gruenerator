/**
 * Antraege Routes Index
 *
 * Routes for Antrag/Anfrage generation:
 * - /generate-simple - Direct generation
 */

import express, { type Request, type Response, type NextFunction } from 'express';

import { createLogger } from '../../utils/logger.js';

import simpleGenerationRouter from './simpleGeneration.js';

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

export default router;
