/**
 * Image Generation Node
 *
 * Generates images using FLUX based on user prompts detected by the classifier.
 * Handles style detection, rate limiting, and returns base64 + URL for display.
 */

import { ImageGenerationCounter } from '../../../../services/counters/index.js';
import {
  FluxImageService,
  buildFluxPrompt,
  type VariantKey,
} from '../../../../services/flux/index.js';
import { createLogger } from '../../../../utils/logger.js';
import { redisClient } from '../../../../utils/redis/index.js';

import type { ChatGraphState, ImageStyle, GeneratedImageResult } from '../types.js';

const log = createLogger('ChatGraph:ImageNode');

const imageCounter = new ImageGenerationCounter(redisClient as any);

/**
 * Detect image style from German prompt keywords.
 *
 * - realistic: "foto", "realistisch", "photograph"
 * - pixel: "pixel", "retro", "8-bit", "16-bit"
 * - illustration: default for everything else
 */
function detectStyleFromPrompt(userContent: string): ImageStyle {
  const q = userContent.toLowerCase();

  // Realistic style detection
  if (/\b(foto|photograph|realistisch|realist|echt|natur|dokumentar|real)\b/i.test(q)) {
    return 'realistic';
  }

  // Pixel art style detection
  if (/\b(pixel|retro|8-bit|16-bit|videospiel|game|gaming|spielgrafik)\b/i.test(q)) {
    return 'pixel';
  }

  // Default to illustration
  return 'illustration';
}

/**
 * Map ImageStyle to FLUX variant key.
 */
function styleToVariant(style: ImageStyle): VariantKey {
  switch (style) {
    case 'realistic':
      return 'realistic-pure';
    case 'pixel':
      return 'pixel-pure';
    case 'illustration':
    default:
      return 'illustration-pure';
  }
}

/**
 * Extract the image subject from the user prompt.
 * Removes common German prefixes like "erstelle ein bild von..."
 */
function extractSubjectFromPrompt(userContent: string): string {
  // Remove common German image request prefixes
  const prefixes = [
    /^(erstell|generier|erzeug|mach|zeichne|male|illustrier|visualisier)[e]?\s+(mir\s+)?(bitte\s+)?(ein|eine|einen)?\s*(bild|grafik|illustration|foto|image|poster|sharepic)\s*(von|mit|über|zu|für)?\s*/i,
    /^(bild|grafik|illustration|foto|image|poster|sharepic)\s*(von|mit|über|zu|für)?\s*/i,
    /^(kannst du|könntest du|würdest du|bitte)\s+(mir\s+)?(ein|eine|einen)?\s*(bild|grafik|illustration|foto)\s*(erstellen|generieren|machen|zeichnen)?\s*(von|mit|über|zu|für)?\s*/i,
  ];

  let subject = userContent.trim();

  for (const prefix of prefixes) {
    subject = subject.replace(prefix, '');
  }

  // Clean up any leading/trailing punctuation and whitespace
  subject = subject
    .replace(/^[:\-,.\s]+/, '')
    .replace(/[:\-,.\s]+$/, '')
    .trim();

  // If we stripped too much, use the original
  if (subject.length < 5) {
    subject = userContent.trim();
  }

  return subject;
}

/**
 * Image generation node implementation.
 * Generates an image based on the user's prompt using FLUX.
 */
export async function imageNode(state: ChatGraphState): Promise<Partial<ChatGraphState>> {
  const startTime = Date.now();
  log.info('[ImageNode] Starting image generation');

  try {
    const { messages, agentConfig } = state;

    // Extract user message content
    const lastUserMessage = messages.filter((m) => m.role === 'user').pop();
    const userContent =
      typeof lastUserMessage?.content === 'string'
        ? lastUserMessage.content
        : JSON.stringify(lastUserMessage?.content || '');

    // Get user ID from agent config for rate limiting
    // Note: userId is passed through agentConfig.userId or extracted from request context
    const userId = (agentConfig as any).userId;

    if (!userId) {
      log.warn('[ImageNode] No user ID available for rate limiting');
      return {
        generatedImage: null,
        imagePrompt: null,
        imageStyle: null,
        imageTimeMs: Date.now() - startTime,
        error: 'User authentication required for image generation',
      };
    }

    // Check rate limit
    const limitStatus = await imageCounter.checkLimit(userId);
    if (!limitStatus.canGenerate) {
      log.info(
        `[ImageNode] User ${userId} has reached daily image limit (${limitStatus.count}/${limitStatus.limit})`
      );
      return {
        generatedImage: null,
        imagePrompt: userContent,
        imageStyle: null,
        imageTimeMs: Date.now() - startTime,
        error: `Du hast dein tägliches Limit von ${limitStatus.limit} Bildern erreicht. Versuche es morgen wieder.`,
      };
    }

    // Detect style from prompt
    const style = detectStyleFromPrompt(userContent);
    const variant = styleToVariant(style);

    log.info(`[ImageNode] Detected style: ${style}, using variant: ${variant}`);

    // Extract subject from prompt
    const subject = extractSubjectFromPrompt(userContent);
    log.info(`[ImageNode] Extracted subject: "${subject.substring(0, 50)}..."`);

    // Build FLUX prompt
    const { prompt: fluxPrompt, dimensions } = buildFluxPrompt({
      variant,
      subject,
    });

    log.info(
      `[ImageNode] Built FLUX prompt (${fluxPrompt.length} chars), dimensions: ${dimensions.width}x${dimensions.height}`
    );

    // Generate image
    const flux = await FluxImageService.create();
    const { stored } = await flux.generateFromPrompt(fluxPrompt, {
      width: dimensions.width,
      height: dimensions.height,
      output_format: 'jpeg',
      safety_tolerance: 2,
    });

    // Increment rate limit counter
    await imageCounter.incrementCount(userId);
    const updatedStatus = await imageCounter.checkLimit(userId);

    const imageTimeMs = Date.now() - startTime;
    log.info(
      `[ImageNode] Image generated in ${imageTimeMs}ms, user usage: ${updatedStatus.count}/${updatedStatus.limit}`
    );

    // Construct URL for the image
    const imageUrl = `/uploads/flux/results/${stored.relativePath.split('/').slice(-2).join('/')}`;

    const result: GeneratedImageResult = {
      base64: `data:image/jpeg;base64,${stored.base64}`,
      url: imageUrl,
      filename: stored.filename,
      prompt: fluxPrompt,
      style,
      generationTimeMs: imageTimeMs,
    };

    return {
      generatedImage: result,
      imagePrompt: fluxPrompt,
      imageStyle: style,
      imageTimeMs,
    };
  } catch (error: any) {
    const imageTimeMs = Date.now() - startTime;
    log.error('[ImageNode] Error generating image:', error.message);

    // Handle specific error types
    let errorMessage = 'Bildgenerierung fehlgeschlagen. Bitte versuche es erneut.';

    if (error.type === 'billing') {
      errorMessage = 'Bildgenerierungs-Credits aufgebraucht. Bitte kontaktiere den Administrator.';
    } else if (error.type === 'network') {
      errorMessage = 'Netzwerkfehler bei der Bildgenerierung. Bitte versuche es erneut.';
    } else if (error.type === 'validation') {
      errorMessage = 'Ungültige Anfrage für Bildgenerierung.';
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
