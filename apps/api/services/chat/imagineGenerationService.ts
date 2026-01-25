/**
 * Imagine Generation Service for Chat Integration
 * Handles FLUX AI image generation from chat messages
 * Supports three modes: pure, sharepic (with title), and edit (image-to-image)
 */

import path from 'path';
import fs from 'fs';
import { createLogger } from '../../utils/logger.js';
import { buildFluxPrompt, VARIANTS, type VariantKey } from '../../services/flux/index.js';
import {
  composeImagineCreate,
  OUTPUT_WIDTH,
  OUTPUT_HEIGHT,
} from '../../services/image/ImagineCanvasRenderer.js';
import { addKiLabel } from '../../routes/sharepic/sharepic_canvas/imagine_label_canvas.js';
import { ImageGenerationCounter } from '../../services/counters/index.js';
import { redisClient } from '../../utils/redis/index.js';
import type { Request } from 'express';
import type { UserProfile } from '../../services/user/types.js';
import type { ImagineVariant } from '../../services/image/types.js';

const log = createLogger('imagineGenService');

interface ExpressRequest extends Request {
  user?: UserProfile;
  app: Request['app'] & {
    locals?: {
      sharepicImageManager?: SharepicImageManager;
    };
  };
}

interface SharepicImageManager {
  retrieveAndConsume(requestId: string): Promise<ImageAttachment | null>;
}

interface ImageAttachment {
  type?: string;
  data?: string;
  buffer?: Buffer;
}

interface RequestBody {
  subject?: string;
  variant?: string;
  title?: string;
  action?: string;
  sharepicRequestId?: string;
  attachments?: ImageAttachment[];
}

interface UsageStatus {
  count: number;
  remaining: number;
  limit: number;
  canGenerate?: boolean;
}

interface GenerationResult {
  success: boolean;
  agent: string;
  content: {
    text: string;
    type: string;
    sharepic?: {
      image: string;
      type: string;
      title?: string;
    };
    metadata?: Record<string, unknown>;
  };
  error?: string;
  usage?: UsageStatus;
}

interface FluxImageServiceType {
  generateFromPrompt(
    prompt: string,
    options: Record<string, unknown>
  ): Promise<{ stored: { filePath: string } }>;
  generateFromImage(
    prompt: string,
    imageBuffer: Buffer,
    mimeType: string,
    options: Record<string, unknown>
  ): Promise<{ stored: { filePath: string } }>;
}

const imageCounter = new ImageGenerationCounter(redisClient);

let FluxImageService: (new () => FluxImageServiceType) | null = null;

async function getFluxImageService(): Promise<FluxImageServiceType> {
  if (!FluxImageService) {
    const module = await import('../../services/flux/index.js');
    FluxImageService = module.FluxImageService;
  }
  return new FluxImageService!();
}

