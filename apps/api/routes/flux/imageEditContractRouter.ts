/**
 * ts-rest contract router for POST /api/image-edit — FLUX.2 image editing
 * with 1–8 reference images (multi-reference).
 *
 * Replaces the legacy multipart POST /api/flux/green-edit/prompt for typed
 * web clients; the legacy route stays mounted for old consumers. requireAuth
 * runs at the mount prefix in routes.ts.
 */
import fs from 'fs';

import { imageEditContract } from '@gruenerator/contracts';
import { IMAGE_MODEL_BY_ID } from '@gruenerator/shared/models';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { ImageGenerationCounter } from '../../services/counters/index.js';
import {
  FluxImageService,
  buildUniversalPrompt,
  type GenerateResult,
  type ReferenceImage,
} from '../../services/flux/index.js';
import { fitToBudget } from '../../services/flux/referenceImages.js';
import { getImageModelForUser } from '../../services/user/imageModelPreference.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';
import { redisClient } from '../../utils/redis/index.js';
import { addKiLabel } from '../sharepic/sharepic_canvas/imagine_label_canvas.js';

import { buildGreenEditPrompt, buildAllyMakerPrompt } from './imageEditing.js';

import type { ImageModelId } from '@gruenerator/shared/models';
import type { Application } from 'express';

const log = createLogger('imageEditContractRouter');

const s = initServer();
const imageCounter = new ImageGenerationCounter(redisClient);

export const imageEditContractRouter = s.router(imageEditContract, {
  edit: async ({ req, body }) => {
    try {
      const userId = getAuthedUser(req).id;

      const limitStatus = await imageCounter.checkLimit(userId);
      if (!limitStatus.canGenerate) {
        return {
          status: 429 as const,
          body: {
            success: false as const,
            error: `Tageslimit von ${limitStatus.limit} Bildgenerierungen erreicht. Versuche es morgen wieder.`,
            data: {
              count: limitStatus.count,
              remaining: limitStatus.remaining,
              limit: limitStatus.limit,
            },
          },
        };
      }

      const modelId: ImageModelId = body.imageModel ?? (await getImageModelForUser(userId));
      const model = IMAGE_MODEL_BY_ID[modelId];
      const maxRefs = model.maxReferenceImages ?? 1;

      if (body.images.length > 1 && model.backend !== 'hosted') {
        return {
          status: 400 as const,
          body: {
            success: false as const,
            error: `Mehrere Referenzbilder werden nur mit Flux-Modellen unterstützt. Bitte wähle Flux Klein, Pro oder Max als Bildmodell.`,
          },
        };
      }
      if (body.images.length > maxRefs) {
        return {
          status: 400 as const,
          body: {
            success: false as const,
            error: `Maximal ${maxRefs} Referenzbilder für ${model.name}. Du hast ${body.images.length} übergeben.`,
          },
        };
      }

      const instruction = body.instruction.trim();
      if (!instruction) {
        return {
          status: 400 as const,
          body: { success: false as const, error: 'Bitte gib eine Bearbeitungsanweisung an.' },
        };
      }

      const references: ReferenceImage[] = body.images.map((img) => ({
        buffer: Buffer.from(img.data, 'base64'),
        mimeType: img.type,
      }));
      const processed = await fitToBudget(references);

      const editType = body.editType ?? 'universal';
      const isPrecision = body.precision ?? true;
      const prompt =
        body.images.length > 1
          ? buildUniversalPrompt(instruction, body.images.length)
          : editType === 'ally-maker'
            ? buildAllyMakerPrompt(instruction, isPrecision)
            : editType === 'green-edit'
              ? buildGreenEditPrompt(instruction, isPrecision)
              : buildUniversalPrompt(instruction);

      log.debug(
        `[imageEdit] ${processed.length} reference image(s), model ${model.id}, type ${editType} (User: ${userId})`
      );

      const flux = await FluxImageService.create(model.backend, model.modelPath);
      const { stored }: GenerateResult = await flux.generateFromImages(prompt, processed, {
        output_format: 'jpeg',
        safety_tolerance: 2,
      });

      const rawBuffer = Buffer.from(stored.base64, 'base64');
      const outputBuffer =
        body.kiLabel === 'none'
          ? rawBuffer
          : await addKiLabel(rawBuffer, body.kiLabel === 'short' ? 'short' : 'full');
      fs.writeFileSync(stored.filePath, outputBuffer);

      const incrementResult = await imageCounter.incrementCount(
        userId,
        Math.round(model.costMultiplier * 100)
      );

      return {
        status: 200 as const,
        body: {
          success: true as const,
          image: {
            base64: outputBuffer.toString('base64'),
            filename: stored.filename,
          },
          prompt,
          model: model.id,
          usage: {
            count: incrementResult.count,
            remaining: incrementResult.remaining,
            limit: incrementResult.limit,
          },
        },
      };
    } catch (error) {
      log.error('[imageEditContract.edit] Error:', error);
      return {
        status: 500 as const,
        body: { success: false as const, error: 'Bildbearbeitung fehlgeschlagen.' },
      };
    }
  },
});

export function mountImageEditContractRouter(app: Application): void {
  createExpressEndpoints(imageEditContract, imageEditContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'imageEditContract'),
  });
}
