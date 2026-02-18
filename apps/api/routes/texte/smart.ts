/**
 * Smart Text Generation Endpoint
 * Automatically detects text type and routes to appropriate generator
 */

import express, { type Router, type Request, type Response } from 'express';

import { processGraphRequest } from '../../agents/langgraph/PromptProcessor.js';
import { processGraphRequestStreaming } from '../../agents/langgraph/streamingProcessor.js';
import { detectTextType, TEXT_TYPE_MAPPINGS } from '../../services/texte/index.js';
import { withErrorHandler } from '../../utils/errors/index.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('smart_texte');

const smartRouter: Router = express.Router();

/**
 * POST /api/texte/smart
 * Automatically detects intent and routes to appropriate text generator
 */
smartRouter.post(
  '/',
  withErrorHandler(async (req: Request, res: Response): Promise<void> => {
    const { inhalt, prompt, useWebSearchTool, usePrivacyMode, provider, ...restBody } = req.body;

    // Support both 'inhalt' and 'prompt' as the main text input
    const userPrompt = inhalt || prompt;

    if (!userPrompt || typeof userPrompt !== 'string' || !userPrompt.trim()) {
      res.status(400).json({
        success: false,
        error: 'Bitte gib einen Text oder eine Beschreibung ein.',
        code: 'VALIDATION_ERROR',
      });
      return;
    }

    log.debug('[smart_texte] Processing request:', userPrompt.substring(0, 100));

    try {
      // Get AI worker pool from app locals
      const aiWorkerPool = (req as any).app?.locals?.aiWorkerPool || null;

      // Detect text type
      const detection = await detectTextType(userPrompt, aiWorkerPool);

      log.info('[smart_texte] Detected type:', {
        type: detection.detectedType,
        route: detection.route,
        confidence: detection.confidence,
        method: detection.method,
      });

      // Build request body for the target route
      const targetBody = {
        ...restBody,
        inhalt: userPrompt,
        useWebSearchTool,
        usePrivacyMode,
        provider,
        ...detection.params,
        // Add detection metadata
        _detectedType: detection.detectedType,
        _detectionConfidence: detection.confidence,
        _detectionMethod: detection.method,
      };

      // Update request body
      req.body = targetBody;

      // Route to appropriate processor
      log.debug('[smart_texte] Routing to:', detection.route);
      if (req.query.stream === 'true' || req.headers.accept === 'text/event-stream') {
        return processGraphRequestStreaming(detection.route, req, res);
      }
      await processGraphRequest(detection.route, req, res);
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
