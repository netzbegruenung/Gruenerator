import express from 'express';
import { createLogger } from '../../utils/logger.js';
import simpleAntragRouter from './antrag_simple.js';
import experimentalAntragRouter from './experimentalRoutes.mjs';

const router = express.Router();
const log = createLogger('antraege');

// === Middleware for all /api/antraege routes ===
router.use((req, res, next) => {
  log.debug(`Antraege API Request: ${req.method} ${req.originalUrl}`);
  next();
});

// === Route for simple Antrag generation ===
router.use('/generate-simple', simpleAntragRouter);

// === Route for experimental interactive Antrag generation ===
router.use('/experimental', experimentalAntragRouter);

export default router;
