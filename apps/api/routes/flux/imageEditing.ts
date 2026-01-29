import fs from 'fs';
import path from 'path';

import express, { type Response } from 'express';
import multer from 'multer';

import { requireAuth } from '../../middleware/authMiddleware.js';
import { ImageGenerationCounter } from '../../services/counters/index.js';
import { FluxImageService } from '../../services/flux/index.js';
import { createLogger } from '../../utils/logger.js';
import { redisClient } from '../../utils/redis/index.js';

import type { AuthenticatedRequest } from '../../middleware/types.js';

const log = createLogger('imageEditing');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
const imageCounter = new ImageGenerationCounter(redisClient as any);

// ============================================================================
// Type Definitions
// ============================================================================

type ImageEditType = 'green-edit' | 'ally-maker' | 'universal';

interface PromptRequestBody {
  text?: string;
  instruction?: string;
  precision?: boolean | string;
  type?: ImageEditType;
}

type GenerateRequestBody = PromptRequestBody;

interface PromptConstraints {
  preserve?: string[];
  match?: string[];
  maintain?: string[];
  requirements?: string[];
}

interface PromptStructure {
  scene?: string;
  edit: string;
  add?: string[];
  style: string;
  constraints: PromptConstraints;
  quality: string;
}

interface StoredImageResult {
  filePath: string;
  relativePath: string;
  filename: string;
  size: number;
  base64: string;
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
// Prompt Building Functions
// ============================================================================

function buildGreenEditPrompt(userText: string, isPrecision = false): string {
  const trimmed = (userText || '').toString().trim();
  const hasUserInput = trimmed.length > 0;
  const lowerInput = trimmed.toLowerCase();

  const editDescription = hasUserInput
    ? `Apply green urban transformation: ${trimmed}`
    : 'Transform into an ecological, green, pleasant urban space';

  if (isPrecision && hasUserInput) {
    const promptStructure: PromptStructure = {
      scene: 'Street-level urban photograph',
      edit: editDescription,
      style: 'Photorealistic, matching original lighting and perspective',
      constraints: {
        preserve: [
          'architecture',
          'facades',
          'street layout',
          'camera angle',
          'people',
          'vehicles',
          'signage',
        ],
        match: ['textures', 'materials', 'shadows', 'light direction'],
      },
      quality: 'Ultra-realistic edit, true-to-scale integration, no artifacts',
    };
    return JSON.stringify(promptStructure, null, 2);
  }

  const greenElements: string[] = [];
  if (
    !hasUserInput ||
    lowerInput.includes('baum') ||
    lowerInput.includes('bäume') ||
    lowerInput.includes('tree')
  ) {
    greenElements.push('Native street trees in permeable strips, 6-10m spacing');
  }
  if (
    !hasUserInput ||
    lowerInput.includes('pflanz') ||
    lowerInput.includes('blume') ||
    lowerInput.includes('grün') ||
    lowerInput.includes('plant') ||
    lowerInput.includes('flower')
  ) {
    greenElements.push('Native perennials, pollinator-friendly flowers');
  }
  if (
    !hasUserInput ||
    lowerInput.includes('fahrrad') ||
    lowerInput.includes('bike') ||
    lowerInput.includes('rad') ||
    lowerInput.includes('cycle')
  ) {
    greenElements.push('Protected bike lanes with green paint, 1.6-2.0m width');
  }
  if (
    !hasUserInput ||
    lowerInput.includes('gehweg') ||
    lowerInput.includes('fußgänger') ||
    lowerInput.includes('pedestrian') ||
    lowerInput.includes('sidewalk')
  ) {
    greenElements.push('Wider sidewalks, raised crosswalks');
  }
  if (
    !hasUserInput ||
    lowerInput.includes('bank') ||
    lowerInput.includes('sitz') ||
    lowerInput.includes('bench') ||
    lowerInput.includes('seat')
  ) {
    greenElements.push('Comfortable benches with backrests near shade');
  }
  if (
    !hasUserInput ||
    lowerInput.includes('straßenbahn') ||
    lowerInput.includes('tram') ||
    lowerInput.includes('bahn')
  ) {
    greenElements.push('Modern tram line with grass tracks');
  }
  if (
    !hasUserInput ||
    lowerInput.includes('bus') ||
    lowerInput.includes('haltestelle') ||
    lowerInput.includes('stop')
  ) {
    greenElements.push('Modern bus stop with green roof shelter');
  }

  const promptStructure: PromptStructure = {
    scene: 'Street-level urban photograph',
    edit: editDescription,
    add: greenElements,
    style: 'Photorealistic urban planning visualization',
    constraints: {
      preserve: [
        'original architecture',
        'facades',
        'skyline',
        'street layout',
        'camera angle',
        'lighting',
      ],
      maintain: ['existing people', 'vehicles', 'storefronts', 'signage text'],
    },
    quality: 'Photorealistic, true-to-scale, no artifacts or fantasy elements',
  };

  return JSON.stringify(promptStructure, null, 2);
}

function buildAllyMakerPrompt(placementText: string, isPrecision = false): string {
  const trimmed = (placementText || '').toString().trim();
  const hasPlacement = trimmed.length > 0;

  const editDescription = hasPlacement
    ? `Add a small rainbow flag tattoo on ${trimmed}`
    : 'Add a small rainbow flag tattoo on visible skin area, not covering face';

  const promptStructure: PromptStructure = {
    edit: editDescription,
    style: 'Natural, realistic, professionally done tattoo',
    constraints: {
      preserve: ['face', 'hair', 'expression', 'pose', 'clothing', 'background'],
      requirements: ['natural integration with skin tone', 'match lighting and shadows'],
    },
    quality: 'Realistic tattoo appearance, natural integration',
  };

  return JSON.stringify(promptStructure, null, 2);
}

function buildUniversalPrompt(userText: string): string {
  const trimmed = (userText || '').toString().trim();

  const promptStructure: PromptStructure = {
    edit: trimmed,
    style: 'Photorealistic, maintaining original image quality',
    constraints: {
      preserve: ['Aspects not mentioned in edit instruction'],
      match: ['Original lighting, shadows, and textures'],
    },
    quality: 'Photorealistic edit',
  };

  return JSON.stringify(promptStructure, null, 2);
}

// ============================================================================
// Routes
// ============================================================================

/**
 * POST /prompt - Edit an uploaded image with FLUX image-to-image
 * Requires authentication and image upload
 */
router.post(
  '/prompt',
  requireAuth,
  upload.single('image'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        log.debug('[Image Edit] Request rejected: User ID not found');
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      const limitStatus = await imageCounter.checkLimit(userId);
      if (!limitStatus.canGenerate) {
        log.debug(
          `[Image Edit] Request rejected: User ${userId} has reached daily limit (${limitStatus.count}/${limitStatus.limit})`
        );
        return res.status(429).json({
          success: false,
          error: 'Daily image generation limit reached',
          data: limitStatus,
          message: `You have reached your daily limit of ${limitStatus.limit} image generations. Try again tomorrow.`,
        });
      }

      const body = req.body as PromptRequestBody;
      const userText = body.text || body.instruction || '';
      const isPrecision = body.precision === 'true' || body.precision === true;
      log.debug(
        `[Image Edit] Processing request with instruction: "${userText?.substring(0, 100)}..." (User: ${userId}, Usage: ${limitStatus.count + 1}/${limitStatus.limit}, Precision: ${isPrecision})`
      );

      if (!userText || userText.trim().length === 0) {
        log.debug('[Image Edit] Request rejected: Missing text instruction');
        return res.status(400).json({ success: false, error: 'Missing text instruction' });
      }

      if (!req.file) {
        log.debug('[Image Edit] Request rejected: Missing image file');
        return res.status(400).json({ success: false, error: 'Missing image file' });
      }

      log.debug(
        `[Image Edit] Processing image: ${req.file.originalname}, size: ${Math.round(req.file.size / 1024)}KB, type: ${req.file.mimetype}`
      );

      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const baseDir = path.join(process.cwd(), 'uploads', 'flux', 'edits', today);
      if (!fs.existsSync(baseDir)) {
        fs.mkdirSync(baseDir, { recursive: true });
      }

      const originalExt = path.extname(req.file.originalname || '').toLowerCase();
      const guessedExt =
        req.file.mimetype === 'image/png'
          ? '.png'
          : req.file.mimetype === 'image/jpeg'
            ? '.jpg'
            : originalExt || '.bin';
      const safeBase = now.toISOString().replace(/[:.]/g, '-');
      const filename = `input_${safeBase}${guessedExt}`;
      const filePath = path.join(baseDir, filename);
      fs.writeFileSync(filePath, req.file.buffer);

      const stats = fs.statSync(filePath);
      const relativePath = path.join('uploads', 'flux', 'edits', today, filename);

      const requestType: ImageEditType = (body.type as ImageEditType) || 'green-edit';
      const prompt =
        requestType === 'ally-maker'
          ? buildAllyMakerPrompt(userText, isPrecision)
          : requestType === 'universal'
            ? buildUniversalPrompt(userText)
            : buildGreenEditPrompt(userText, isPrecision);

      const flux = FluxImageService.create();
      log.debug(`[Image Edit] Starting image generation with FLUX.2 Pro`);
      const { request, result, stored } = (await flux.generateFromImage(
        prompt,
        req.file.buffer,
        req.file.mimetype,
        { output_format: 'jpeg', safety_tolerance: 2 }
      )) as FluxGenerationResult;

      log.debug(
        `[Image Edit] Image generation completed successfully, output size: ${Math.round(stored.size / 1024)}KB`
      );

      const incrementResult = await imageCounter.incrementCount(userId);
      log.debug(`[Image Edit] Updated usage counter for user ${userId}:`, incrementResult);

      return res.json({
        success: true,
        prompt,
        request: { id: request.id, polling_url: request.polling_url },
        result: { status: result.status, sample: result.result.sample },
        inputImage: {
          filename,
          path: filePath,
          relativePath,
          size: stats.size,
          mimetype: req.file.mimetype,
        },
        image: {
          path: stored.filePath,
          relativePath: stored.relativePath,
          filename: stored.filename,
          size: stored.size,
          base64: `data:image/jpeg;base64,${stored.base64}`,
        },
        mode: 'pro',
      });
    } catch (error: any) {
      log.error('[Image Edit] Error during image generation:', error.message);
      if (error.response?.status) {
        log.error('[Image Edit] API response status:', error.response.status);
        log.error('[Image Edit] API response data:', error.response.data);
      }

      const statusCode =
        error.type === 'validation'
          ? 400
          : error.type === 'billing'
            ? 402
            : error.retryable === false
              ? 400
              : 500;

      return res.status(statusCode).json({
        success: false,
        error: error.message || 'Failed to generate image',
        type: error.type || 'unknown',
        retryable: error.retryable || false,
        ...(error.type === 'network' && {
          hint: 'Please check your internet connection and try again',
        }),
        ...(error.type === 'billing' && { hint: 'Please add credits to your BFL account' }),
        ...(error.type === 'server' && {
          hint: 'The service is temporarily unavailable. Please try again in a few minutes',
        }),
      });
    }
  }
);

