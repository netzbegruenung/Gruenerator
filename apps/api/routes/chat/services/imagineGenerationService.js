/**
 * Imagine Generation Service for Chat Integration
 * Handles FLUX AI image generation from chat messages
 * Supports three modes: pure, sharepic (with title), and edit (image-to-image)
 */

import path from 'path';
import fs from 'fs';
import { createLogger } from '../../../utils/logger.js';
const log = createLogger('imagineGenService');

// Dynamic imports for ESM modules
let FluxImageService = null;
import { buildFluxPrompt, VARIANTS } from '../../../services/flux/index.js';
import { composeImagineCreate, OUTPUT_WIDTH, OUTPUT_HEIGHT } from '../../../services/imagineCanvasService.js';
import { addKiLabel } from '../../sharepic/sharepic_canvas/imagine_label_canvas.js';
import ImageGenerationCounter from '../../../utils/imageGenerationCounter.js';
import redisClient from '../../../utils/redisClient.js';

const imageCounter = new ImageGenerationCounter(redisClient);

// Initialize FluxImageService lazily
async function getFluxImageService() {
  if (!FluxImageService) {
    const module = await import('../../../services/flux/index.js');
    FluxImageService = module.FluxImageService;
  }
  return new FluxImageService();
}

/**
 * Main entry point for imagine generation from chat
 * @param {Object} expressReq - Express request object
 * @param {string} mode - Generation mode: 'pure', 'sharepic', or 'edit'
 * @param {Object} requestBody - Request parameters
 * @returns {Object} Generation result
 */
async function generateImagineForChat(expressReq, mode, requestBody) {
  const userId = expressReq.user?.id;

  log.debug('[ImagineGeneration] Starting generation:', {
    mode,
    userId,
    hasSubject: !!requestBody.subject,
    hasVariant: !!requestBody.variant,
    hasTitle: !!requestBody.title
  });

  // Check rate limit
  const limitStatus = await imageCounter.checkLimit(userId);
  if (!limitStatus.canGenerate) {
    log.debug('[ImagineGeneration] Rate limit reached for user:', userId);
    return {
      success: false,
      error: 'Daily image generation limit reached',
      agent: 'imagine',
      content: {
        text: `Du hast dein tägliches Limit von ${limitStatus.limit} Bildern erreicht. Versuche es morgen wieder.`,
        type: 'rate_limit'
      },
      usage: limitStatus
    };
  }

  try {
    switch (mode) {
      case 'pure':
        return await generatePureImage(expressReq, requestBody);
      case 'sharepic':
        return await generateSharepicImage(expressReq, requestBody);
      case 'edit':
        return await generateEditImage(expressReq, requestBody);
      default:
        throw new Error(`Unknown imagine mode: ${mode}`);
    }
  } catch (error) {
    log.error('[ImagineGeneration] Generation error:', error);
    return {
      success: false,
      agent: 'imagine',
      content: {
        text: `Fehler bei der Bilderzeugung: ${error.message || 'Unbekannter Fehler'}`,
        type: 'error'
      },
      error: error.message
    };
  }
}

/**
 * Generate a pure image (text-to-image without title overlay)
 */
async function generatePureImage(expressReq, requestBody) {
  const { subject, variant = 'illustration-pure' } = requestBody;
  const userId = expressReq.user?.id;

  log.debug('[ImagineGeneration] Generating pure image:', { subject: subject?.substring(0, 50), variant });

  // Ensure we have a pure variant
  const pureVariant = ensurePureVariant(variant);

  // Build prompt using fluxPromptBuilder
  const { prompt, dimensions } = buildFluxPrompt({
    variant: pureVariant,
    subject: subject
  });

  log.debug('[ImagineGeneration] Built prompt:', { prompt: prompt.substring(0, 100), dimensions });

  // Generate image with FLUX
  const flux = await getFluxImageService();
  const { stored } = await flux.generateFromPrompt(prompt, {
    width: dimensions.width,
    height: dimensions.height,
    output_format: 'jpeg',
    safety_tolerance: 2
  });

  // Add KI label
  const imageBuffer = fs.readFileSync(stored.filePath);
  const labeledBuffer = await addKiLabel(imageBuffer);

  // Save labeled image
  const savedPath = await saveGeneratedImage(labeledBuffer, 'pure');

  // Increment counter
  const usageStatus = await imageCounter.incrementCount(userId);

  const base64 = `data:image/png;base64,${labeledBuffer.toString('base64')}`;
  const variantName = VARIANTS[pureVariant]?.name || pureVariant;

  log.debug('[ImagineGeneration] Pure image generated successfully');

  return {
    success: true,
    agent: 'imagine_pure',
    content: {
      text: `Hier ist dein generiertes Bild im Stil "${variantName}".`,
      type: 'imagine',
      sharepic: {
        image: base64,
        type: 'imagine_pure'
      },
      metadata: {
        mode: 'pure',
        variant: pureVariant,
        prompt: prompt,
        dimensions: dimensions
      }
    },
    usage: {
      count: usageStatus.count,
      remaining: usageStatus.remaining,
      limit: usageStatus.limit
    }
  };
}

