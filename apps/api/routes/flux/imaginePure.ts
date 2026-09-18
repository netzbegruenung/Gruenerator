import fs from 'fs';
import path from 'path';

import { kiLabelModeSchema } from '@gruenerator/contracts';
import { IMAGE_MODEL_BY_ID, IMAGE_MODEL_IDS, type ImageModelId } from '@gruenerator/shared/models';
import express, { type Response } from 'express';
import { z } from 'zod';

import { requireAuth } from '../../middleware/authMiddleware.js';
import { requireAiConsent } from '../../middleware/requireAiConsent.js';
import { validateBody, type TypedRequest } from '../../middleware/validateBody.js';
import { FluxImageService, buildFluxPrompt } from '../../services/flux/index.js';
import {
  getTreeBudget,
  toTreeBudgetStatusDto,
  treeBudgetSpentMessage,
  treeCostForImage,
  TreeBudgetUnavailableError,
} from '../../services/trees/index.js';
import { getImageModelForUser } from '../../services/user/imageModelPreference.js';
import { createLogger } from '../../utils/logger.js';
import { applyKiLabel } from '../sharepic/sharepic_canvas/imagine_label_canvas.js';

const log = createLogger('imaginePure');
const router = express.Router();

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
  // 'ionos' is accepted but remapped — the IONOS backend is retired.
  backend: z.enum(['hosted', 'regolo', 'melious', 'ionos']).nullish(),
  seed: z.number().nullish(),
  width: z.number().nullish(),
  height: z.number().nullish(),
  // Which AI label to burn into the result: 'full' ("KI-Generiert mit dem
  // Grünerator", default), 'short' ("KI-Generiert"), or 'none' so users can
  // apply their own AI labeling.
  kiLabel: kiLabelModeSchema.nullish(),
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
  requireAiConsent,
  validateBody(imaginePureSchema),
  async (req: TypedRequest<ImaginePureRequestBody>, res: Response) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        log.debug('[ImaginePure] Request rejected: User ID not found');
        return res.status(401).json({ success: false, error: 'Authentication required' });
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
        if (rawBackend === 'regolo' || rawBackend === 'melious') selectedModelId = 'regolo-image';
        else selectedModelId = 'flux-pro';
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

      const cost = treeCostForImage(selectedModel.costMultiplier);
      const budget = getTreeBudget();
      const reservation = await budget.reserve(userId, cost);
      if (!reservation.ok) {
        if (reservation.reason === 'unavailable') {
          return res
            .status(503)
            .json({ success: false, error: new TreeBudgetUnavailableError().message });
        }
        log.debug(`[ImaginePure] Request rejected: User ${userId} has reached the tree budget`);
        const message = treeBudgetSpentMessage(reservation.status, cost);
        return res.status(429).json({
          success: false,
          error: message,
          data: toTreeBudgetStatusDto(reservation.status),
          message,
        });
      }

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

      let fluxResult: StoredImageResult;
      try {
        // Inside the try: a failing `create()` would otherwise keep the booking.
        const flux = await FluxImageService.create(selectedModel.backend, selectedModel.modelPath);
        ({ stored: fluxResult } = (await flux.generateFromPrompt(
          fluxPrompt,
          fluxOptions
        )) as FluxGenerationResult);
      } catch (error) {
        await budget.release(userId, cost, reservation.status.day);
        throw error;
      }

      log.debug(`[ImaginePure] FLUX image generated, size: ${fluxResult.size} bytes`);

      const fluxImageBuffer = fs.readFileSync(fluxResult.filePath);

      const kiLabel = req.body.kiLabel ?? 'full';
      const labeledBuffer = await applyKiLabel(fluxImageBuffer, kiLabel);

      log.debug(`[ImaginePure] KI label (${kiLabel}), final size: ${labeledBuffer.length} bytes`);

      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const baseDir = path.join(process.cwd(), 'uploads', 'imagine', 'pure', today);

      if (!fs.existsSync(baseDir)) {
        fs.mkdirSync(baseDir, { recursive: true });
      }

      const filename = `pure_${now.toISOString().replace(/[:.]/g, '-')}.png`;
      const filePath = path.join(baseDir, filename);
      fs.writeFileSync(filePath, labeledBuffer);

      log.debug(`[ImaginePure] Image saved to ${filePath}`);

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
        usage: toTreeBudgetStatusDto(reservation.status),
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
