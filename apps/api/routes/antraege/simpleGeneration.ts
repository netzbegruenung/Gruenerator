/**
 * Simple Antrag Generation Routes
 *
 * Handles straightforward Antrag/Anfrage generation using LangGraph processing.
 * Single POST endpoint that processes user input and returns generated text.
 */

import express, { Request, Response, NextFunction } from 'express';
import { processGraphRequest } from '../../agents/langgraph/PromptProcessor.js';
import { createLogger } from '../../utils/logger.js';

const router = express.Router();
const log = createLogger('simpleGeneration');

/**
 * Extended request with tracking ID
 */
interface TrackedRequest extends Request {
  _reqId?: string;
}

/**
 * Request logging middleware for simple generation routes
 * Tracks request lifecycle with minimal overhead
 */
router.use((req: TrackedRequest, res: Response, next: NextFunction) => {
  const reqId = `SG-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  req._reqId = reqId;

  const start = Date.now();
  const originalSend = res.send.bind(res);
  const originalJson = res.json.bind(res);
  const originalRedirect = res.redirect ? res.redirect.bind(res) : null;

  // Single-line incoming log
  log.debug(`[simpleGen][${reqId}] ${req.method} ${req.originalUrl}`);

  // Track minimal response metadata without logging bodies
  let redirectedTo: string | null = null;
  let detectedHtml = false;

  const markHtmlIfNeeded = (body: any): void => {
    // Prefer content-type; fallback to tiny heuristic without storing body
    const ct = res.get('Content-Type') || '';
    if (/text\/html/i.test(ct)) {
      detectedHtml = true;
      return;
    }
    if (typeof body === 'string' && /<html|<!DOCTYPE html/i.test(body)) {
      detectedHtml = true;
    }
  };

  res.send = function (body: any) {
    markHtmlIfNeeded(body);
    return originalSend(body);
  };

  res.json = function (body: any) {
    return originalJson(body);
  };

  if (originalRedirect) {
    res.redirect = ((url: string) => {
      redirectedTo = url;
      return originalRedirect(url);
    }) as any;
  }

  res.on('finish', () => {
    const elapsed = Date.now() - start;
    const ct = res.get('Content-Type') || '-';
    const parts = [
      `status=${res.statusCode}`,
      `ct=${ct}`,
      `html=${detectedHtml}`,
      `dur=${elapsed}ms`,
    ];
    if (redirectedTo) parts.push(`redir=${redirectedTo}`);
    log.debug(`[simpleGen][${reqId}] done ${parts.join(' ')}`);
  });

  next();
});

/**
 * POST /api/antraege/generate-simple
 *
 * Process a simple Antrag generation request through LangGraph
 */
const routeHandler = async (req: Request, res: Response): Promise<void> => {
  await processGraphRequest('antrag_simple', req, res);
};

router.post('/', routeHandler);

export default router;
