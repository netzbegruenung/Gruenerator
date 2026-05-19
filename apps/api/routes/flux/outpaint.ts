import fs from 'fs';
import path from 'path';

import express, { type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';

import { requireAuth } from '../../middleware/authMiddleware.js';
import { type AuthenticatedRequest } from '../../middleware/types.js';
import { ImageGenerationCounter } from '../../services/counters/index.js';
import { FluxImageService } from '../../services/flux/index.js';
import { createLogger } from '../../utils/logger.js';
import { redisClient } from '../../utils/redis/index.js';
import { addKiLabel } from '../sharepic/sharepic_canvas/imagine_label_canvas.js';

const log = createLogger('outpaint');
const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
const imageCounter = new ImageGenerationCounter(redisClient);

const presetAspectSchema = z.enum(['16:9', '4:3', '1:1', '3:4', '9:16']);
type PresetAspect = z.infer<typeof presetAspectSchema>;

const MAX_AREA_PIXELS = 4_194_304; // BFL's 4MP cap

const bodySchema = z.union([
  z.object({ aspectRatio: presetAspectSchema }),
  z
    .object({
      aspectRatio: z.literal('custom'),
      width: z.coerce.number().int().min(256).max(2048),
      height: z.coerce.number().int().min(256).max(2048),
    })
    .refine((d) => d.width * d.height <= MAX_AREA_PIXELS, {
      message: `Bild zu groß — maximal ${MAX_AREA_PIXELS / 1_000_000} Megapixel (Breite × Höhe).`,
      path: ['width'],
    }),
]);

// Target canvas dimensions per aspect — keeps the output under BFL's 4MP cap
// while staying close to typical social-media sizes.
const ASPECT_DIMENSIONS: Record<PresetAspect, { width: number; height: number }> = {
  '16:9': { width: 1600, height: 896 },
  '4:3': { width: 1408, height: 1056 },
  '1:1': { width: 1280, height: 1280 },
  '3:4': { width: 1056, height: 1408 },
  '9:16': { width: 896, height: 1600 },
};

router.post(
  '/',
  requireAuth,
  upload.single('image'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'Image file is required' });
      }

      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request body',
          details: parsed.error.flatten(),
        });
      }

      const limitStatus = await imageCounter.checkLimit(userId);
      if (!limitStatus.canGenerate) {
        return res.status(429).json({
          success: false,
          error: 'Daily image generation limit reached',
          data: limitStatus,
          message: `Du hast dein Tageskontingent von ${limitStatus.limit} Bildern erreicht.`,
        });
      }

      const target =
        parsed.data.aspectRatio === 'custom'
          ? { width: parsed.data.width, height: parsed.data.height }
          : ASPECT_DIMENSIONS[parsed.data.aspectRatio];
      log.debug(
        `[Outpaint] User ${userId} expanding ${Math.round(req.file.size / 1024)}KB image to ${target.width}x${target.height} (${parsed.data.aspectRatio})`
      );

      const flux = await FluxImageService.create('hosted');
      const { stored } = await flux.outpaintImage(req.file.buffer, {
        width: target.width,
        height: target.height,
        output_format: 'jpeg',
      });

      const fluxBuffer = fs.readFileSync(stored.filePath);
      const labeledBuffer = await addKiLabel(fluxBuffer);
      const labeledBase64 = labeledBuffer.toString('base64');

      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const baseDir = path.join(process.cwd(), 'uploads', 'imagine', 'outpaint', today);
      if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });
      const filename = `outpaint_${now.toISOString().replace(/[:.]/g, '-')}.jpg`;
      const filePath = path.join(baseDir, filename);
      fs.writeFileSync(filePath, labeledBuffer);

      await imageCounter.incrementCount(userId);
      const updatedStatus = await imageCounter.checkLimit(userId);

      return res.json({
        success: true,
        image: {
          base64: `data:image/jpeg;base64,${labeledBase64}`,
          path: filePath,
          relativePath: path.join('uploads', 'imagine', 'outpaint', today, filename),
          filename,
          size: labeledBuffer.length,
        },
        metadata: {
          dimensions: { width: target.width, height: target.height },
          aspectRatio: parsed.data.aspectRatio,
          timestamp: now.toISOString(),
        },
        usage: {
          count: updatedStatus.count,
          remaining: updatedStatus.remaining,
          limit: updatedStatus.limit,
        },
      });
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      log.error('[Outpaint] Error during outpainting:', errMsg);
      const typed = error as { type?: string; retryable?: boolean };
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
        error: errMsg || 'Failed to outpaint image',
        type: typed.type || 'unknown',
      });
    }
  }
);

export default router;
