import fs from 'fs';
import path from 'path';

import { kiLabelModeSchema } from '@gruenerator/contracts';
import { IMAGE_FORMAT_IDS, type ImageFormatId } from '@gruenerator/shared/image-studio';
import express, { type Response } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { z } from 'zod';

import { requireAuth } from '../../middleware/authMiddleware.js';
import { requireAiConsent } from '../../middleware/requireAiConsent.js';
import { type AuthenticatedRequest } from '../../middleware/types.js';
import { ImageGenerationCounter } from '../../services/counters/index.js';
import { FluxImageService } from '../../services/flux/index.js';
import {
  computeOutpaintGeometry,
  OutpaintGeometryError,
  OUTPAINT_MAX_AREA,
  OUTPAINT_MAX_SIDE,
  OUTPAINT_MIN_SIDE,
} from '../../services/flux/outpaintGeometry.js';
import { createLogger } from '../../utils/logger.js';
import { redisClient } from '../../utils/redis/index.js';
import { applyKiLabel } from '../sharepic/sharepic_canvas/imagine_label_canvas.js';

const log = createLogger('outpaint');
const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
const imageCounter = new ImageGenerationCounter(redisClient);

const presetAspectSchema = z.enum(IMAGE_FORMAT_IDS as [ImageFormatId, ...ImageFormatId[]]);

// Multipart form field: which AI label to burn into the result — 'full'
// ("KI-Generiert mit dem Grünerator", default), 'short' ("KI-Generiert"),
// or 'none' so users can apply their own labeling.
const kiLabelFieldSchema = kiLabelModeSchema.nullish();

const bodySchema = z.union([
  z.object({ aspectRatio: presetAspectSchema, kiLabel: kiLabelFieldSchema }),
  z
    .object({
      aspectRatio: z.literal('custom'),
      width: z.coerce.number().int().min(OUTPAINT_MIN_SIDE).max(OUTPAINT_MAX_SIDE),
      height: z.coerce.number().int().min(OUTPAINT_MIN_SIDE).max(OUTPAINT_MAX_SIDE),
      kiLabel: kiLabelFieldSchema,
    })
    .refine((d) => d.width * d.height <= OUTPAINT_MAX_AREA, {
      message: `Bild zu groß — maximal ${OUTPAINT_MAX_AREA / 1_000_000} Megapixel (Breite × Höhe).`,
      path: ['width'],
    }),
]);

router.post(
  '/',
  requireAuth,
  requireAiConsent,
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

      // A preset lets the server own the geometry: the canvas grows around the
      // source and, when that would break the budget, source and canvas are
      // scaled down together so every offered format is reachable (#3388).
      // `custom` stays for already-shipped clients that compute it themselves.
      let target: { width: number; height: number };
      let sourceBuffer = req.file.buffer;
      if (parsed.data.aspectRatio === 'custom') {
        target = { width: parsed.data.width, height: parsed.data.height };
      } else {
        const { width: srcWidth, height: srcHeight } = await sharp(req.file.buffer).metadata();
        if (!srcWidth || !srcHeight) {
          return res
            .status(400)
            .json({ success: false, error: 'Bild konnte nicht gelesen werden' });
        }
        const geo = computeOutpaintGeometry(srcWidth, srcHeight, parsed.data.aspectRatio);
        target = { width: geo.width, height: geo.height };
        if (geo.needsResize) {
          sourceBuffer = await sharp(req.file.buffer)
            .resize(geo.sourceWidth, geo.sourceHeight, { fit: 'fill' })
            .jpeg({ quality: 92 })
            .toBuffer();
          log.debug(
            `[Outpaint] Scaled source ${srcWidth}x${srcHeight} → ${geo.sourceWidth}x${geo.sourceHeight} to fit the ${parsed.data.aspectRatio} canvas`
          );
        }
      }
      log.debug(
        `[Outpaint] User ${userId} expanding ${Math.round(req.file.size / 1024)}KB image to ${target.width}x${target.height} (${parsed.data.aspectRatio})`
      );

      const flux = await FluxImageService.create('hosted');
      const { stored } = await flux.outpaintImage(sourceBuffer, {
        width: target.width,
        height: target.height,
        output_format: 'jpeg',
      });

      const fluxBuffer = fs.readFileSync(stored.filePath);
      const kiLabel = parsed.data.kiLabel ?? 'full';
      const labeledBuffer = await applyKiLabel(fluxBuffer, kiLabel);
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
      if (error instanceof OutpaintGeometryError) {
        return res.status(400).json({ success: false, error: errMsg, type: 'validation' });
      }
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
