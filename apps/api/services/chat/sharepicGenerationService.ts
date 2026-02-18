import fsSync from 'fs';
import fs from 'fs/promises';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

import campaignCanvasRouter from '../../routes/sharepic/sharepic_canvas/campaign_canvas.js';
import dreizeilenCanvasRouter from '../../routes/sharepic/sharepic_canvas/dreizeilen_canvas.js';
import infoCanvasRouter from '../../routes/sharepic/sharepic_canvas/info_canvas.js';
import zitatCanvasRouter from '../../routes/sharepic/sharepic_canvas/zitat_canvas.js';
import zitatPureCanvasRouter from '../../routes/sharepic/sharepic_canvas/zitat_pure_canvas.js';
import sharepicClaudeRouter, {
  handleClaudeRequest as sharepicClaudeHandler,
} from '../../routes/sharepic/sharepic_claude/index.js';
import {
  getFirstImageAttachment,
  convertToBuffer,
  convertToTempFile,
  validateImageAttachment,
} from '../../services/attachments/index.js';
import imagePickerService from '../../services/image/ImageSelectionService.js';
import { parseResponse, type ParserConfig } from '../../utils/campaign/index.js';
import { createLogger } from '../../utils/logger.js';

import type {
  ImageAttachment as AttachmentsImageAttachment,
  Attachment,
} from '../../services/attachments/types.js';
import type { UserProfile } from '../../services/user/types.js';
import type { Request, Response, Router } from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const log = createLogger('sharepicGenerat');

const SHAREPIC_TYPES = new Set(['info', 'zitat_pure', 'zitat', 'dreizeilen']);
const IMAGE_REQUIRED_TYPES = new Set(['zitat', 'dreizeilen']);

interface SharepicImageManager {
  retrieveAndConsume(requestId: string): Promise<AttachmentsImageAttachment | null>;
  hasImageForRequest(requestId: string): Promise<boolean>;
  deleteImageForRequest(requestId: string): Promise<void>;
}

interface AIWorkerPool {
  processRequest(request: AIRequest, req?: ExpressRequest): Promise<AIResponse>;
}

interface ExpressRequest extends Request {
  user?: UserProfile;
  correlationId?: string;
  app: Request['app'] & {
    locals?: {
      sharepicImageManager?: SharepicImageManager;
      aiWorkerPool?: AIWorkerPool;
    };
  };
}

// Using AttachmentsImageAttachment from services/attachments/types.ts
// Local alias for convenience
type ImageAttachment = AttachmentsImageAttachment;

interface AIRequest {
  type: string;
  systemPrompt: string;
  messages: Array<{ role: string; content: string }>;
  options?: Record<string, unknown>;
}

interface AIResponse {
  content?: string;
}

interface CampaignConfig {
  name?: string;
  basedOn?: string;
  prompt?: {
    systemRole?: string;
    requestTemplate?: string;
    singleItemTemplate?: string;
    options?: Record<string, unknown>;
  };
  responseParser?: ParserConfig;
}

interface TextData {
  line1?: string;
  line2?: string;
  line3?: string;
  quote?: string;
  name?: string;
  header?: string;
  subheader?: string;
  body?: string;
}

interface MainSlogan {
  line1?: string;
  line2?: string;
  line3?: string;
}

interface SharepicResult {
  success: boolean;
  agent: string;
  content: {
    metadata?: Record<string, unknown>;
    sharepic: {
      image: string;
      type: string;
      text?: string;
      header?: string;
      subheader?: string;
      body?: string;
      quote?: string;
      name?: string;
      mainSlogan?: MainSlogan;
      alternatives?: unknown[];
      textData?: TextData;
      selectedImage?: string;
    };
    sharepicTitle: string;
    sharepicDownloadText: string;
    sharepicDownloadFilename: string;
  };
}

