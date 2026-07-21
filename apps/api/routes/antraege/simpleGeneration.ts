/**
 * Simple Antrag Generation Routes
 *
 * Handles straightforward Antrag/Anfrage generation using LangGraph processing.
 * Single POST endpoint that processes user input and returns generated text.
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';

import {
  processAntragAgentStreaming,
  processAntragAgentRequest,
} from '../../agents/langgraph/AntragAgentGraph/agentModeProcessor.js';
import { processGraphRequest } from '../../agents/langgraph/PromptProcessor.js';
import { processGraphRequestStreaming } from '../../agents/langgraph/streamingProcessor.js';
import { validateBody, type TypedRequest } from '../../middleware/validateBody.js';
import { createLogger } from '../../utils/logger.js';

const router = express.Router();
const log = createLogger('simpleGeneration');

interface TrackedRequest extends Request {
  _reqId?: string;
}

const simpleGenerationSchema = z
  .object({
    useWebSearchTool: z.boolean().optional(),
    useAgentMode: z.boolean().optional(),
  })
  .passthrough();

type SimpleGenerationBody = z.infer<typeof simpleGenerationSchema>;

router.use((req: TrackedRequest, res: Response, next: NextFunction) => {
  const reqId = `SG-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  req._reqId = reqId;

  const start = Date.now();
  const originalSend = res.send.bind(res);
  const originalJson = res.json.bind(res);
  const originalRedirect = res.redirect ? res.redirect.bind(res) : null;

  log.debug(`[simpleGen][${reqId}] ${req.method} ${req.originalUrl}`);

  let redirectedTo: string | null = null;
  let detectedHtml = false;

  const markHtmlIfNeeded = (body: unknown): void => {
    const ct = res.get('Content-Type') || '';
    if (/text\/html/i.test(ct)) {
      detectedHtml = true;
      return;
    }
    if (typeof body === 'string' && /<html|<!DOCTYPE html/i.test(body)) {
      detectedHtml = true;
    }
  };

  res.send = function (body: unknown) {
    markHtmlIfNeeded(body);
    return originalSend(body);
  } as typeof res.send;

  res.json = function (body: unknown) {
    return originalJson(body);
  } as typeof res.json;

  if (originalRedirect) {
    res.redirect = ((url: string) => {
      redirectedTo = url;
      return originalRedirect(url);
    }) as typeof res.redirect;
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
router.post(
  '/',
  validateBody(simpleGenerationSchema),
  async (req: TypedRequest<SimpleGenerationBody>, res: Response): Promise<void> => {
    log.debug('[simpleGeneration] Incoming request body flags:', {
      useWebSearchTool: req.body.useWebSearchTool,
      useAgentMode: req.body.useAgentMode,
    });

    // Agent mode: delegate to AntragAgentGraph pipeline
    if (req.body.useAgentMode) {
      log.debug('[simpleGeneration] Delegating to AntragAgentGraph');
      if (req.query.stream === 'true' || req.headers.accept === 'text/event-stream') {
        return processAntragAgentStreaming(req, res);
      }
      return processAntragAgentRequest(req, res);
    }

    if (req.query.stream === 'true' || req.headers.accept === 'text/event-stream') {
      return processGraphRequestStreaming('antrag_simple', req, res);
    }
    await processGraphRequest('antrag_simple', req, res);
  }
);

export default router;
