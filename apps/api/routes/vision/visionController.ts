import express, { type Router, type Request, type Response } from 'express';

import { getAvailableModels } from '../../services/ai/modelDiscovery.js';
import { ocrService } from '../../services/OcrService/index.js';
import { visionService } from '../../services/vision/index.js';
import { createLogger } from '../../utils/logger.js';

import type { ProviderName } from '../../services/ai/providers.js';

const log = createLogger('vision');

const router: Router = express.Router();

const MAX_IMAGE_LENGTH = 15_000_000; // ~10MB base64
const MAX_INSTRUCTION_LENGTH = 10_000;

function validateImageInput(image: unknown): string | null {
  if (typeof image !== 'string' || image.length === 0) {
    return 'image is required and must be a non-empty string (base64, data URL, or HTTP URL)';
  }
  if (image.length > MAX_IMAGE_LENGTH) {
    return `image exceeds maximum size (~10MB base64)`;
  }
  return null;
}

router.post('/analyze', async (req: Request, res: Response): Promise<void> => {
  const { image, instruction, provider, model, maxTokens } = req.body;

  const imageError = validateImageInput(image);
  if (imageError) {
    res.status(400).json({ error: imageError });
    return;
  }

  if (
    instruction &&
    typeof instruction === 'string' &&
    instruction.length > MAX_INSTRUCTION_LENGTH
  ) {
    res.status(400).json({ error: `instruction exceeds ${MAX_INSTRUCTION_LENGTH} characters` });
    return;
  }

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
      model: options.model ?? process.env.VISION_DEFAULT_MODEL ?? 'qwen3-vl-32b',
      provider: options.provider ?? 'regolo',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.error('[vision/analyze] Error:', message);
    res.status(500).json({ error: 'Bildanalyse fehlgeschlagen', details: message });
  }
});

router.post('/detect-text', async (req: Request, res: Response): Promise<void> => {
  const { image } = req.body;

  const imageError = validateImageInput(image);
  if (imageError) {
    res.status(400).json({ error: imageError });
    return;
  }

  try {
    const result = await visionService.detectTextContent(image);
    res.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.error('[vision/detect-text] Error:', message);
    res.status(500).json({ error: 'Texterkennung fehlgeschlagen', details: message });
  }
});

router.post('/ocr', async (req: Request, res: Response): Promise<void> => {
  const { image, mimeType } = req.body;

  const imageError = validateImageInput(image);
  if (imageError) {
    res.status(400).json({ error: imageError });
    return;
  }

  try {
    let base64Data = image as string;
    let resolvedMimeType = (mimeType as string) || 'image/jpeg';

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
});

router.post('/alt-text', async (req: Request, res: Response): Promise<void> => {
  const { image, context, provider, model } = req.body;

  const imageError = validateImageInput(image);
  if (imageError) {
    res.status(400).json({ error: imageError });
    return;
  }

  try {
    const options = {
      provider: provider as ProviderName | undefined,
      model: model as string | undefined,
    };

    const altText = await visionService.generateAltText(
      image,
      context as string | undefined,
      options
    );

    res.json({
      altText,
      model: options.model ?? process.env.VISION_DEFAULT_MODEL ?? 'qwen3-vl-32b',
      provider: options.provider ?? 'regolo',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.error('[vision/alt-text] Error:', message);
    res.status(500).json({ error: 'Alt-Text-Generierung fehlgeschlagen', details: message });
  }
});

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