interface MockResponse {
  statusCode: number;
  status(code: number): MockResponse;
  json(payload: unknown): void;
  send(payload: unknown): void;
  set(): MockResponse;
}

interface CanvasResult {
  statusCode: number;
  payload: {
    image?: string;
  };
}

interface TempFile {
  path: string;
  cleanup?: () => Promise<void>;
}

interface ImageSelection {
  selectedImage: {
    filename: string;
  };
  confidence: number;
  reasoning: string;
}

interface RequestBody {
  text?: string;
  subject?: string;
  preserveName?: boolean;
  name?: string;
  attachments?: Attachment[];
  sharepicRequestId?: string;
  campaignId?: string;
  campaignTypeId?: string;
  [key: string]: unknown;
}

const loadCampaignConfig = (campaignId: string, typeId: string): CampaignConfig | null => {
  if (!campaignId || !typeId) return null;

  const campaignPath = path.join(__dirname, '../../config/campaigns', `${campaignId}.json`);

  if (!fsSync.existsSync(campaignPath)) {
    log.warn(`[Campaign] Config not found: ${campaignPath}`);
    return null;
  }

  try {
    const campaign = JSON.parse(fsSync.readFileSync(campaignPath, 'utf8'));
    const typeConfig = campaign.types?.[typeId];

    if (!typeConfig) {
      log.warn(`[Campaign] Type ${typeId} not found in campaign ${campaignId}`);
      return null;
    }

    log.debug(`[Campaign] Loaded config for ${campaignId}/${typeId}`);
    return typeConfig;
  } catch (error) {
    log.error(`[Campaign] Failed to load config:`, error);
    return null;
  }
};

const createImageAttachmentFromFile = async (filename: string): Promise<ImageAttachment> => {
  const imagePath = imagePickerService.getImagePath(filename);

  try {
    const imageBuffer = await fs.readFile(imagePath);
    const base64Data = imageBuffer.toString('base64');
    const mimeType = filename.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
    const dataUrl = `data:${mimeType};base64,${base64Data}`;

    return {
      type: mimeType,
      data: dataUrl,
      name: filename,
      size: imageBuffer.length,
      source: 'ai-selected',
    };
  } catch (error) {
    log.error(`[SharepicGeneration] Failed to load image ${filename}:`, error);
    throw new Error(`Failed to load selected image: ${filename}`);
  }
};

const selectAndPrepareImage = async (
  textContent: string,
  sharepicType: string,
  aiWorkerPool: AIWorkerPool,
  req: ExpressRequest | null = null
): Promise<{ attachment: ImageAttachment; selection: ImageSelection }> => {
  log.debug(`[SharepicGeneration] Selecting image for ${sharepicType} sharepic`);

  try {
    const selection = await imagePickerService.selectBestImage(
      textContent,
      aiWorkerPool,
      { sharepicType },
      req
    );

    log.debug(
      `[SharepicGeneration] Selected image: ${selection.selectedImage.filename} (confidence: ${selection.confidence})`
    );
    log.debug(`[SharepicGeneration] Selection reasoning: ${selection.reasoning}`);

    const imageAttachment = await createImageAttachmentFromFile(selection.selectedImage.filename);

    return {
      attachment: imageAttachment,
      selection: selection,
    };
  } catch (error) {
    log.error('[SharepicGeneration] Failed to select image:', error);

    try {
      log.debug('[SharepicGeneration] Using fallback image');
      const fallbackImage = await createImageAttachmentFromFile(
        'mike-marrah-XNCv-DcTLx4-unsplash.jpg'
      );
      return {
        attachment: fallbackImage,
        selection: {
          selectedImage: { filename: 'mike-marrah-XNCv-DcTLx4-unsplash.jpg' },
          confidence: 0.1,
          reasoning: 'Fallback after selection failed',
        },
      };
    } catch (fallbackError) {
      log.error('[SharepicGeneration] Even fallback image failed:', fallbackError);
      throw new Error('Failed to select any image for sharepic generation');
    }
  }
};