async function generateImagineForChat(
  expressReq: ExpressRequest,
  mode: 'pure' | 'sharepic' | 'edit',
  requestBody: RequestBody
): Promise<GenerationResult> {
  const userId = expressReq.user?.id;

  log.debug('[ImagineGeneration] Starting generation:', {
    mode,
    userId,
    hasSubject: !!requestBody.subject,
    hasVariant: !!requestBody.variant,
    hasTitle: !!requestBody.title,
  });

  const limitStatus = await imageCounter.checkLimit(userId ?? '');
  if (!limitStatus.canGenerate) {
    log.debug('[ImagineGeneration] Rate limit reached for user:', userId);
    return {
      success: false,
      error: 'Daily image generation limit reached',
      agent: 'imagine',
      content: {
        text: `Du hast dein tägliches Limit von ${limitStatus.limit} Bildern erreicht. Versuche es morgen wieder.`,
        type: 'rate_limit',
      },
      usage: limitStatus,
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
    const err = error as Error;
    log.error('[ImagineGeneration] Generation error:', err);
    return {
      success: false,
      agent: 'imagine',
      content: {
        text: `Fehler bei der Bilderzeugung: ${err.message || 'Unbekannter Fehler'}`,
        type: 'error',
      },
      error: err.message,
    };
  }
}

async function generatePureImage(
  expressReq: ExpressRequest,
  requestBody: RequestBody
): Promise<GenerationResult> {
  const { subject, variant = 'illustration-pure' } = requestBody;
  const userId = expressReq.user?.id;

  log.debug('[ImagineGeneration] Generating pure image:', {
    subject: subject?.substring(0, 50),
    variant,
  });

  const pureVariant = ensurePureVariant(variant);

  const { prompt, dimensions } = buildFluxPrompt({
    variant: pureVariant,
    subject: subject ?? '',
  });

  log.debug('[ImagineGeneration] Built prompt:', { prompt: prompt.substring(0, 100), dimensions });

  const flux = await getFluxImageService();
  const { stored } = await flux.generateFromPrompt(prompt, {
    width: dimensions.width,
    height: dimensions.height,
    output_format: 'jpeg',
    safety_tolerance: 2,
  });

  const imageBuffer = fs.readFileSync(stored.filePath);
  const labeledBuffer = await addKiLabel(imageBuffer);

  await saveGeneratedImage(labeledBuffer, 'pure');

  const usageStatus = await imageCounter.incrementCount(userId ?? '');

  const base64 = `data:image/png;base64,${labeledBuffer.toString('base64')}`;
  const variantConfig = VARIANTS[pureVariant as keyof typeof VARIANTS];
  const variantName = variantConfig?.name || pureVariant;

  log.debug('[ImagineGeneration] Pure image generated successfully');

  return {
    success: true,
    agent: 'imagine_pure',
    content: {
      text: `Hier ist dein generiertes Bild im Stil "${variantName}".`,
      type: 'imagine',
      sharepic: {
        image: base64,
        type: 'imagine_pure',
      },
      metadata: {
        mode: 'pure',
        variant: pureVariant,
        prompt: prompt,
        dimensions: dimensions,
      },
    },
    usage: {
      count: usageStatus.count,
      remaining: usageStatus.remaining,
      limit: usageStatus.limit,
    },
  };
}

async function generateSharepicImage(
  expressReq: ExpressRequest,
  requestBody: RequestBody
): Promise<GenerationResult> {
  const { subject, title, variant = 'light-top' } = requestBody;
  const userId = expressReq.user?.id;

  log.debug('[ImagineGeneration] Generating sharepic image:', {
    subject: subject?.substring(0, 50),
    title: title?.substring(0, 30),
    variant,
  });

  const sharepicVariant = ensureSharepicVariant(variant);

  const { prompt } = buildFluxPrompt({
    variant: sharepicVariant,
    subject: subject ?? '',
  });

  const flux = await getFluxImageService();
  const { stored } = await flux.generateFromPrompt(prompt, {
    width: 768,
    height: 960,
    output_format: 'jpeg',
    safety_tolerance: 2,
  });

  const fluxImageBuffer = fs.readFileSync(stored.filePath);

  const composedBuffer = await composeImagineCreate(fluxImageBuffer, {
    title: title ?? '',
    variant: sharepicVariant,
  });

  const labeledBuffer = await addKiLabel(composedBuffer);

  await saveGeneratedImage(labeledBuffer, 'sharepic');

  const usageStatus = await imageCounter.incrementCount(userId ?? '');

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
        title: title,
      },
      metadata: {
        mode: 'sharepic',
        variant: sharepicVariant,
        title: title,
        dimensions: { width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT },
      },
    },
    usage: {
      count: usageStatus.count,
      remaining: usageStatus.remaining,
      limit: usageStatus.limit,
    },
  };
}

