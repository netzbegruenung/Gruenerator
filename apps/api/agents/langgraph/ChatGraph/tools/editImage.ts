/**
 * Edit Image Tool
 *
 * Edits an attached image using FLUX image-to-image with green urban transformation.
 * Wraps FluxImageService with buildGreenEditPrompt and rate limiting.
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

import { ImageGenerationCounter } from '../../../../services/counters/index.js';
import { buildGreenEditPrompt } from '../../../../services/flux/greenEditPrompt.js';
import { FluxImageService, buildUniversalPrompt } from '../../../../services/flux/index.js';
import { MAX_REFERENCE_IMAGES, fitToBudget } from '../../../../services/flux/referenceImages.js';
import { createLogger } from '../../../../utils/logger.js';
import { redisClient } from '../../../../utils/redis/index.js';

import type { ToolDependencies } from './registry.js';
import type { GenerateResult, ReferenceImage } from '../../../../services/flux/FluxImageService.js';
import type { GeneratedImageResult } from '../types.js';

const log = createLogger('Tool:EditImage');

const imageCounter = new ImageGenerationCounter(redisClient);

export function createEditImageTool(deps: ToolDependencies): DynamicStructuredTool {
  // @ts-expect-error - Zod schema type compatibility with LangChain ToolInputSchemaBase
  return new DynamicStructuredTool({
    name: 'edit_image',
    description:
      'Bearbeite ein angehängtes Bild mit grüner Stadtbegrünung. ' +
      'Nutze dieses Tool wenn der Nutzer ein Foto hochgeladen hat und es mit Bäumen, Radwegen, Grünflächen etc. transformieren möchte.',
    schema: z
      .object({
        instruction: z
          .string()
          .describe('Beschreibung der gewünschten Bearbeitung (z.B. "mehr Bäume und Radwege")'),
      })
      .describe('Bildbearbeitung Tool'),
    func: async (input: { instruction: string }) => {
      const startTime = Date.now();
      const { instruction } = input;
      const userId = deps.agentConfig.userId;

      if (!userId) {
        return 'Fehler: Benutzerauthentifizierung für Bildbearbeitung erforderlich.';
      }

      const limitStatus = await imageCounter.checkLimit(userId);
      if (!limitStatus.canGenerate) {
        return `Du hast dein tägliches Limit von ${limitStatus.limit} Bildern erreicht. Versuche es morgen wieder.`;
      }

      const imageAttachment = deps.imageAttachments?.[0];
      if (!imageAttachment || !imageAttachment.data) {
        return 'Bitte hänge ein Bild an, das bearbeitet werden soll.';
      }

      log.info(`[EditImage] instruction="${instruction.slice(0, 60)}"`);

      try {
        // All attached images go to FLUX.2 in order; with more than one
        // reference the green-edit preset gives way to the universal prompt
        // (compositing needs the user's instruction verbatim).
        const references: ReferenceImage[] = (deps.imageAttachments ?? [])
          .slice(0, MAX_REFERENCE_IMAGES)
          .map((a) => ({
            buffer: Buffer.from(a.data, 'base64'),
            mimeType: a.type || 'image/jpeg',
          }));
        const processed = await fitToBudget(references);
        const prompt =
          references.length > 1
            ? buildUniversalPrompt(instruction, references.length)
            : buildGreenEditPrompt(instruction);

        const flux = await FluxImageService.create();
        const { stored }: GenerateResult = await flux.generateFromImages(prompt, processed, {
          output_format: 'jpeg',
          safety_tolerance: 2,
        });

        await imageCounter.incrementCount(userId);

        const imageUrl = `/uploads/flux/results/${stored.relativePath.split('/').slice(-2).join('/')}`;

        const imageResult: GeneratedImageResult = {
          base64: `data:image/jpeg;base64,${stored.base64}`,
          url: imageUrl,
          filename: stored.filename,
          prompt,
          style: references.length > 1 ? 'universal' : 'green-edit',
          generationTimeMs: Date.now() - startTime,
        };

        deps._generatedImage = imageResult;

        return `Bild erfolgreich bearbeitet!\nStil: Grüne Stadtbegrünung\nDatei: ${stored.filename}\nURL: ${imageUrl}`;
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        const typed = error as { type?: string };
        log.error('[EditImage] Error:', errMsg);
        if (typed.type === 'billing') {
          return 'Bildbearbeitungs-Credits aufgebraucht. Bitte kontaktiere den Administrator.';
        }
        if (typed.type === 'network') {
          return 'Netzwerkfehler bei der Bildbearbeitung. Bitte versuche es erneut.';
        }
        return `Bildbearbeitung fehlgeschlagen: ${errMsg}`;
      }
    },
  });
}