const getRouteHandler = (router: Router): ((...args: unknown[]) => unknown) => {
  const stack = (
    router as unknown as {
      stack?: Array<{
        route?: {
          path: string;
          methods?: { post?: boolean };
          stack: Array<{ handle: (...args: unknown[]) => unknown }>;
        };
      }>;
    }
  ).stack;
  const layer = stack?.find(
    (entry) => entry.route && entry.route.path === '/' && entry.route.methods?.post
  );
  if (!layer) {
    throw new Error('Canvas route handler not found');
  }

  const routeStack = layer.route!.stack;
  const handlerLayer = routeStack[routeStack.length - 1];
  return handlerLayer.handle;
};

const createMockResponse = (
  resolve: (value: CanvasResult) => void,
  reject: (reason?: unknown) => void
): MockResponse => {
  const res: MockResponse = {
    statusCode: 200,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      resolve({ statusCode: this.statusCode || 200, payload: payload as { image?: string } });
    },
    send(payload: unknown) {
      resolve({ statusCode: this.statusCode || 200, payload: payload as { image?: string } });
    },
    set() {
      return this;
    },
  };
  return res;
};

const callSharepicClaude = async (
  expressReq: ExpressRequest,
  type: string,
  body: RequestBody
): Promise<Record<string, unknown>> => {
  if (typeof sharepicClaudeHandler !== 'function') {
    throw new Error('Sharepic Claude handler unavailable');
  }

  const mockReq = {
    app: expressReq.app,
    headers: expressReq.headers,
    user: expressReq.user,
    correlationId: expressReq.correlationId,
    body: {
      ...body,
      count: 1,
    },
  };

  return new Promise<CanvasResult>((resolve, reject) => {
    const res = createMockResponse(resolve, reject);
    const maybePromise = sharepicClaudeHandler(mockReq as any, res as any, type as any) as
      | Promise<unknown>
      | undefined;

    if (maybePromise != null && typeof maybePromise.then === 'function') {
      void maybePromise.catch(reject);
    }
  }).then((result) => result.payload as Record<string, unknown>);
};

const callCanvasRoute = async (
  router: Router,
  body: Record<string, unknown>,
  file: TempFile | { buffer: Buffer; mimetype: string; originalname: string } | null = null
): Promise<CanvasResult> => {
  const handler = getRouteHandler(router);

  return new Promise<CanvasResult>((resolve, reject) => {
    const req = {
      body,
      file: file,
      params: {},
      query: {},
      headers: {},
    };

    const res = createMockResponse(resolve, reject);

    try {
      const maybePromise = handler(req, res, (err: Error) => {
        if (err) {
          reject(err);
        }
      }) as Promise<unknown> | undefined;

      if (maybePromise && typeof maybePromise.then === 'function') {
        void maybePromise.catch(reject);
      }
    } catch (error) {
      reject(error);
    }
  });
};

const buildInfoCanvasPayload = ({
  header,
  subheader,
  body,
}: {
  header?: string;
  subheader?: string;
  body?: string;
}): { header?: string; body: string } => {
  const combinedBody = subheader && body ? `${subheader}. ${body}` : subheader || body || '';
  return {
    header,
    body: combinedBody,
  };
};