/**
 * POST /generate - Generate or edit image with FLUX (supports both text-to-image and image-to-image)
 * Requires authentication, image upload is optional
 */
router.post(
  '/generate',
  requireAuth,
  upload.single('image'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        log.debug('[Image Edit Generate] Request rejected: User ID not found');
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      const limitStatus = await imageCounter.checkLimit(userId);
      if (!limitStatus.canGenerate) {
        log.debug(
          `[Image Edit Generate] Request rejected: User ${userId} has reached daily limit (${limitStatus.count}/${limitStatus.limit})`
        );
        return res.status(429).json({
          success: false,
          error: 'Daily image generation limit reached',
          data: limitStatus,
          message: `You have reached your daily limit of ${limitStatus.limit} image generations. Try again tomorrow.`,
        });
      }

      const body = req.body as GenerateRequestBody;
      const userText = body.text || body.instruction || '';
      const isPrecision = body.precision === 'true' || body.precision === true;
      log.debug(
        `[Image Edit Generate] Processing request with instruction: "${userText?.substring(0, 100)}..." (User: ${userId}, Usage: ${limitStatus.count + 1}/${limitStatus.limit}, Precision: ${isPrecision})`
      );

      if (!userText || userText.trim().length === 0) {
        log.debug('[Image Edit Generate] Request rejected: Missing text instruction');
        return res.status(400).json({ success: false, error: 'Missing text instruction' });
      }

      const now = new Date();
      const today = now.toISOString().split('T')[0];
      let inputPath: string | null = null;

      if (req.file) {
        const inputDir = path.join(process.cwd(), 'uploads', 'flux', 'edits', today);
        fs.mkdirSync(inputDir, { recursive: true });
        const originalExt = path.extname(req.file.originalname || '').toLowerCase();
        const guessedExt =
          req.file.mimetype === 'image/png'
            ? '.png'
            : req.file.mimetype === 'image/jpeg'
              ? '.jpg'
              : originalExt || '.bin';
        const safeBase = now.toISOString().replace(/[:.]/g, '-');
        const inputFilename = `input_${safeBase}${guessedExt}`;
        inputPath = path.join(inputDir, inputFilename);
        fs.writeFileSync(inputPath, req.file.buffer);
      }

      const requestType: ImageEditType = (body.type as ImageEditType) || 'green-edit';
      const prompt =
        requestType === 'ally-maker'
          ? buildAllyMakerPrompt(userText, isPrecision)
          : requestType === 'universal'
            ? buildUniversalPrompt(userText)
            : buildGreenEditPrompt(userText, isPrecision);

      const flux = FluxImageService.create();
      let generationResult: FluxGenerationResult;

      if (req.file) {
        generationResult = (await flux.generateFromImage(
          prompt,
          req.file.buffer,
          req.file.mimetype,
          { output_format: 'jpeg', safety_tolerance: 2 }
        )) as FluxGenerationResult;
      } else {
        generationResult = (await flux.generateFromPrompt(prompt, {
          output_format: 'jpeg',
          safety_tolerance: 2,
        })) as FluxGenerationResult;
      }

      const { request, result, stored } = generationResult;

      log.debug(
        `[Image Edit Generate] Image generation completed successfully, output size: ${Math.round(stored.size / 1024)}KB`
      );

      const incrementResult = await imageCounter.incrementCount(userId);
      log.debug(`[Image Edit Generate] Updated usage counter for user ${userId}:`, incrementResult);

      return res.json({
        success: true,
        prompt,
        request: { id: request.id, polling_url: request.polling_url },
        result: { status: result.status, sample: result.result.sample },
        image: {
          path: stored.filePath,
          relativePath: stored.relativePath,
          filename: stored.filename,
          size: stored.size,
          base64: `data:image/jpeg;base64,${stored.base64}`,
        },
        mode: 'pro',
      });
    } catch (error: any) {
      log.error('[Image Edit Generate] Error during image generation:', error.message);
      if (error.response?.status) {
        log.error('[Image Edit Generate] API response status:', error.response.status);
        log.error('[Image Edit Generate] API response data:', error.response.data);
      }

      const statusCode =
        error.type === 'validation'
          ? 400
          : error.type === 'billing'
            ? 402
            : error.retryable === false
              ? 400
              : 500;

      return res.status(statusCode).json({
        success: false,
        error: error.message || 'Failed to generate image',
        type: error.type || 'unknown',
        retryable: error.retryable || false,
        ...(error.type === 'network' && {
          hint: 'Please check your internet connection and try again',
        }),
        ...(error.type === 'billing' && { hint: 'Please add credits to your BFL account' }),
        ...(error.type === 'server' && {
          hint: 'The service is temporarily unavailable. Please try again in a few minutes',
        }),
      });
    }
  }
);

export default router;
