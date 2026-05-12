/**
 * Image Edit Node
 *
 * Edits images using FLUX image-to-image based on user instructions.
 * Used by the @stadtbegruenen tool mention for green urban transformation.
 */

import { ImageGenerationCounter } from '../../../../services/counters/index.js';
import {
  FluxImageService,
  buildGreenEditPrompt,
  buildUniversalPrompt,
  type GenerateResult,
} from '../../../../services/flux/index.js';
import { visionService } from '../../../../services/vision/VisionService.js';
import { createLogger } from '../../../../utils/logger.js';
import { redisClient } from '../../../../utils/redis/index.js';

import type { ChatGraphState, GeneratedImageResult, ImageEditStyle, ImageStyle } from '../types.js';

const log = createLogger('ChatGraph:ImageEditNode');

const imageCounter = new ImageGenerationCounter(redisClient);

/**
 * Image edit node implementation.
 * Transforms an attached image using FLUX image-to-image with green urban editing.
 */
export async function imageEditNode(state: ChatGraphState): Promise<Partial<ChatGraphState>> {
  const startTime = Date.now();
  log.info('[ImageEditNode] Starting image editing');

  try {
    const { messages, agentConfig, imageAttachments } = state;

    const lastUserMessage = messages.filter((m) => m.role === 'user').pop();
    const userContent =
      typeof lastUserMessage?.content === 'string'
        ? lastUserMessage.content
        : JSON.stringify(lastUserMessage?.content || '');

    const userId = agentConfig.userId;

    if (!userId) {
      log.warn('[ImageEditNode] No user ID available for rate limiting');
      return {
        generatedImage: null,
        imagePrompt: null,
        imageStyle: null,
        imageTimeMs: Date.now() - startTime,
        error: 'User authentication required for image editing',
      };
    }

    const limitStatus = await imageCounter.checkLimit(userId);
    if (!limitStatus.canGenerate) {
      log.info(
        `[ImageEditNode] User ${userId} has reached daily image limit (${limitStatus.count}/${limitStatus.limit})`
      );
      return {
        generatedImage: null,
        imagePrompt: userContent,
        imageStyle: null,
        imageTimeMs: Date.now() - startTime,
        error: `Du hast dein tägliches Limit von ${limitStatus.limit} Bildern erreicht. Versuche es morgen wieder.`,
      };
    }

    if (!imageAttachments || imageAttachments.length === 0) {
      log.warn('[ImageEditNode] No image attachment provided');
      return {
        generatedImage: null,
        imagePrompt: userContent,
        imageStyle: null,
        imageTimeMs: Date.now() - startTime,
        error: 'Bitte hänge ein Bild an, das bearbeitet werden soll.',
      };
    }

    const attachment = imageAttachments[0];
    if (!attachment) {
      return {
        imageTimeMs: Date.now() - startTime,
        error: 'Bitte hänge ein Bild an, das bearbeitet werden soll.',
      };
    }
    const imageBuffer = Buffer.from(attachment.data, 'base64');
    const mimeType = attachment.type;

    // `imageEditStyle` is set by the controller from forcedTools (mention path)
    // or defaulted by the classifier route. `null` falls back to universal so a
    // raw `image_edit` intent without controller wiring still produces a sane
    // edit driven by the user's instruction.
    const editStyle: ImageEditStyle = state.imageEditStyle ?? 'universal';
    const prompt =
      editStyle === 'green-edit'
        ? buildGreenEditPrompt(userContent)
        : buildUniversalPrompt(userContent);
    const resultStyle: ImageStyle = editStyle;
    log.info(`[ImageEditNode] Built ${editStyle} prompt (${prompt.length} chars)`);

    const flux = await FluxImageService.create();
    const { stored }: GenerateResult = await flux.generateFromImage(prompt, imageBuffer, mimeType, {
      output_format: 'jpeg',
      safety_tolerance: 2,
    });

    await imageCounter.incrementCount(userId);
    const updatedStatus = await imageCounter.checkLimit(userId);

    const imageTimeMs = Date.now() - startTime;
    log.info(
      `[ImageEditNode] Image edited in ${imageTimeMs}ms, user usage: ${updatedStatus.count}/${updatedStatus.limit}`
    );

    const imageUrl = `/uploads/flux/results/${stored.relativePath.split('/').slice(-2).join('/')}`;

    const result: GeneratedImageResult = {
      base64: `data:image/jpeg;base64,${stored.base64}`,
      url: imageUrl,
      filename: stored.filename,
      prompt,
      style: resultStyle,
      generationTimeMs: imageTimeMs,
    };

    // Vision grounding: describe BOTH the original and the edited image so respondNode
    // can narrate the actual change instead of falling back to the model's training prior
    // ("I can't edit images"). Failure here MUST NOT break the edit — degrade gracefully.
    const groundingInstruction = 'Beschreibe in 1-2 kurzen Sätzen sachlich, was zu sehen ist.';
    const originalDataUri = `data:${mimeType};base64,${attachment.data}`;
    const editedDataUri = result.base64;
    const describe = (uri: string, label: string) =>
      visionService
        .analyzeImage(uri, groundingInstruction, { maxTokens: 200 })
        .catch((err: unknown) => {
          log.warn(
            `[ImageEditNode] vision describe(${label}) failed:`,
            err instanceof Error ? err.message : String(err)
          );
          return null;
        });

    const [originalDesc, editedDesc] = await Promise.all([
      describe(originalDataUri, 'original'),
      describe(editedDataUri, 'edited'),
    ]);
    const imageEditDescriptions =
      originalDesc || editedDesc ? { original: originalDesc, edited: editedDesc } : null;

    return {
      generatedImage: result,
      imagePrompt: prompt,
      imageStyle: resultStyle,
      imageTimeMs,
      imageEditDescriptions,
    };
  } catch (error: unknown) {
    const imageTimeMs = Date.now() - startTime;
    log.error(
      '[ImageEditNode] Error editing image:',
      error instanceof Error ? error.message : String(error)
    );

    let errorMessage = 'Bildbearbeitung fehlgeschlagen. Bitte versuche es erneut.';

    const errObj = error as Record<string, unknown>;
    if (errObj.type === 'billing') {
      errorMessage = 'Bildbearbeitungs-Credits aufgebraucht. Bitte kontaktiere den Administrator.';
    } else if (errObj.type === 'network') {
      errorMessage = 'Netzwerkfehler bei der Bildbearbeitung. Bitte versuche es erneut.';
    } else if (errObj.type === 'validation') {
      errorMessage = 'Ungültige Anfrage für Bildbearbeitung.';
    }

    return {
      generatedImage: null,
      imagePrompt: null,
      imageStyle: null,
      imageTimeMs,
      error: errorMessage,
    };
  }
}