const generateInfoSharepic = async (
  expressReq: ExpressRequest,
  requestBody: RequestBody
): Promise<SharepicResult> => {
  const textResponse = await callSharepicClaude(expressReq, 'info', requestBody);

  if (!textResponse?.success) {
    throw new Error((textResponse?.error as string) || 'Info Sharepic generation failed');
  }

  const mainInfo = textResponse.mainInfo as { header?: string; subheader?: string; body?: string };
  const alternatives = (textResponse.alternatives as unknown[]) || [];
  const { header, subheader, body } = mainInfo;

  const { payload: canvasPayload } = await callCanvasRoute(
    infoCanvasRouter,
    buildInfoCanvasPayload({ header, subheader, body })
  );

  if (!canvasPayload?.image) {
    throw new Error('Info canvas did not return an image');
  }

  return {
    success: true,
    agent: 'info',
    content: {
      metadata: {
        sharepicType: 'info',
      },
      sharepic: {
        image: canvasPayload.image,
        type: 'info',
        text: `${header}\n${subheader || ''}\n${body || ''}`.trim(),
        header,
        subheader,
        body,
        alternatives,
      },
      sharepicTitle: 'Sharepic Vorschau',
      sharepicDownloadText: 'Sharepic herunterladen',
      sharepicDownloadFilename: `sharepic-info-${Date.now()}.png`,
    },
  };
};

const generateZitatPureSharepic = async (
  expressReq: ExpressRequest,
  requestBody: RequestBody
): Promise<SharepicResult> => {
  const textResponse = await callSharepicClaude(expressReq, 'zitat_pure', {
    ...requestBody,
    preserveName:
      requestBody.preserveName !== undefined ? requestBody.preserveName : !!requestBody.name,
  });

  if (!textResponse?.success) {
    throw new Error((textResponse?.error as string) || 'Zitat Pure Sharepic generation failed');
  }

  const quote = textResponse.quote as string;
  const alternatives = (textResponse.alternatives as unknown[]) || [];
  const name =
    requestBody.preserveName && requestBody.name
      ? requestBody.name
      : (textResponse.name as string) || '';

  const { payload: canvasPayload } = await callCanvasRoute(zitatPureCanvasRouter, { quote, name });

  if (!canvasPayload?.image) {
    throw new Error('Zitat Pure canvas did not return an image');
  }

  return {
    success: true,
    agent: 'zitat_pure',
    content: {
      metadata: {
        sharepicType: 'zitat_pure',
        quoteAuthor: name,
      },
      sharepic: {
        image: canvasPayload.image,
        type: 'zitat_pure',
        text: `"${quote}" - ${name}`,
        quote,
        name,
        alternatives,
      },
      sharepicTitle: 'Sharepic Vorschau',
      sharepicDownloadText: 'Sharepic herunterladen',
      sharepicDownloadFilename: `sharepic-zitat_pure-${Date.now()}.png`,
    },
  };
};

const generateDreizeilenSharepic = async (
  expressReq: ExpressRequest,
  requestBody: RequestBody
): Promise<SharepicResult> => {
  const textResponse = await callSharepicClaude(expressReq, 'dreizeilen', requestBody);

  if (!textResponse?.success) {
    throw new Error((textResponse?.error as string) || 'Dreizeilen Sharepic generation failed');
  }

  const mainSlogan = textResponse.mainSlogan as MainSlogan;
  const alternatives = (textResponse.alternatives as unknown[]) || [];
  log.debug('[SharepicGeneration] Dreizeilen mainSlogan received:', JSON.stringify(mainSlogan));

  const { payload: canvasPayload } = await callCanvasRoute(
    dreizeilenCanvasRouter,
    mainSlogan as unknown as Record<string, unknown>
  );

  if (!canvasPayload?.image) {
    throw new Error('Dreizeilen canvas did not return an image');
  }

  return {
    success: true,
    agent: 'dreizeilen',
    content: {
      metadata: {
        sharepicType: 'dreizeilen',
      },
      sharepic: {
        image: canvasPayload.image,
        type: 'dreizeilen',
        text: `${mainSlogan.line1 || ''}\n${mainSlogan.line2 || ''}\n${mainSlogan.line3 || ''}`.trim(),
        mainSlogan,
        alternatives,
      },
      sharepicTitle: 'Sharepic Vorschau',
      sharepicDownloadText: 'Sharepic herunterladen',
      sharepicDownloadFilename: `sharepic-dreizeilen-${Date.now()}.png`,
    },
  };
};

