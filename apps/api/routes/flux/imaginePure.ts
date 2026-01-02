import express, { Response } from 'express';
import path from 'path';
import fs from 'fs';
import { FluxImageService } from '../../services/flux/index.js';
import { ImageGenerationCounter } from '../../services/counters/index.js';
import { redisClient } from '../../utils/redis/index.js';
import { requireAuth } from '../../middleware/authMiddleware.js';
import { createLogger } from '../../utils/logger.js';
import { addKiLabel } from '../sharepic/sharepic_canvas/imagine_label_canvas.js';
import type { AuthenticatedRequest } from '../../middleware/types.js';

const log = createLogger('imaginePure');
const router = express.Router();
const imageCounter = new ImageGenerationCounter(redisClient as any);

import { buildFluxPrompt } from '../../services/flux/index.js';

// ============================================================================
// Type Definitions
// ============================================================================

type PureImageVariant = 'illustration-pure' | 'realistic-pure' | 'pixel-pure' | 'editorial-pure';

interface ImaginePureRequestBody {
  prompt: string;
  variant?: PureImageVariant;
  seed?: number;
}

interface ImageDimensions {
  width: number;
  height: number;
}

interface FluxPromptResult {
  prompt: string;
  dimensions: ImageDimensions;
}

interface StoredImageResult {
  filePath: string;
  relativePath: string;
  filename: string;
  size: number;
  base64?: string;
}

interface FluxGenerationResult {
  request: {
    id: string;
    polling_url: string;
  };
  result: {
    status: string;
    result: {
      sample: string;
    };
  };
  stored: StoredImageResult;
}

// ============================================================================
// Helper Functions
// ============================================================================

function buildPurePrompt(userPrompt: string, variant: PureImageVariant = 'illustration-pure'): FluxPromptResult {
  return buildFluxPrompt({
    variant,
    subject: userPrompt
  }) as FluxPromptResult;
}

// ============================================================================
// Routes
// ============================================================================

/**
 * POST / - Create pure image (no overlays) using FLUX
 * Requires authentication
 */
router.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      log.debug('[ImaginePure] Request rejected: User ID not found');
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const limitStatus = await imageCounter.checkLimit(userId);
    if (!limitStatus.canGenerate) {
      log.debug(`[ImaginePure] Request rejected: User ${userId} has reached daily limit`);
      return res.status(429).json({
        success: false,
        error: 'Daily image generation limit reached',
        data: limitStatus,
        message: `You have reached your daily limit of ${limitStatus.limit} image generations. Try again tomorrow.`
      });
    }

    const body = req.body as ImaginePureRequestBody;
    const {
      prompt,
      variant = 'illustration-pure',
      seed
    } = body;

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 5) {
      return res.status(400).json({
        success: false,
        error: 'A prompt of at least 5 characters is required'
      });
    }

    const validVariants: PureImageVariant[] = ['illustration-pure', 'realistic-pure', 'pixel-pure', 'editorial-pure'];
    const selectedVariant: PureImageVariant = validVariants.includes(variant) ? variant : 'illustration-pure';

    log.debug(`[ImaginePure] Starting generation for user ${userId}, variant: ${selectedVariant}, prompt: "${prompt.substring(0, 50)}..."`);

    const fluxPromptResult = buildPurePrompt(prompt.trim(), selectedVariant);
    const fluxPrompt = fluxPromptResult.prompt;
    const dimensions = fluxPromptResult.dimensions;

    log.debug(`[ImaginePure] Calling FLUX API with dimensions ${dimensions.width}x${dimensions.height}`);

    const flux = new FluxImageService();
    const fluxOptions: {
      width: number;
      height: number;
      output_format: 'jpeg' | 'png';
      safety_tolerance: number;
      seed?: number;
    } = {
      width: dimensions.width,
      height: dimensions.height,
      output_format: 'jpeg' as const,
      safety_tolerance: 2
    };

    if (seed && Number.isInteger(seed)) {
      fluxOptions.seed = seed;
    }

    const { stored: fluxResult } = await flux.generateFromPrompt(fluxPrompt, fluxOptions) as FluxGenerationResult;

    log.debug(`[ImaginePure] FLUX image generated, size: ${fluxResult.size} bytes`);

    const fluxImageBuffer = fs.readFileSync(fluxResult.filePath);

    const labeledBuffer = await addKiLabel(fluxImageBuffer);

    log.debug(`[ImaginePure] KI label added, final size: ${labeledBuffer.length} bytes`);

    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const baseDir = path.join(process.cwd(), 'uploads', 'imagine', 'pure', today);

    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }

    const filename = `pure_${now.toISOString().replace(/[:.]/g, '-')}.png`;
    const filePath = path.join(baseDir, filename);
    fs.writeFileSync(filePath, labeledBuffer);

    await imageCounter.incrementCount(userId);
    const updatedLimitStatus = await imageCounter.checkLimit(userId);

    log.debug(`[ImaginePure] Image saved to ${filePath}, updated usage: ${updatedLimitStatus.count}/${updatedLimitStatus.limit}`);

    const base64Output = `data:image/png;base64,${labeledBuffer.toString('base64')}`;

    res.json({
      success: true,
      image: {
        base64: base64Output,
        path: filePath,
        relativePath: path.join('uploads', 'imagine', 'pure', today, filename),
        filename,
        size: labeledBuffer.length
      },
      metadata: {
        dimensions: { width: dimensions.width, height: dimensions.height },
        prompt: fluxPrompt,
        variant: selectedVariant,
        timestamp: now.toISOString()
      },
      usage: {
        count: updatedLimitStatus.count,
        remaining: updatedLimitStatus.limit - updatedLimitStatus.count,
        limit: updatedLimitStatus.limit
      }
    });

  } catch (error: any) {
    log.error('[ImaginePure] Error during image creation:', error.message);

    if (error.response?.status) {
      log.error('[ImaginePure] API response status:', error.response.status);
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
