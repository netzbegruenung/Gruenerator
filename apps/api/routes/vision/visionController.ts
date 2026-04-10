import express, { type Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { validateBody, type TypedRequest } from '../../middleware/validateBody.js';
import { getAvailableModels } from '../../services/ai/modelDiscovery.js';
import { ocrService } from '../../services/OcrService/index.js';
import { visionService } from '../../services/vision/index.js';
import { createLogger } from '../../utils/logger.js';

import type { ProviderName } from '../../services/ai/providers.js';

const log = createLogger('vision');

const router: Router = express.Router();

const MAX_IMAGE_LENGTH = 15_000_000; // ~10MB base64
const MAX_INSTRUCTION_LENGTH = 10_000;

const imageSchema = z.string().min(1).max(MAX_IMAGE_LENGTH);

const analyzeSchema = z.object({
  image: imageSchema,
  instruction: z.string().max(MAX_INSTRUCTION_LENGTH).optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  maxTokens: z.number().optional(),
});

const detectTextSchema = z.object({
  image: imageSchema,
});

const ocrSchema = z.object({
  image: imageSchema,
  mimeType: z.string().optional(),
});

const altTextSchema = z.object({
  image: imageSchema,
  context: z.string().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
});

router.post(
  '/analyze',
  validateBody(analyzeSchema),
  async (req: TypedRequest<z.infer<typeof analyzeSchema>>, res: Response): Promise<void> => {
    const { image, instruction, provider, model, maxTokens } = req.body;

    try {
      const options = {
        provider: provider as ProviderName | undefined,
        model: model as string | undefined,
        maxTokens: maxTokens as number | undefined,
      };

      const result = await visionService.analyzeWithOcr(image, instruction, options);

      res.json({
        description: result.description,
        textDetection: result.textDetection,
        extractedText: result.extractedText,
        ocrMethod: result.ocrMethod ?? null,
        model: options.model ?? process.env.VISION_DEFAULT_MODEL ?? 'gemma4-31b',
        provider: options.provider ?? 'regolo',
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      log.error('[vision/analyze] Error:', message);
      res.status(500).json({ error: 'Bildanalyse fehlgeschlagen', details: message });
    }
  }
);

router.post(
  '/detect-text',
  validateBody(detectTextSchema),
  async (req: TypedRequest<z.infer<typeof detectTextSchema>>, res: Response): Promise<void> => {
    const { image } = req.body;

    try {
      const result = await visionService.detectTextContent(image);
      res.json(result);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      log.error('[vision/detect-text] Error:', message);
      res.status(500).json({ error: 'Texterkennung fehlgeschlagen', details: message });
    }
  }
);

router.post(
  '/ocr',
  validateBody(ocrSchema),
  async (req: TypedRequest<z.infer<typeof ocrSchema>>, res: Response): Promise<void> => {
    const { image, mimeType } = req.body;

    try {
      let base64Data = image;
      let resolvedMimeType = mimeType || 'image/jpeg';

      if (base64Data.startsWith('data:')) {
        const match = base64Data.match(/^data:(image\/[^;]+);base64,(.+)$/s);
        if (match) {
          resolvedMimeType = match[1];
          base64Data = match[2];
        }
      }

      const result = await ocrService.extractTextFromBase64(
        base64Data,
        'image.jpg',
        resolvedMimeType
      );

      res.json({
        text: result.text,
        method: result.method,
        confidence: result.confidence ?? null,
        pageCount: result.pageCount,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      log.error('[vision/ocr] Error:', message);
      res.status(500).json({ error: 'OCR-Extraktion fehlgeschlagen', details: message });
    }
  }
);

router.post(
  '/alt-text',
  validateBody(altTextSchema),
  async (req: TypedRequest<z.infer<typeof altTextSchema>>, res: Response): Promise<void> => {
    const { image, context, provider, model } = req.body;

    try {
      const options = {
        provider: provider as ProviderName | undefined,
        model: model as string | undefined,
      };

      const altText = await visionService.generateAltText(image, context, options);

      res.json({
        altText,
        model: options.model ?? process.env.VISION_DEFAULT_MODEL ?? 'gemma4-31b',
        provider: options.provider ?? 'regolo',
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      log.error('[vision/alt-text] Error:', message);
      res.status(500).json({ error: 'Alt-Text-Generierung fehlgeschlagen', details: message });
    }
  }
);

router.get('/models', async (_req: Request, res: Response): Promise<void> => {
  try {
    const allModels = await getAvailableModels();
    const visionModels = allModels.filter((m) => m.vision);
    res.json({ models: visionModels });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.error('[vision/models] Error:', message);
    res.status(500).json({ error: 'Modelle konnten nicht geladen werden', details: message });
  }
});

export default router;