const generateZitatWithImageSharepic = async (
  expressReq: ExpressRequest,
  requestBody: RequestBody
): Promise<SharepicResult> => {
  log.debug('[SharepicGeneration] Generating zitat with image');

  let imageAttachment: ImageAttachment | null = null;
  const sharepicImageManager = expressReq.app?.locals?.sharepicImageManager;
  const sharepicRequestId = requestBody.sharepicRequestId;

  if (sharepicImageManager && sharepicRequestId) {
    log.debug('[SharepicGeneration] Attempting to retrieve image from SharepicImageManager');
    imageAttachment = await sharepicImageManager.retrieveAndConsume(sharepicRequestId);
  }

  if (!imageAttachment) {
    log.debug('[SharepicGeneration] Falling back to legacy attachment method');
    imageAttachment = getFirstImageAttachment(requestBody.attachments) as ImageAttachment | null;
  }

  if (!imageAttachment) {
    throw new Error('Zitat sharepic requires an image attachment');
  }
  validateImageAttachment(imageAttachment);

  let tempFile: TempFile | null = null;
  try {
    const textResponse = await callSharepicClaude(expressReq, 'zitat_pure', {
      ...requestBody,
      preserveName: true,
    });
    if (!textResponse?.success) {
      throw new Error((textResponse?.error as string) || 'Zitat text generation failed');
    }

    const quote = textResponse.quote as string;
    const alternatives = (textResponse.alternatives as unknown[]) || [];
    const name = requestBody.name || (textResponse.name as string) || '';

    tempFile = (await convertToTempFile(imageAttachment)) as TempFile;

    const mockReq = {
      body: { quote, name },
      file: tempFile,
    };

    const { payload: canvasPayload } = await callCanvasRoute(
      zitatCanvasRouter,
      mockReq.body,
      mockReq.file
    );

    if (!canvasPayload?.image) {
      throw new Error('Zitat canvas did not return an image');
    }

    return {
      success: true,
      agent: 'zitat',
      content: {
        metadata: {
          sharepicType: 'zitat',
          quoteAuthor: name,
        },
        sharepic: {
          image: canvasPayload.image,
          type: 'zitat',
          text: `"${quote}" - ${name}`,
          quote,
          name,
          alternatives,
        },
        sharepicTitle: 'Sharepic Vorschau',
        sharepicDownloadText: 'Sharepic herunterladen',
        sharepicDownloadFilename: `sharepic-zitat-${Date.now()}.png`,
      },
    };
  } finally {
    if (tempFile && tempFile.cleanup) {
      await tempFile.cleanup();
    }
  }
};

