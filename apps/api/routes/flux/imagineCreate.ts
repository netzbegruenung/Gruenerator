import fs from 'fs';
import path from 'path';

import express, { type Response } from 'express';
import { z } from 'zod';

import { requireAuth } from '../../middleware/authMiddleware.js';
import { validateBody, type TypedRequest } from '../../middleware/validateBody.js';
import { ImageGenerationCounter } from '../../services/counters/index.js';
import { FluxImageService, buildFluxPrompt } from '../../services/flux/index.js';
import {
  composeImagineCreate,
  FLUX_WIDTH,
  FLUX_HEIGHT,
} from '../../services/image/ImagineCanvasRenderer.js';
import { createLogger } from '../../utils/logger.js';
import { redisClient } from '../../utils/redis/index.js';
import { addKiLabel } from '../sharepic/sharepic_canvas/imagine_label_canvas.js';

import type { BuildFluxPromptResult } from '../../services/flux/FluxPromptBuilder.js';

const log = createLogger('imagineCreate');
const router = express.Router();
const imageCounter = new ImageGenerationCounter(redisClient);

// ============================================================================
// Type Definitions
// ============================================================================

type ImageVariant = 'light-top' | 'realistic-top' | 'pixel-top' | 'editorial';

const imagineCreateSchema = z.object({
  prompt: z.string().min(1),
  title: z.string().min(1),
  titleColor: z.string().optional(),
  variant: z.enum(['light-top', 'realistic-top', 'pixel-top', 'editorial']).optional(),
  seed: z.number().int().optional(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
});

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

function buildCreatePrompt(
  userPrompt: string,
  variant: ImageVariant = 'light-top'
): BuildFluxPromptResult {
  return buildFluxPrompt({
    variant,
    subject: userPrompt,
  });
}

function isValidHexColor(color: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(color);
}

// ============================================================================
// Routes
// ============================================================================

/**
 * POST / - Create image with title overlay using FLUX
 * Requires authentication
 */
router.post(
  '/',
  requireAuth,
  validateBody(imagineCreateSchema),
  async (req: TypedRequest<z.infer<typeof imagineCreateSchema>>, res: Response) => {
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
          message: `You have reached your daily limit of ${limitStatus.limit} image generations. Try again tomorrow.`,
        });
      }

      const { prompt, title, titleColor, variant = 'light-top', seed, width, height } = req.body;

      if (titleColor && !isValidHexColor(titleColor)) {
        return res.status(400).json({
          success: false,
          error: 'titleColor must be a valid hex color (e.g., #FFFFFF)',
        });
      }

      // Validate custom dimensions if provided
      if (width && height) {
        if (width < 64 || height < 64) {
          return res.status(400).json({
            success: false,
            error: 'Dimensions must be at least 64x64',
          });
        }
        if (width % 16 !== 0 || height % 16 !== 0) {
          return res.status(400).json({
            success: false,
            error: 'Dimensions must be multiples of 16',
          });
        }
        if (width * height > 4_000_000) {
          return res.status(400).json({
            success: false,
            error: 'Image size cannot exceed 4 megapixels',
          });
        }
      }

      const validVariants: ImageVariant[] = [
        'light-top',
        'realistic-top',
        'pixel-top',
        'editorial',
      ];
      const selectedVariant: ImageVariant = validVariants.includes(variant) ? variant : 'light-top';

      log.debug(
        `[ImagineCreate] Starting generation for user ${userId}, variant: ${selectedVariant}, prompt: "${prompt.substring(0, 50)}..."`
      );

      const fluxPrompt = buildCreatePrompt(prompt.trim(), selectedVariant);

      // Use custom dimensions if provided, otherwise use constants
      const dimensions =
        width && height ? { width, height } : { width: FLUX_WIDTH, height: FLUX_HEIGHT };

      log.debug(
        `[ImagineCreate] Calling FLUX API with dimensions ${dimensions.width}x${dimensions.height}${width && height ? ' (custom)' : ' (default)'}`
      );

      const flux = await FluxImageService.create();
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
        safety_tolerance: 2,
      };

      if (seed && Number.isInteger(seed)) {
        fluxOptions.seed = seed;
      }

      const { stored: fluxResult } = (await flux.generateFromPrompt(
        fluxPrompt.prompt,
        fluxOptions
      )) as FluxGenerationResult;

      log.debug(`[ImagineCreate] FLUX image generated, size: ${fluxResult.size} bytes`);

      const fluxImageBuffer = fs.readFileSync(fluxResult.filePath);

      log.debug(`[ImagineCreate] Composing canvas with title-top template`);

      const composedBuffer = await composeImagineCreate(fluxImageBuffer, {
        title: title.trim(),
        titleColor,
        variant:
          selectedVariant === 'editorial' ||
          selectedVariant === 'realistic-top' ||
          selectedVariant === 'pixel-top'
            ? 'light-top'
            : (selectedVariant as 'light-top' | 'green-bottom'),
        ...(width &&
          height && {
            outputWidth: width,
            outputHeight: height,
          }),
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

      log.debug(
        `[ImagineCreate] Image saved to ${filePath}, updated usage: ${updatedLimitStatus.count}/${updatedLimitStatus.limit}`
      );

      const base64Output = `data:image/png;base64,${labeledBuffer.toString('base64')}`;

      return res.json({
        success: true,
        image: {
          base64: base64Output,
          path: filePath,
          relativePath: path.join('uploads', 'imagine', 'create', today, filename),
          filename,
          size: labeledBuffer.length,
        },
        metadata: {
          fluxImageDimensions: { width: FLUX_WIDTH, height: FLUX_HEIGHT },
          outputDimensions: { width: 1080, height: 1350 },
          prompt: fluxPrompt,
          timestamp: now.toISOString(),
        },
        usage: {
          count: updatedLimitStatus.count,
          remaining: updatedLimitStatus.limit - updatedLimitStatus.count,
          limit: updatedLimitStatus.limit,
        },
      });
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const typed = error as { type?: string; retryable?: boolean; response?: { status?: number } };
      log.error('[ImagineCreate] Error during image creation:', errMsg);

      if (typed.response?.status) {
        log.error('[ImagineCreate] API response status:', typed.response.status);
      }

      const statusCode =
        typed.type === 'validation'
          ? 400
          : typed.type === 'billing'
            ? 402
            : typed.retryable === false
              ? 400
              : 500;

      return res.status(statusCode).json({
        success: false,
        error: errMsg || 'Failed to create image',
        type: typed.type || 'unknown',
        retryable: typed.retryable ?? true,
        ...(typed.type === 'network' && {
          hint: 'Please check your internet connection and try again',
        }),
        ...(typed.type === 'billing' && { hint: 'Please add credits to your BFL account' }),
        ...(typed.type === 'server' && {
          hint: 'The service is temporarily unavailable. Please try again in a few minutes',
        }),
      });
    }
  }
);

export default router;
