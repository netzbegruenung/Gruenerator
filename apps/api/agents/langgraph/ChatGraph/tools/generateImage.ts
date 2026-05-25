/**
 * Generate Image Tool
 *
 * Generates images using FLUX (Black Forest Labs).
 * Wraps the FluxImageService with style detection and rate limiting.
 */

import { IMAGE_MODEL_BY_ID } from '@gruenerator/shared/models';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

import { ImageGenerationCounter } from '../../../../services/counters/index.js';
import {
  FluxImageService,
  buildFluxPrompt,
  type VariantKey,
} from '../../../../services/flux/index.js';
import { getImageModelForUser } from '../../../../services/user/imageModelPreference.js';
import { createLogger } from '../../../../utils/logger.js';
import { redisClient } from '../../../../utils/redis/index.js';

import type { ToolDependencies } from './registry.js';
import type { GeneratedImageResult, ImageStyle } from '../types.js';

const log = createLogger('Tool:GenerateImage');

const imageCounter = new ImageGenerationCounter(redisClient);

function detectStyle(description: string): ImageStyle {
  const q = description.toLowerCase();
  if (/\b(foto|photograph|realistisch|realist|echt|natur|dokumentar|real)\b/.test(q))
    return 'realistic';
  if (/\b(pixel|retro|8-bit|16-bit|videospiel|game|gaming)\b/.test(q)) return 'pixel';
  return 'illustration';
}

// `green-edit` and `universal` are image-edit styles, not generation variants —
// generate_image never receives them, but the type union still contains them so
// we exclude both here.
type GenerationStyle = Exclude<ImageStyle, 'green-edit' | 'universal'>;

function styleToVariant(style: ImageStyle): VariantKey {
  const map: Record<GenerationStyle, VariantKey> = {
    realistic: 'realistic-pure',
    pixel: 'pixel-pure',
    illustration: 'illustration-pure',
  };
  return map[style as GenerationStyle] || 'illustration-pure';
}

export function createGenerateImageTool(deps: ToolDependencies): DynamicStructuredTool {
  // @ts-expect-error - Zod schema type compatibility with LangChain ToolInputSchemaBase
  return new DynamicStructuredTool({
    name: 'generate_image',
    description:
      'Generiere ein Bild basierend auf einer Beschreibung. ' +
      'Nutze dieses Tool wenn der Nutzer ein Bild, eine Grafik, Illustration oder ein Foto erstellen möchte.',
    schema: z
      .object({
        description: z
          .string()
          .describe('Beschreibung des gewünschten Bildes (auf Deutsch oder Englisch)'),
        style: z
          .enum(['illustration', 'realistic', 'pixel'])
          .optional()
          .describe('Bildstil (Standard: wird aus Beschreibung erkannt)'),
      })
      .describe('Bildgenerierung Tool'),
    func: async (input: {
      description: string;
      style?: 'illustration' | 'realistic' | 'pixel';
    }) => {
      const startTime = Date.now();
      const { description, style: requestedStyle } = input;
      const userId = deps.agentConfig.userId;

      if (!userId) {
        return 'Fehler: Benutzerauthentifizierung für Bildgenerierung erforderlich.';
      }

      // Rate limit check
      const limitStatus = await imageCounter.checkLimit(userId);
      if (!limitStatus.canGenerate) {
        return `Du hast dein tägliches Limit von ${limitStatus.limit} Bildern erreicht. Versuche es morgen wieder.`;
      }

      const imageStyle: ImageStyle = (requestedStyle || detectStyle(description)) as ImageStyle;
      const variant = styleToVariant(imageStyle);

      log.info(
        `[GenerateImage] style=${imageStyle} variant=${variant} desc="${description.slice(0, 50)}"`
      );

      try {
        const { prompt, dimensions } = buildFluxPrompt({ variant, subject: description });
        const userModel = IMAGE_MODEL_BY_ID[await getImageModelForUser(userId)];
        const flux = await FluxImageService.create(userModel.backend, userModel.modelPath);
        const { stored } = await flux.generateFromPrompt(prompt, {
          width: dimensions.width,
          height: dimensions.height,
          output_format: 'jpeg',
          safety_tolerance: 2,
        });

        await imageCounter.incrementCount(userId, Math.round(userModel.costMultiplier * 100));

        const imageUrl = `/uploads/flux/results/${stored.relativePath.split('/').slice(-2).join('/')}`;

        // Store result in deps for controller extraction
        const imageResult: GeneratedImageResult = {
          base64: `data:image/jpeg;base64,${stored.base64}`,
          url: imageUrl,
          filename: stored.filename,
          prompt,
          style: imageStyle,
          generationTimeMs: Date.now() - startTime,
        };

        deps._generatedImage = imageResult;

        return `Bild erfolgreich generiert!\nStil: ${imageStyle}\nDatei: ${stored.filename}\nURL: ${imageUrl}`;
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        const typed = error as { type?: string };
        log.error('[GenerateImage] Error:', errMsg);
        if (typed.type === 'billing') {
          return 'Bildgenerierungs-Credits aufgebraucht. Bitte kontaktiere den Administrator.';
        }
        return `Bildgenerierung fehlgeschlagen: ${errMsg}`;
      }
    },
  });
}