const generateDreizeilenWithImageSharepic = async (
  expressReq: ExpressRequest,
  requestBody: RequestBody
): Promise<SharepicResult> => {
  log.debug('[SharepicGeneration] Generating dreizeilen with image');

  let imageAttachment: ImageAttachment | null = null;
  const sharepicImageManager = expressReq.app?.locals?.sharepicImageManager;
  const sharepicRequestId = requestBody.sharepicRequestId;

  if (sharepicImageManager && sharepicRequestId) {
    log.debug('[SharepicGeneration] Attempting to retrieve image from SharepicImageManager');
    imageAttachment = await sharepicImageManager.retrieveAndConsume(sharepicRequestId);
  }

  if (!imageAttachment) {
    log.debug('[SharepicGeneration] Falling back to legacy attachment method');
    imageAttachment = getFirstImageAttachment(requestBody.attachments) as ImageAttachment | null;
  }

  if (!imageAttachment) {
    throw new Error('Dreizeilen sharepic requires an image attachment');
  }
  validateImageAttachment(imageAttachment);

  try {
    const textResponse = await callSharepicClaude(expressReq, 'dreizeilen', requestBody);
    if (!textResponse?.success) {
      throw new Error((textResponse?.error as string) || 'Dreizeilen text generation failed');
    }

    const mainSlogan = textResponse.mainSlogan as MainSlogan;
    const alternatives = (textResponse.alternatives as unknown[]) || [];

    const mockFile = convertToBuffer(imageAttachment);

    const mockReq = {
      body: mainSlogan,
      file: mockFile,
    };

    const { payload: canvasPayload } = await callCanvasRoute(
      dreizeilenCanvasRouter,
      mockReq.body as unknown as Record<string, unknown>,
      mockReq.file as { buffer: Buffer; mimetype: string; originalname: string }
    );

    if (!canvasPayload?.image) {
      throw new Error('Dreizeilen canvas did not return an image');
    }

    return {
      success: true,
      agent: 'dreizeilen',
      content: {
        metadata: {
          sharepicType: 'dreizeilen',
        },
        sharepic: {
          image: canvasPayload.image,
          type: 'dreizeilen',
          text: `${mainSlogan.line1 || ''}\n${mainSlogan.line2 || ''}\n${mainSlogan.line3 || ''}`.trim(),
          mainSlogan,
          alternatives,
        },
        sharepicTitle: 'Sharepic Vorschau',
        sharepicDownloadText: 'Sharepic herunterladen',
        sharepicDownloadFilename: `sharepic-dreizeilen-${Date.now()}.png`,
      },
    };
  } catch (error) {
    log.error('[SharepicGeneration] Error in dreizeilen with image:', error);
    throw error;
  }
};

const generateDreizeilenWithAIImageSharepic = async (
  expressReq: ExpressRequest,
  requestBody: RequestBody
): Promise<SharepicResult> => {
  log.debug('[SharepicGeneration] Generating dreizeilen with AI-selected image');

  const sharepicImageManager = expressReq.app?.locals?.sharepicImageManager;
  const sharepicRequestId = requestBody.sharepicRequestId;
  if (sharepicImageManager && sharepicRequestId) {
    const hadUploadedImage = await sharepicImageManager.hasImageForRequest(sharepicRequestId);
    if (hadUploadedImage) {
      await sharepicImageManager.deleteImageForRequest(sharepicRequestId);
      log.debug('[SharepicGeneration] Cleaned up uploaded image since AI selection is used');
    }
  }

  try {
    const textResponse = await callSharepicClaude(expressReq, 'dreizeilen', requestBody);

    if (!textResponse?.success) {
      throw new Error((textResponse?.error as string) || 'Dreizeilen text generation failed');
    }

    const mainSlogan = textResponse.mainSlogan as MainSlogan;
    const alternatives = (textResponse.alternatives as unknown[]) || [];

    const textForAnalysis =
      `${mainSlogan.line1 || ''} ${mainSlogan.line2 || ''} ${mainSlogan.line3 || ''}`.trim();
    const { attachment: aiImageAttachment, selection } = await selectAndPrepareImage(
      textForAnalysis,
      'dreizeilen',
      expressReq.app.locals!.aiWorkerPool!,
      expressReq
    );

    const mockFile = convertToBuffer(aiImageAttachment);

    const mockReq = {
      body: mainSlogan,
      file: mockFile,
    };

    const { payload: canvasPayload } = await callCanvasRoute(
      dreizeilenCanvasRouter,
      mockReq.body as unknown as Record<string, unknown>,
      mockReq.file as { buffer: Buffer; mimetype: string; originalname: string }
    );

    if (!canvasPayload?.image) {
      throw new Error('Dreizeilen canvas did not return an image');
    }

    return {
      success: true,
      agent: 'dreizeilen',
      content: {
        metadata: {
          sharepicType: 'dreizeilen',
          aiSelectedImage: {
            filename: selection.selectedImage.filename,
            confidence: selection.confidence,
            reasoning: selection.reasoning,
          },
        },
        sharepic: {
          image: canvasPayload.image,
          type: 'dreizeilen',
          text: `${mainSlogan.line1 || ''}\n${mainSlogan.line2 || ''}\n${mainSlogan.line3 || ''}`.trim(),
          mainSlogan,
          alternatives,
          selectedImage: selection.selectedImage.filename,
        },
        sharepicTitle: 'Sharepic Vorschau',
        sharepicDownloadText: 'Sharepic herunterladen',
        sharepicDownloadFilename: `sharepic-dreizeilen-${Date.now()}.png`,
      },
    };
  } catch (error) {
    log.error('[SharepicGeneration] Error in dreizeilen with AI image:', error);
    throw error;
  } finally {
    if (sharepicImageManager && sharepicRequestId) {
      try {
        const hasRemainingImage = await sharepicImageManager.hasImageForRequest(sharepicRequestId);
        if (hasRemainingImage) {
          await sharepicImageManager.deleteImageForRequest(sharepicRequestId);
          log.debug(
            '[SharepicGeneration] Cleaned up remaining uploaded image after dreizeilen AI generation'
          );
        }
      } catch (cleanupError) {
        log.warn('[SharepicGeneration] Error during image cleanup:', cleanupError);
      }
    }
  }
};