async function generateEditImage(
  expressReq: ExpressRequest,
  requestBody: RequestBody
): Promise<GenerationResult> {
  const { action, variant = 'realistic-pure' } = requestBody;
  const userId = expressReq.user?.id;

  log.debug('[ImagineGeneration] Generating edit image:', {
    action: action?.substring(0, 50),
    variant,
  });

  const sharepicImageManager = expressReq.app?.locals?.sharepicImageManager;
  const requestId = requestBody.sharepicRequestId;

  let imageAttachment: ImageAttachment | null = null;
  if (sharepicImageManager && requestId) {
    imageAttachment = await sharepicImageManager.retrieveAndConsume(requestId);
  }

  if (!imageAttachment && requestBody.attachments) {
    imageAttachment = requestBody.attachments.find((a) => a.type?.startsWith('image/')) || null;
  }

  if (!imageAttachment) {
    return {
      success: false,
      agent: 'imagine_edit',
      content: {
        text: 'Für die Bildbearbeitung benötige ich ein Bild. Bitte lade ein Bild hoch und beschreibe, wie es transformiert werden soll.',
        type: 'error',
      },
    };
  }

  const editPrompt = buildEditPrompt(action || '', variant);

  const imageBuffer = extractBufferFromAttachment(imageAttachment);

  log.debug('[ImagineGeneration] Processing image-to-image:', {
    promptLength: editPrompt.length,
    imageSize: imageBuffer.length,
  });

  const flux = await getFluxImageService();
  const { stored } = await flux.generateFromImage(
    editPrompt,
    imageBuffer,
    imageAttachment.type || 'image/jpeg',
    { output_format: 'jpeg', safety_tolerance: 2 }
  );

  const resultBuffer = fs.readFileSync(stored.filePath);
  const labeledBuffer = await addKiLabel(resultBuffer);

  await saveGeneratedImage(labeledBuffer, 'edit');

  const usageStatus = await imageCounter.incrementCount(userId ?? '');

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
        type: 'imagine_edit',
      },
      metadata: {
        mode: 'edit',
        action: action,
      },
    },
    usage: {
      count: usageStatus.count,
      remaining: usageStatus.remaining,
      limit: usageStatus.limit,
    },
  };
}

function ensurePureVariant(variant: string): VariantKey {
  const pureVariants: VariantKey[] = [
    'illustration-pure',
    'realistic-pure',
    'pixel-pure',
    'editorial-pure',
  ];
  if (pureVariants.includes(variant as VariantKey)) return variant as VariantKey;

  const mapping: Record<string, VariantKey> = {
    'light-top': 'illustration-pure',
    'green-bottom': 'illustration-pure',
    'realistic-top': 'realistic-pure',
    'realistic-bottom': 'realistic-pure',
    'pixel-top': 'pixel-pure',
    'pixel-bottom': 'pixel-pure',
    editorial: 'editorial-pure',
    illustration: 'illustration-pure',
    realistisch: 'realistic-pure',
    pixel: 'pixel-pure',
  };

  return mapping[variant] || 'illustration-pure';
}

function ensureSharepicVariant(variant: string): ImagineVariant {
  const sharepicVariants: ImagineVariant[] = [
    'light-top',
    'realistic-top',
    'pixel-top',
    'editorial',
  ];
  if (sharepicVariants.includes(variant as ImagineVariant)) return variant as ImagineVariant;

  const mapping: Record<string, ImagineVariant> = {
    'illustration-pure': 'light-top',
    'realistic-pure': 'realistic-top',
    'pixel-pure': 'pixel-top',
    'editorial-pure': 'editorial',
    illustration: 'light-top',
    realistisch: 'realistic-top',
    pixel: 'pixel-top',
  };

  return mapping[variant] || 'light-top';
}

function buildEditPrompt(action: string, variant: string): string {
  const lowerAction = action.toLowerCase();

  if (lowerAction.includes('begrün') || lowerAction.includes('grün')) {
    return `Transform this urban scene to include green infrastructure: add trees, bushes, protected bike lanes, outdoor seating with shade, flower beds. Keep the existing buildings and basic layout, but make the environment greener and more sustainable. Natural lighting, photorealistic style.`;
  }

  return `${action}. Maintain the overall composition and structure of the original image. Photorealistic result, natural lighting.`;
}

function extractBufferFromAttachment(attachment: ImageAttachment): Buffer {
  if (attachment.data) {
    const base64Data = attachment.data.replace(/^data:image\/[^;]+;base64,/, '');
    return Buffer.from(base64Data, 'base64');
  }

  if (attachment.buffer) {
    return attachment.buffer;
  }

  throw new Error('Unable to extract image buffer from attachment');
}

async function saveGeneratedImage(buffer: Buffer, mode: string): Promise<string> {
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
export type { GenerationResult, RequestBody, UsageStatus };
