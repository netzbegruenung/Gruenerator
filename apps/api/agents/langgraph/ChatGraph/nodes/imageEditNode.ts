/**
 * Image Edit Node
 *
 * Edits images using FLUX image-to-image based on user instructions.
 * Used by the @stadtbegruenen tool mention for green urban transformation.
 */

import type { ChatGraphState, GeneratedImageResult } from '../types.js';
import { FluxImageService } from '../../../../services/flux/index.js';
import { buildGreenEditPrompt } from '../../../../services/flux/greenEditPrompt.js';
import { ImageGenerationCounter } from '../../../../services/counters/index.js';
import { redisClient } from '../../../../utils/redis/index.js';
import { createLogger } from '../../../../utils/logger.js';

const log = createLogger('ChatGraph:ImageEditNode');

const imageCounter = new ImageGenerationCounter(redisClient as any);

/**
 * Image edit node implementation.
 * Transforms an attached image using FLUX image-to-image with green urban editing.
 */
export async function imageEditNode(
  state: ChatGraphState
): Promise<Partial<ChatGraphState>> {
  const startTime = Date.now();
  log.info('[ImageEditNode] Starting image editing');

  try {
    const { messages, agentConfig, imageAttachments } = state;

    const lastUserMessage = messages.filter((m) => m.role === 'user').pop();
    const userContent =
      typeof lastUserMessage?.content === 'string'
        ? lastUserMessage.content
        : JSON.stringify(lastUserMessage?.content || '');

    const userId = (agentConfig as any).userId;

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
      log.info(`[ImageEditNode] User ${userId} has reached daily image limit (${limitStatus.count}/${limitStatus.limit})`);
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
    const imageBuffer = Buffer.from(attachment.data, 'base64');
    const mimeType = attachment.type;

    const prompt = buildGreenEditPrompt(userContent);
    log.info(`[ImageEditNode] Built green-edit prompt (${prompt.length} chars)`);

    const flux = await FluxImageService.create();
    const { stored } = await flux.generateFromImage(
      prompt,
      imageBuffer,
      mimeType,
      { output_format: 'jpeg', safety_tolerance: 2 }
    ) as any;

    await imageCounter.incrementCount(userId);
    const updatedStatus = await imageCounter.checkLimit(userId);

    const imageTimeMs = Date.now() - startTime;
    log.info(`[ImageEditNode] Image edited in ${imageTimeMs}ms, user usage: ${updatedStatus.count}/${updatedStatus.limit}`);

    const imageUrl = `/uploads/flux/results/${stored.relativePath.split('/').slice(-2).join('/')}`;

    const result: GeneratedImageResult = {
      base64: `data:image/jpeg;base64,${stored.base64}`,
      url: imageUrl,
      filename: stored.filename,
      prompt,
      style: 'green-edit',
      generationTimeMs: imageTimeMs,
    };

    return {
      generatedImage: result,
      imagePrompt: prompt,
      imageStyle: 'green-edit',
      imageTimeMs,
    };
  } catch (error: any) {
    const imageTimeMs = Date.now() - startTime;
    log.error('[ImageEditNode] Error editing image:', error.message);

    let errorMessage = 'Bildbearbeitung fehlgeschlagen. Bitte versuche es erneut.';

    if (error.type === 'billing') {
      errorMessage = 'Bildbearbeitungs-Credits aufgebraucht. Bitte kontaktiere den Administrator.';
    } else if (error.type === 'network') {
      errorMessage = 'Netzwerkfehler bei der Bildbearbeitung. Bitte versuche es erneut.';
    } else if (error.type === 'validation') {
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