/**
 * Generate a sharepic image (text-to-image with title overlay)
 */
async function generateSharepicImage(expressReq, requestBody) {
  const { subject, title, variant = 'light-top' } = requestBody;
  const userId = expressReq.user?.id;

  log.debug('[ImagineGeneration] Generating sharepic image:', {
    subject: subject?.substring(0, 50),
    title: title?.substring(0, 30),
    variant
  });

  // Ensure variant supports title overlay (non-pure)
  const sharepicVariant = ensureSharepicVariant(variant);

  // Build prompt
  const { prompt, dimensions } = buildFluxPrompt({
    variant: sharepicVariant,
    subject: subject
  });

  // Generate base image with dimensions suitable for sharepic composition
  const flux = await getFluxImageService();
  const { stored } = await flux.generateFromPrompt(prompt, {
    width: 768,  // FLUX_WIDTH for sharepic
    height: 960, // FLUX_HEIGHT for sharepic
    output_format: 'jpeg',
    safety_tolerance: 2
  });

  const fluxImageBuffer = fs.readFileSync(stored.filePath);

  // Compose with title overlay using imagineCanvasService
  const composedBuffer = await composeImagineCreate(fluxImageBuffer, {
    title: title,
    variant: sharepicVariant
  });

  // Add KI label
  const labeledBuffer = await addKiLabel(composedBuffer);

  // Save labeled image
  const savedPath = await saveGeneratedImage(labeledBuffer, 'sharepic');

  // Increment counter
  const usageStatus = await imageCounter.incrementCount(userId);

  const base64 = `data:image/png;base64,${labeledBuffer.toString('base64')}`;

  log.debug('[ImagineGeneration] Sharepic image generated successfully');

  return {
    success: true,
    agent: 'imagine_sharepic',
    content: {
      text: `Hier ist dein KI-Sharepic mit dem Titel "${title}".`,
      type: 'imagine',
      sharepic: {
        image: base64,
        type: 'imagine_sharepic',
        title: title
      },
      metadata: {
        mode: 'sharepic',
        variant: sharepicVariant,
        title: title,
        dimensions: { width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT }
      }
    },
    usage: {
      count: usageStatus.count,
      remaining: usageStatus.remaining,
      limit: usageStatus.limit
    }
  };
}

/**
 * Generate an edited image (image-to-image transformation)
 */
async function generateEditImage(expressReq, requestBody) {
  const { action, variant = 'realistic-pure' } = requestBody;
  const userId = expressReq.user?.id;

  log.debug('[ImagineGeneration] Generating edit image:', {
    action: action?.substring(0, 50),
    variant
  });

  // Get uploaded image from SharepicImageManager
  const sharepicImageManager = expressReq.app?.locals?.sharepicImageManager;
  const requestId = requestBody.sharepicRequestId;

  let imageAttachment = null;
  if (sharepicImageManager && requestId) {
    imageAttachment = await sharepicImageManager.retrieveAndConsume(requestId);
  }

  // Fallback to attachments array
  if (!imageAttachment && requestBody.attachments) {
    imageAttachment = requestBody.attachments.find(a => a.type?.startsWith('image/'));
  }

  if (!imageAttachment) {
    return {
      success: false,
      agent: 'imagine_edit',
      content: {
        text: 'Für die Bildbearbeitung benötige ich ein Bild. Bitte lade ein Bild hoch und beschreibe, wie es transformiert werden soll.',
        type: 'error'
      }
    };
  }

  // Build edit prompt
  const editPrompt = buildEditPrompt(action, variant);

  // Convert attachment to buffer
  const imageBuffer = extractBufferFromAttachment(imageAttachment);

  log.debug('[ImagineGeneration] Processing image-to-image:', {
    promptLength: editPrompt.length,
    imageSize: imageBuffer.length
  });

  // Generate edited image using image-to-image
  const flux = await getFluxImageService();
  const { stored } = await flux.generateFromImage(
    editPrompt,
    imageBuffer,
    imageAttachment.type || 'image/jpeg',
    { output_format: 'jpeg', safety_tolerance: 2 }
  );

  // Add KI label
  const resultBuffer = fs.readFileSync(stored.filePath);
  const labeledBuffer = await addKiLabel(resultBuffer);

  // Save labeled image
  await saveGeneratedImage(labeledBuffer, 'edit');

  // Increment counter
  const usageStatus = await imageCounter.incrementCount(userId);

  const base64 = `data:image/png;base64,${labeledBuffer.toString('base64')}`;

  log.debug('[ImagineGeneration] Edit image generated successfully');

  return {
    success: true,
    agent: 'imagine_edit',
    content: {
      text: 'Hier ist dein transformiertes Bild.',
      type: 'imagine',
      sharepic: {
        image: base64,
        type: 'imagine_edit'
      },
      metadata: {
        mode: 'edit',
        action: action
      }
    },
    usage: {
      count: usageStatus.count,
      remaining: usageStatus.remaining,
      limit: usageStatus.limit
    }
  };
}

