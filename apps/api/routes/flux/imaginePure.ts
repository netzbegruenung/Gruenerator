import fs from 'fs';
import path from 'path';

import { IMAGE_MODEL_BY_ID, IMAGE_MODEL_IDS, type ImageModelId } from '@gruenerator/shared/models';
import express, { type Response } from 'express';
import { z } from 'zod';

import { requireAuth } from '../../middleware/authMiddleware.js';
import { validateBody, type TypedRequest } from '../../middleware/validateBody.js';
import { ImageGenerationCounter } from '../../services/counters/index.js';
import { FluxImageService, buildFluxPrompt } from '../../services/flux/index.js';
import { getImageModelForUser } from '../../services/user/imageModelPreference.js';
import { createLogger } from '../../utils/logger.js';
import { redisClient } from '../../utils/redis/index.js';
import { addKiLabel } from '../sharepic/sharepic_canvas/imagine_label_canvas.js';

const log = createLogger('imaginePure');
const router = express.Router();
const imageCounter = new ImageGenerationCounter(redisClient);

// ============================================================================
// Type Definitions
// ============================================================================

type PureImageVariant = 'illustration-pure' | 'realistic-pure' | 'pixel-pure' | 'editorial-pure';

const imaginePureSchema = z.object({
  prompt: z.string().min(5),
  variant: z
    .enum(['illustration-pure', 'realistic-pure', 'pixel-pure', 'editorial-pure'])
    .nullish(),
  imageModel: z.enum(IMAGE_MODEL_IDS as [ImageModelId, ...ImageModelId[]]).nullish(),
  // Deprecated legacy alias kept for one release for non-UI callers.
  backend: z.enum(['hosted', 'regolo', 'ionos']).nullish(),
  seed: z.number().nullish(),
  width: z.number().nullish(),
  height: z.number().nullish(),
});

type ImaginePureRequestBody = z.infer<typeof imaginePureSchema>;

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

function buildPurePrompt(
  userPrompt: string,
  variant: PureImageVariant = 'illustration-pure'
): FluxPromptResult {
  return buildFluxPrompt({
    variant,
    subject: userPrompt,
  }) as FluxPromptResult;
}

// ============================================================================
// Routes
// ============================================================================

/**
 * POST / - Create pure image (no overlays) using FLUX
 * Requires authentication
 */
router.post(
  '/',
  requireAuth,
  validateBody(imaginePureSchema),
  async (req: TypedRequest<ImaginePureRequestBody>, res: Response) => {
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
          message: `You have reached your daily limit of ${limitStatus.limit} image generations. Try again tomorrow.`,
        });
      }

      // Normalize nullish (null | undefined) → default value. The schema uses
      // .nullish() on optional body fields so the frontend can send null;
      // destructuring defaults only fire for undefined, not null, so we
      // explicitly coalesce to the fallback here.
      const {
        prompt,
        variant: rawVariant,
        imageModel: rawImageModel,
        backend: rawBackend,
        seed,
        width,
        height,
      } = req.body;
      const variant: PureImageVariant = rawVariant ?? 'illustration-pure';

      // Resolve the image model: explicit request → legacy `backend` alias → profile default.
      let selectedModelId: ImageModelId | null =
        rawImageModel && IMAGE_MODEL_BY_ID[rawImageModel as ImageModelId]
          ? (rawImageModel as ImageModelId)
          : null;
      if (!selectedModelId && rawBackend) {
        if (rawBackend === 'regolo') selectedModelId = 'regolo-image';
        else if (rawBackend === 'ionos') selectedModelId = 'ionos-image';
        else if (rawBackend === 'hosted') selectedModelId = 'flux-pro';
      }
      if (!selectedModelId) {
        selectedModelId = await getImageModelForUser(userId);
      }
      const selectedModel = IMAGE_MODEL_BY_ID[selectedModelId];

      if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 5) {
        return res.status(400).json({
          success: false,
          error: 'A prompt of at least 5 characters is required',
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

      const validVariants: PureImageVariant[] = [
        'illustration-pure',
        'realistic-pure',
        'pixel-pure',
        'editorial-pure',
      ];
      const selectedVariant: PureImageVariant = validVariants.includes(variant)
        ? variant
        : 'illustration-pure';

      log.debug(
        `[ImaginePure] Starting generation for user ${userId}, variant: ${selectedVariant}, prompt: "${prompt.substring(0, 50)}..."`
      );

      const fluxPromptResult = buildPurePrompt(prompt.trim(), selectedVariant);
      const fluxPrompt = fluxPromptResult.prompt;

      // Use custom dimensions if provided, otherwise use variant defaults
      const dimensions = width && height ? { width, height } : fluxPromptResult.dimensions;

      log.debug(
        `[ImaginePure] Calling FLUX API with dimensions ${dimensions.width}x${dimensions.height}${width && height ? ' (custom)' : ' (variant default)'}`
      );

      log.debug(
        `[ImaginePure] Using image model ${selectedModelId} (backend: ${selectedModel.backend}, cost: ${selectedModel.costMultiplier}×)`
      );

      const flux = await FluxImageService.create(selectedModel.backend, selectedModel.modelPath);
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
        fluxPrompt,
        fluxOptions
      )) as FluxGenerationResult;

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

      const costUnits = Math.round(selectedModel.costMultiplier * 100);
      await imageCounter.incrementCount(userId, costUnits);
      const updatedLimitStatus = await imageCounter.checkLimit(userId);

      log.debug(
        `[ImaginePure] Image saved to ${filePath}, updated usage: ${updatedLimitStatus.count}/${updatedLimitStatus.limit}`
      );

      const base64Output = `data:image/png;base64,${labeledBuffer.toString('base64')}`;

      return res.json({
        success: true,
        image: {
          base64: base64Output,
          path: filePath,
          relativePath: path.join('uploads', 'imagine', 'pure', today, filename),
          filename,
          size: labeledBuffer.length,
        },
        metadata: {
          dimensions: { width: dimensions.width, height: dimensions.height },
          prompt: fluxPrompt,
          variant: selectedVariant,
          imageModel: selectedModelId,
          costMultiplier: selectedModel.costMultiplier,
          timestamp: now.toISOString(),
        },
        usage: {
          count: updatedLimitStatus.count,
          remaining: updatedLimitStatus.remaining,
          limit: updatedLimitStatus.limit,
        },
      });
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const typed = error as { type?: string; retryable?: boolean; response?: { status?: number } };
      log.error('[ImaginePure] Error during image creation:', errMsg);

      if (typed.response?.status) {
        log.error('[ImaginePure] API response status:', typed.response.status);
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