const generateCampaignSharepic = async (
  expressReq: ExpressRequest,
  requestBody: RequestBody
): Promise<SharepicResult> => {
  const { campaignId, campaignTypeId } = requestBody;

  log.debug(`[Campaign] Generating ${campaignId}/${campaignTypeId} sharepic`);

  const campaignConfig = loadCampaignConfig(campaignId!, campaignTypeId!);
  if (!campaignConfig) {
    throw new Error(`Campaign configuration not found: ${campaignId}/${campaignTypeId}`);
  }

  const baseType = campaignConfig.basedOn || 'dreizeilen';

  log.debug(`[Campaign] Using base type: ${baseType}`);

  let textData: TextData = {};
  let textResponse: Record<string, unknown> = {};

  if (campaignConfig.responseParser) {
    log.debug(`[Campaign] Using declarative parser: ${campaignConfig.responseParser.type}`);

    const promptConfig = campaignConfig.prompt;

    let requestText = promptConfig?.requestTemplate || promptConfig?.singleItemTemplate || '';
    Object.keys(requestBody).forEach((key) => {
      const placeholder = `{{${key}}}`;
      if (requestText.includes(placeholder)) {
        requestText = requestText.replace(
          new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
          String(requestBody[key]) || ''
        );
      }
    });

    const aiResult = await expressReq.app.locals!.aiWorkerPool!.processRequest(
      {
        type: `campaign_${campaignTypeId}`,
        systemPrompt: promptConfig?.systemRole || '',
        messages: [{ role: 'user', content: requestText }],
        options: promptConfig?.options,
      },
      expressReq
    );

    if (!aiResult?.content) {
      throw new Error('AI response empty or invalid');
    }

    log.debug(`[Campaign] Raw AI response (${aiResult.content.length} chars)`);

    try {
      textData = parseResponse(aiResult.content, campaignConfig.responseParser) as TextData;
      log.debug(`[Campaign] Parsed text data:`, textData);
    } catch (parseError) {
      log.error(`[Campaign] Parser error:`, parseError);
      throw new Error(`Failed to parse AI response: ${(parseError as Error).message}`);
    }
  } else {
    log.debug(`[Campaign] Using handler-based parsing for baseType: ${baseType}`);

    textResponse = await callSharepicClaude(expressReq, baseType, {
      ...requestBody,
      _campaignPrompt: campaignConfig.prompt,
    } as RequestBody);

    if (!textResponse?.success) {
      throw new Error((textResponse?.error as string) || 'Campaign text generation failed');
    }

    switch (baseType) {
      case 'dreizeilen': {
        const mainSlogan = textResponse.mainSlogan as MainSlogan;
        textData = {
          line1: mainSlogan?.line1,
          line2: mainSlogan?.line2,
          line3: mainSlogan?.line3,
        };
        break;
      }
      case 'zitat':
      case 'zitat_pure':
        textData = {
          quote: textResponse.quote as string,
          name: (textResponse.name as string) || '',
        };
        break;
      case 'info': {
        const mainInfo = textResponse.mainInfo as {
          header?: string;
          subheader?: string;
          body?: string;
        };
        textData = {
          header: mainInfo?.header,
          subheader: mainInfo?.subheader,
          body: mainInfo?.body,
        };
        break;
      }
      default:
        throw new Error(`Unknown base type for campaign: ${baseType}`);
    }
  }

  log.debug(`[Campaign] Text data extracted:`, textData);

  const { payload: canvasPayload } = await callCanvasRoute(campaignCanvasRouter, {
    campaignConfig: campaignConfig,
    textData: textData,
  });

  if (!canvasPayload?.image) {
    throw new Error('Campaign canvas did not return an image');
  }

  const campaignName = campaignConfig.name || campaignTypeId;

  return {
    success: true,
    agent: 'campaign',
    content: {
      metadata: {
        sharepicType: 'campaign',
        campaignId,
        campaignTypeId,
      },
      sharepic: {
        image: canvasPayload.image,
        type: campaignTypeId!,
        textData,
        alternatives: (textResponse.alternatives as unknown[]) || [],
      },
      sharepicTitle: `${campaignName} Sharepic`,
      sharepicDownloadText: 'Sharepic herunterladen',
      sharepicDownloadFilename: `sharepic-${campaignId}-${campaignTypeId}-${Date.now()}.png`,
    },
  };
};

