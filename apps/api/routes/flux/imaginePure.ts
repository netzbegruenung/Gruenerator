import fs from 'fs';
import path from 'path';

import { kiLabelModeSchema, type Flux3Layout } from '@gruenerator/contracts';
import { getImageFormat } from '@gruenerator/shared/image-studio';
import { IMAGE_MODEL_BY_ID, IMAGE_MODEL_IDS, type ImageModelId } from '@gruenerator/shared/models';
import express, { type Response } from 'express';
import { z } from 'zod';

import { requireAuth } from '../../middleware/authMiddleware.js';
import { requireAiConsent } from '../../middleware/requireAiConsent.js';
import { validateBody, type TypedRequest } from '../../middleware/validateBody.js';
import { serializeLayout } from '../../services/flux/flux3Boxes.js';
import { planLayout } from '../../services/flux/flux3BoxPlanner.js';
import { isFlux3Path, toFlux3AspectRatio } from '../../services/flux/FluxImageService.js';
import { inferImageSetup } from '../../services/flux/imageSetup.js';
import { FluxImageService, VARIANTS, buildFluxPrompt } from '../../services/flux/index.js';
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
  // 'ionos' and 'regolo' are accepted but remapped — both backends are retired
  // ('regolo' resolves to the Melious model, see below).
  backend: z.enum(['hosted', 'regolo', 'melious', 'ionos']).nullish(),
  seed: z.number().nullish(),
  width: z.number().nullish(),
  height: z.number().nullish(),
  // Which AI label to burn into the result: 'full' ("KI-Generiert mit dem
  // Grünerator", default), 'short' ("KI-Generiert"), or 'none' so users can
  // apply their own AI labeling.
  kiLabel: kiLabelModeSchema.nullish(),
  // Experimental, FLUX 3 only: let a model plan a caption + bounding-box table
  // first and generate from that layout.
  layout: z.boolean().nullish(),
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
  variant: PureImageVariant = 'realistic-pure'
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

      // Resolve the image model: explicit request → legacy `backend` alias → profile default.
      let selectedModelId: ImageModelId | null =
        rawImageModel && IMAGE_MODEL_BY_ID[rawImageModel as ImageModelId]
          ? (rawImageModel as ImageModelId)
          : null;
      if (!selectedModelId && rawBackend) {
        // `regolo-image` is the legacy id of the Melious-served model (F0).
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

      // What the request does not fix itself, the model reads from the prompt: the style
      // (realistic unless asked otherwise) and the format. Explicit values always win.
      const needsSetup = !rawVariant || !(width && height);
      const setup = needsSetup ? await inferImageSetup(prompt.trim()) : null;
      const selectedVariant: PureImageVariant = rawVariant ?? setup?.style ?? 'realistic-pure';
      const inferredSize = setup ? getImageFormat(setup.format) : null;

      log.debug(
        `[ImaginePure] Starting generation for user ${userId}, variant: ${selectedVariant}, prompt: "${prompt.substring(0, 50)}..."`
      );

      const fluxPromptResult = buildPurePrompt(prompt.trim(), selectedVariant);
      let fluxPrompt = fluxPromptResult.prompt;

      // Use custom dimensions if provided, otherwise use variant defaults
      const dimensions =
        width && height ? { width, height } : (inferredSize ?? fluxPromptResult.dimensions);

      log.debug(
        `[ImaginePure] Calling FLUX API with dimensions ${dimensions.width}x${dimensions.height}${width && height ? ' (custom)' : setup ? ` (inferred ${setup.format})` : ' (variant default)'}`
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
        aspect_ratio?: string;
      } = {
        width: dimensions.width,
        height: dimensions.height,
        output_format: 'jpeg' as const,
        safety_tolerance: 2,
      };

      let layout: Flux3Layout | null = null;
      if (req.body.layout && selectedModel.modelPath && isFlux3Path(selectedModel.modelPath)) {
        // The boxes are drawn for one ratio; send exactly that one.
        const aspectRatio = toFlux3AspectRatio(dimensions.width, dimensions.height);
        // The planner gets the user's own words plus the style — NOT the pure
        // prompt, whose "Wordless artistic scene" would forbid every text box.
        const idea = `${prompt.trim()}\n\nStyle: ${VARIANTS[selectedVariant].style}`;
        try {
          layout = await planLayout(idea, aspectRatio);
        } catch (error) {
          log.warn('[ImaginePure] Layout planning failed:', error);
        }
        if (layout) {
          log.debug(
            `[ImaginePure] Layout ${aspectRatio}: ${layout.caption} | ${layout.rows
              .map((r) => `${r.id} [${r.bbox.join(',')}] ${r.desc}`)
              .join(' | ')}`
          );
          fluxPrompt = serializeLayout(layout);
          fluxOptions.aspect_ratio = aspectRatio;
        } else {
          log.warn('[ImaginePure] No valid layout, generating from the plain prompt');
        }
      }

      if (seed && Number.isInteger(seed)) {
        fluxOptions.seed = seed;
      }

      let fluxResult: StoredImageResult;
      try {
        // Inside the try: a failing `create()` would otherwise keep the booking.
        const flux = await FluxImageService.create(
          selectedModel.backend,
          selectedModel.modelPath,
          selectedModel.resolution
        );
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
          layout,
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
