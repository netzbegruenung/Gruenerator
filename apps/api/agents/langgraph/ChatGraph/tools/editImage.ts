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
import { FluxImageService } from '../../../../services/flux/index.js';
import { createLogger } from '../../../../utils/logger.js';
import { redisClient } from '../../../../utils/redis/index.js';

import type { ToolDependencies } from './registry.js';
import type { GeneratedImageResult } from '../types.js';

const log = createLogger('Tool:EditImage');

const imageCounter = new ImageGenerationCounter(redisClient as any);

export function createEditImageTool(deps: ToolDependencies): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'edit_image',
    description:
      'Bearbeite ein angehängtes Bild mit grüner Stadtbegrünung. ' +
      'Nutze dieses Tool wenn der Nutzer ein Foto hochgeladen hat und es mit Bäumen, Radwegen, Grünflächen etc. transformieren möchte.',
    schema: z.object({
      instruction: z
        .string()
        .describe('Beschreibung der gewünschten Bearbeitung (z.B. "mehr Bäume und Radwege")'),
    }),
    func: async ({ instruction }) => {
      const userId = (deps.agentConfig as any).userId;

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
        const prompt = buildGreenEditPrompt(instruction);
        const imageBuffer = Buffer.from(imageAttachment.data, 'base64');
        const mimeType = imageAttachment.type || 'image/jpeg';

        const flux = await FluxImageService.create();
        const { stored } = (await flux.generateFromImage(prompt, imageBuffer, mimeType, {
          output_format: 'jpeg',
          safety_tolerance: 2,
        })) as any;

        await imageCounter.incrementCount(userId);

        const imageUrl = `/uploads/flux/results/${stored.relativePath.split('/').slice(-2).join('/')}`;

        const imageResult: GeneratedImageResult = {
          base64: `data:image/jpeg;base64,${stored.base64}`,
          url: imageUrl,
          filename: stored.filename,
          prompt,
          style: 'green-edit',
          generationTimeMs: 0,
        };

        deps._generatedImage = imageResult;

        return `Bild erfolgreich bearbeitet!\nStil: Grüne Stadtbegrünung\nDatei: ${stored.filename}\nURL: ${imageUrl}`;
      } catch (error: any) {
        log.error('[EditImage] Error:', error.message);
        if (error.type === 'billing') {
          return 'Bildbearbeitungs-Credits aufgebraucht. Bitte kontaktiere den Administrator.';
        }
        if (error.type === 'network') {
          return 'Netzwerkfehler bei der Bildbearbeitung. Bitte versuche es erneut.';
        }
        return `Bildbearbeitung fehlgeschlagen: ${error.message}`;
      }
    },
  });
}