const generateSharepicForChat = async (
  expressReq: ExpressRequest,
  type: string,
  requestBody: RequestBody
): Promise<SharepicResult> => {
  if (requestBody.campaignId && requestBody.campaignTypeId) {
    log.debug(
      `[SharepicGeneration] Campaign sharepic requested: ${requestBody.campaignId}/${requestBody.campaignTypeId}`
    );
    return await generateCampaignSharepic(expressReq, requestBody);
  }

  if (!SHAREPIC_TYPES.has(type)) {
    throw new Error(`Unsupported sharepic type: ${type}`);
  }

  let hasImageAttachment = false;
  const sharepicImageManager = expressReq.app?.locals?.sharepicImageManager;
  const sharepicRequestId = requestBody.sharepicRequestId;

  if (sharepicImageManager && sharepicRequestId) {
    hasImageAttachment = await sharepicImageManager.hasImageForRequest(sharepicRequestId);
    log.debug(`[SharepicGeneration] SharepicImageManager check: hasImage=${hasImageAttachment}`);
  }

  if (!hasImageAttachment) {
    hasImageAttachment = !!(
      requestBody.attachments &&
      Array.isArray(requestBody.attachments) &&
      requestBody.attachments.some((att) => att.type && att.type.startsWith('image/'))
    );
  }

  switch (type) {
    case 'info':
      return generateInfoSharepic(expressReq, requestBody);
    case 'zitat_pure':
      return generateZitatPureSharepic(expressReq, requestBody);
    case 'zitat':
      if (!hasImageAttachment) {
        return generateZitatPureSharepic(expressReq, requestBody);
      }
      return generateZitatWithImageSharepic(expressReq, requestBody);
    case 'dreizeilen':
      if (hasImageAttachment) {
        return generateDreizeilenWithImageSharepic(expressReq, requestBody);
      } else {
        log.debug('[SharepicGeneration] No image provided for dreizeilen, using AI selection');
        return generateDreizeilenWithAIImageSharepic(expressReq, requestBody);
      }
    default:
      throw new Error(`Unsupported sharepic type: ${type}`);
  }
};

export { generateSharepicForChat };
export type { SharepicResult, RequestBody, ExpressRequest };
