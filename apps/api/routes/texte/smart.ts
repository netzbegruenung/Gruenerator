/**
 * Smart Text Generation Endpoint
 * Automatically detects text type and routes to appropriate generator
 */

import express, { type Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { processGraphRequest } from '../../agents/langgraph/PromptProcessor.js';
import { processGraphRequestStreaming } from '../../agents/langgraph/streamingProcessor.js';
import { validateBody, type TypedRequest } from '../../middleware/validateBody.js';
import { detectTextType, TEXT_TYPE_MAPPINGS } from '../../services/texte/index.js';
import { withErrorHandler } from '../../utils/errors/index.js';
import { createLogger } from '../../utils/logger.js';

import type { AIWorkerPool } from '../../types/workers.js';

const log = createLogger('smart_texte');

/**
 * Maps route-specific required fields to the smart endpoint's `inhalt` input.
 * Without this, templates like buergeranfragen render with empty {{frage}}.
 */
const ROUTE_FIELD_MAP: Record<string, string[]> = {
  buergeranfragen: ['frage'],
  rede: ['thema'],
  leichte_sprache: ['originalText'],
};

const smartRouter: Router = express.Router();

/**
 * POST /api/texte/smart
 * Automatically detects intent and routes to appropriate text generator
 */
const smartSchema = z
  .object({
    inhalt: z.string().optional(),
    prompt: z.string().optional(),
    useWebSearchTool: z.boolean().optional(),
    provider: z.string().optional(),
  })
  .passthrough()
  .refine((data) => (data.inhalt && data.inhalt.trim()) || (data.prompt && data.prompt.trim()), {
    message: 'Bitte gib einen Text oder eine Beschreibung ein.',
  });
type SmartBody = z.infer<typeof smartSchema>;

smartRouter.post(
  '/',
  validateBody(smartSchema),
  withErrorHandler(async (req: TypedRequest<SmartBody>, res: Response): Promise<void> => {
    const { inhalt, prompt, useWebSearchTool, provider, ...restBody } = req.body;

    // Support both 'inhalt' and 'prompt' as the main text input
    const userPrompt = (inhalt || prompt)!;

    log.debug('[smart_texte] Processing request:', userPrompt.substring(0, 100));

    try {
      // Get AI worker pool from app locals
      const aiWorkerPool = (req.app.locals.aiWorkerPool as AIWorkerPool | undefined) || null;

      // Detect text type
      const detection = await detectTextType(userPrompt, aiWorkerPool!);

      log.info('[smart_texte] Detected type:', {
        type: detection.detectedType,
        route: detection.route,
        confidence: detection.confidence,
        method: detection.method,
      });

      // Build request body — map inhalt to route-specific fields so templates render correctly
      const mappedFields = ROUTE_FIELD_MAP[detection.route];
      const fieldOverrides: Record<string, string> = {};
      if (mappedFields) {
        for (const field of mappedFields) {
          fieldOverrides[field] = userPrompt;
        }
      }

      const targetBody = {
        ...restBody,
        inhalt: userPrompt,
        useWebSearchTool,
        provider,
        ...fieldOverrides,
        ...detection.params,
        _detectedType: detection.detectedType,
        _detectionConfidence: detection.confidence,
        _detectionMethod: detection.method,
      };

      // Update request body and route to appropriate processor
      const baseReq = req as unknown as Request;
      baseReq.body = targetBody;

      log.debug('[smart_texte] Routing to:', detection.route);
      if (req.query.stream === 'true' || req.headers.accept === 'text/event-stream') {
        return processGraphRequestStreaming(detection.route, baseReq, res);
      }
      await processGraphRequest(detection.route, baseReq, res);
    } catch (error) {
      log.error('[smart_texte] Processing error:', error);
      res.status(500).json({
        success: false,
        error: 'Bei der Textgenerierung ist ein Fehler aufgetreten.',
        code: 'PROCESSING_ERROR',
        details: { originalError: (error as Error).message },
      });
    }
  }, '/texte/smart')
);

/**
 * GET /api/texte/smart/types
 * Returns available text types for frontend
 */
smartRouter.get('/types', (req: Request, res: Response) => {
  const types = Object.entries(TEXT_TYPE_MAPPINGS).map(([id, mapping]) => ({
    id,
    description: mapping.description,
    route: mapping.route,
  }));

  res.json({
    success: true,
    types,
  });
});

export default smartRouter;
