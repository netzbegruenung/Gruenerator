/**
 * ts-rest contract router for POST /api/image-edit — FLUX image editing
 * with 1–10 reference images (multi-reference), plus the experimental FLUX 3
 * box edit and POST /api/image-edit/elements for the box editor.
 *
 * Replaces the legacy multipart POST /api/flux/green-edit/prompt for typed
 * web clients; the legacy route stays mounted for old consumers. requireAuth
 * runs at the mount prefix in routes.ts.
 */
import fs from 'fs';

import { imageEditContract } from '@gruenerator/contracts';
import { IMAGE_MODEL_BY_ID } from '@gruenerator/shared/models';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { serializeBoxEdit, validateBoxEdit } from '../../services/flux/flux3Boxes.js';
import { detectElements, planBoxEdit } from '../../services/flux/flux3BoxPlanner.js';
import { isFlux3Path } from '../../services/flux/FluxImageService.js';
import {
  FluxImageService,
  buildUniversalPrompt,
  type GenerateResult,
  type ReferenceImage,
} from '../../services/flux/index.js';
import { fitToBudget } from '../../services/flux/referenceImages.js';
import {
  getTreeBudget,
  toTreeBudgetStatusDto,
  treeBudgetSpentMessage,
  treeCostForImage,
  TreeBudgetUnavailableError,
} from '../../services/trees/index.js';
import { getImageModelForUser } from '../../services/user/imageModelPreference.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';
import { applyKiLabel } from '../sharepic/sharepic_canvas/imagine_label_canvas.js';

import { buildGreenEditPrompt, buildAllyMakerPrompt } from './imageEditing.js';

import type { ImageModelId } from '@gruenerator/shared/models';
import type { Application } from 'express';

const log = createLogger('imageEditContractRouter');

const s = initServer();

export const imageEditContractRouter = s.router(imageEditContract, {
  edit: async ({ req, body }) => {
    try {
      const userId = getAuthedUser(req).id;

      const modelId: ImageModelId = body.imageModel ?? (await getImageModelForUser(userId));
      const model = IMAGE_MODEL_BY_ID[modelId];
      const maxRefs = model.maxReferenceImages ?? 1;

      if (body.images.length > 1 && model.backend !== 'hosted') {
        return {
          status: 400 as const,
          body: {
            success: false as const,
            error: `Mehrere Referenzbilder werden nur mit Flux-Modellen unterstützt. Bitte wähle FLUX 3 oder Flux Klein als Bildmodell.`,
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

      let boxPrompt: string | null = null;
      if (body.boxes) {
        if (!model.modelPath || !isFlux3Path(model.modelPath)) {
          return {
            status: 400 as const,
            body: {
              success: false as const,
              error: `Bearbeiten mit Boxen gibt es nur mit FLUX 3, nicht mit ${model.name}.`,
            },
          };
        }
        if (body.boxes === 'auto') {
          const elements = await detectElements(processed[0]);
          const plan = elements && (await planBoxEdit(instruction, processed[0], elements));
          if (!plan) {
            return {
              status: 500 as const,
              body: {
                success: false as const,
                error: 'Die Boxen konnten nicht geplant werden. Bitte versuche es ohne Boxen.',
              },
            };
          }
          boxPrompt = serializeBoxEdit(plan);
        } else {
          const check = validateBoxEdit(body.boxes);
          if (!check.ok) {
            return {
              status: 400 as const,
              body: { success: false as const, error: `Ungültige Boxen: ${check.error}` },
            };
          }
          boxPrompt = serializeBoxEdit(check.value);
        }
      }

      const prompt =
        boxPrompt ??
        (body.images.length > 1
          ? buildUniversalPrompt(instruction, body.images.length)
          : editType === 'ally-maker'
            ? buildAllyMakerPrompt(instruction, isPrecision)
            : editType === 'green-edit'
              ? buildGreenEditPrompt(instruction, isPrecision)
              : buildUniversalPrompt(instruction));

      log.debug(
        `[imageEdit] ${processed.length} reference image(s), model ${model.id}, type ${editType}${boxPrompt ? ', boxes' : ''} (User: ${userId})`
      );

      // Booked as late as possible: `fitToBudget` above throws on a corrupt
      // buffer, which would otherwise 500 with the units already gone.
      const cost = treeCostForImage(model.costMultiplier);
      const budget = getTreeBudget();
      const reservation = await budget.reserve(userId, cost);
      if (!reservation.ok) {
        if (reservation.reason === 'unavailable') {
          return {
            status: 503 as const,
            body: { success: false as const, error: new TreeBudgetUnavailableError().message },
          };
        }
        return {
          status: 429 as const,
          body: {
            success: false as const,
            error: treeBudgetSpentMessage(reservation.status, cost),
            data: toTreeBudgetStatusDto(reservation.status),
          },
        };
      }

      let generated: GenerateResult;
      try {
        // Inside the try: a failing `create()` would otherwise keep the booking.
        const flux = await FluxImageService.create(
          model.backend,
          model.modelPath,
          model.resolution
        );
        generated = await flux.generateFromImages(prompt, processed, {
          output_format: 'jpeg',
          safety_tolerance: 2,
        });
      } catch (error) {
        await budget.release(userId, cost, reservation.status.day);
        throw error;
      }
      const { stored } = generated;

      const rawBuffer = Buffer.from(stored.base64, 'base64');
      const outputBuffer = await applyKiLabel(rawBuffer, body.kiLabel ?? 'full');
      fs.writeFileSync(stored.filePath, outputBuffer);

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
          usage: toTreeBudgetStatusDto(reservation.status),
        },
      };
    } catch (error) {
      log.error('[imageEditContract.edit] Error:', error);
      if ((error as { type?: string }).type === 'moderated') {
        return {
          status: 400 as const,
          body: { success: false as const, error: (error as Error).message },
        };
      }
      return {
        status: 500 as const,
        body: { success: false as const, error: 'Bildbearbeitung fehlgeschlagen.' },
      };
    }
  },

  elements: async ({ body }) => {
    try {
      const [image] = await fitToBudget([
        { buffer: Buffer.from(body.image.data, 'base64'), mimeType: body.image.type },
      ]);
      const elements = await detectElements(image);
      if (!elements) {
        return {
          status: 500 as const,
          body: { success: false as const, error: 'Im Bild wurden keine Elemente erkannt.' },
        };
      }
      return { status: 200 as const, body: { success: true as const, elements } };
    } catch (error) {
      log.error('[imageEditContract.elements] Error:', error);
      return {
        status: 500 as const,
        body: { success: false as const, error: 'Elemente konnten nicht erkannt werden.' },
      };
    }
  },
});

export function mountImageEditContractRouter(app: Application): void {
  createExpressEndpoints(imageEditContract, imageEditContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'imageEditContract'),
  });
}
