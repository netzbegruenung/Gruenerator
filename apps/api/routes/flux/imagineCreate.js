import express from 'express';
import path from 'path';
import fs from 'fs';
import FluxImageService from '../../services/fluxImageService.mjs';
import ImageGenerationCounter from '../../utils/imageGenerationCounter.js';
import redisClient from '../../utils/redisClient.js';
import { requireAuth } from '../../middleware/authMiddleware.js';
import { createLogger } from '../../utils/logger.js';
import { composeImagineCreate, FLUX_WIDTH, FLUX_HEIGHT } from '../../services/imagineCanvasService.js';
import { addKiLabel } from '../sharepic/sharepic_canvas/imagine_label_canvas.js';

const log = createLogger('imagineCreate');
const router = express.Router();
const imageCounter = new ImageGenerationCounter(redisClient);

import { buildFluxPrompt } from '../../services/fluxPromptBuilder.js';

function buildCreatePrompt(userPrompt, variant = 'light-top') {
  return buildFluxPrompt({
    variant,
    subject: userPrompt
  });
}

function isValidHexColor(color) {
  return /^#[0-9A-Fa-f]{6}$/.test(color);
}

router.post('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      log.debug('[ImagineCreate] Request rejected: User ID not found');
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const limitStatus = await imageCounter.checkLimit(userId);
    if (!limitStatus.canGenerate) {
      log.debug(`[ImagineCreate] Request rejected: User ${userId} has reached daily limit`);
      return res.status(429).json({
        success: false,
        error: 'Daily image generation limit reached',
        data: limitStatus,
        message: `You have reached your daily limit of ${limitStatus.limit} image generations. Try again tomorrow.`
      });
    }

    const {
      prompt,
      title,
      titleColor,
      variant = 'light-top',
      seed
    } = req.body;

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 5) {
      return res.status(400).json({
        success: false,
        error: 'A prompt of at least 5 characters is required'
      });
    }

    if (!title || typeof title !== 'string' || title.trim().length < 1) {
      return res.status(400).json({
        success: false,
        error: 'A title is required'
      });
    }

    if (titleColor && !isValidHexColor(titleColor)) {
      return res.status(400).json({
        success: false,
        error: 'titleColor must be a valid hex color (e.g., #FFFFFF)'
      });
    }

    const validVariants = ['light-top', 'realistic-top', 'pixel-top', 'editorial'];
    const selectedVariant = validVariants.includes(variant) ? variant : 'light-top';

    log.debug(`[ImagineCreate] Starting generation for user ${userId}, variant: ${selectedVariant}, prompt: "${prompt.substring(0, 50)}..."`);

    const fluxPrompt = buildCreatePrompt(prompt.trim(), selectedVariant);

    log.debug(`[ImagineCreate] Calling FLUX API with dimensions ${FLUX_WIDTH}x${FLUX_HEIGHT}`);

    const flux = new FluxImageService();
    const fluxOptions = {
      width: FLUX_WIDTH,
      height: FLUX_HEIGHT,
      output_format: 'jpeg',
      safety_tolerance: 2
    };

    if (seed && Number.isInteger(seed)) {
      fluxOptions.seed = seed;
    }

    const { stored: fluxResult } = await flux.generateFromPrompt(fluxPrompt, fluxOptions);

    log.debug(`[ImagineCreate] FLUX image generated, size: ${fluxResult.size} bytes`);

    const fluxImageBuffer = fs.readFileSync(fluxResult.filePath);

    log.debug(`[ImagineCreate] Composing canvas with title-top template`);

    const composedBuffer = await composeImagineCreate(fluxImageBuffer, {
      title: title.trim(),
      titleColor,
      variant: selectedVariant
    });

    log.debug(`[ImagineCreate] Canvas composed, size: ${composedBuffer.length} bytes`);

    const labeledBuffer = await addKiLabel(composedBuffer);

    log.debug(`[ImagineCreate] KI label added, final size: ${labeledBuffer.length} bytes`);

    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const baseDir = path.join(process.cwd(), 'uploads', 'imagine', 'create', today);

    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }

    const filename = `create_${now.toISOString().replace(/[:.]/g, '-')}.png`;
    const filePath = path.join(baseDir, filename);
    fs.writeFileSync(filePath, labeledBuffer);

    await imageCounter.incrementCount(userId);
    const updatedLimitStatus = await imageCounter.checkLimit(userId);

    log.debug(`[ImagineCreate] Image saved to ${filePath}, updated usage: ${updatedLimitStatus.count}/${updatedLimitStatus.limit}`);

    const base64Output = `data:image/png;base64,${labeledBuffer.toString('base64')}`;

    res.json({
      success: true,
      image: {
        base64: base64Output,
        path: filePath,
        relativePath: path.join('uploads', 'imagine', 'create', today, filename),
        filename,
        size: labeledBuffer.length
      },
      metadata: {
        fluxImageDimensions: { width: FLUX_WIDTH, height: FLUX_HEIGHT },
        outputDimensions: { width: 1080, height: 1350 },
        prompt: fluxPrompt,
        timestamp: now.toISOString()
      },
      usage: {
        count: updatedLimitStatus.count,
        remaining: updatedLimitStatus.limit - updatedLimitStatus.count,
        limit: updatedLimitStatus.limit
      }
    });

  } catch (error) {
    log.error('[ImagineCreate] Error during image creation:', error.message);

    if (error.response?.status) {
      log.error('[ImagineCreate] API response status:', error.response.status);
    }

    const statusCode = error.type === 'validation' ? 400 :
                       error.type === 'billing' ? 402 :
                       error.retryable === false ? 400 : 500;

    res.status(statusCode).json({
      success: false,
      error: error.message || 'Failed to create image',
      type: error.type || 'unknown',
      retryable: error.retryable ?? true,
      ...(error.type === 'network' && { hint: 'Please check your internet connection and try again' }),
      ...(error.type === 'billing' && { hint: 'Please add credits to your BFL account' }),
      ...(error.type === 'server' && { hint: 'The service is temporarily unavailable. Please try again in a few minutes' })
    });
  }
});

export default router;