/**
 * Ensure variant is a pure variant (full image without reserved space)
 */
function ensurePureVariant(variant) {
  const pureVariants = ['illustration-pure', 'realistic-pure', 'pixel-pure', 'editorial-pure'];
  if (pureVariants.includes(variant)) return variant;

  // Map non-pure to pure
  const mapping = {
    'light-top': 'illustration-pure',
    'green-bottom': 'illustration-pure',
    'realistic-top': 'realistic-pure',
    'realistic-bottom': 'realistic-pure',
    'pixel-top': 'pixel-pure',
    'pixel-bottom': 'pixel-pure',
    'editorial': 'editorial-pure',
    'illustration': 'illustration-pure',
    'realistisch': 'realistic-pure',
    'pixel': 'pixel-pure'
  };

  return mapping[variant] || 'illustration-pure';
}

/**
 * Ensure variant supports title overlay (non-pure)
 */
function ensureSharepicVariant(variant) {
  const sharepicVariants = ['light-top', 'realistic-top', 'pixel-top', 'editorial'];
  if (sharepicVariants.includes(variant)) return variant;

  // Map to sharepic variant
  const mapping = {
    'illustration-pure': 'light-top',
    'realistic-pure': 'realistic-top',
    'pixel-pure': 'pixel-top',
    'editorial-pure': 'editorial',
    'illustration': 'light-top',
    'realistisch': 'realistic-top',
    'pixel': 'pixel-top'
  };

  return mapping[variant] || 'light-top';
}

/**
 * Build prompt for image-to-image transformation
 */
function buildEditPrompt(action, variant) {
  // Check for specific transformation types
  const lowerAction = action.toLowerCase();

  // Green infrastructure transformation
  if (lowerAction.includes('begrün') || lowerAction.includes('grün')) {
    return `Transform this urban scene to include green infrastructure: add trees, bushes, protected bike lanes, outdoor seating with shade, flower beds. Keep the existing buildings and basic layout, but make the environment greener and more sustainable. Natural lighting, photorealistic style.`;
  }

  // General transformation - use the action directly
  return `${action}. Maintain the overall composition and structure of the original image. Photorealistic result, natural lighting.`;
}

/**
 * Extract buffer from attachment data
 */
function extractBufferFromAttachment(attachment) {
  if (attachment.data) {
    // Base64 data URL
    const base64Data = attachment.data.replace(/^data:image\/[^;]+;base64,/, '');
    return Buffer.from(base64Data, 'base64');
  }

  if (attachment.buffer) {
    return attachment.buffer;
  }

  throw new Error('Unable to extract image buffer from attachment');
}

/**
 * Save generated image to uploads directory
 */
async function saveGeneratedImage(buffer, mode) {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const baseDir = path.join(process.cwd(), 'uploads', 'imagine', 'chat', mode, today);

  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
  }

  const filename = `${mode}_${now.toISOString().replace(/[:.]/g, '-')}.png`;
  const filePath = path.join(baseDir, filename);
  fs.writeFileSync(filePath, buffer);

  log.debug('[ImagineGeneration] Saved image:', filePath);
  return filePath;
}

export { generateImagineForChat };