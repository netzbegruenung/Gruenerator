const sharepicClaudeRouter = require('../../sharepic/sharepic_claude/sharepic_claude');
const infoCanvasRouter = require('../../sharepic/sharepic_canvas/info_canvas');
const zitatPureCanvasRouter = require('../../sharepic/sharepic_canvas/zitat_pure_canvas');
const zitatCanvasRouter = require('../../sharepic/sharepic_canvas/zitat_canvas');
const dreizeilenCanvasRouter = require('../../sharepic/sharepic_canvas/dreizeilen_canvas');
const headlineCanvasRouter = require('../../sharepic/sharepic_canvas/headline_canvas');

const { getFirstImageAttachment, convertToBuffer, convertToTempFile, validateImageAttachment } = require('../../../utils/attachmentToCanvasAdapter');
const imagePickerService = require('../../../services/imagePickerService');
const fs = require('fs').promises;
const path = require('path');

const SHAREPIC_TYPES = new Set(['info', 'zitat_pure', 'zitat', 'dreizeilen', 'headline']);
const IMAGE_REQUIRED_TYPES = new Set(['zitat', 'dreizeilen']);

/**
 * Create a mock image attachment from an AI-selected image file
 * @param {string} filename - Selected image filename
 * @returns {Object} Mock attachment object
 */
const createImageAttachmentFromFile = async (filename) => {
  const imagePath = imagePickerService.getImagePath(filename);

  try {
    // Read the image file
    const imageBuffer = await fs.readFile(imagePath);

    // Create base64 data URL
    const base64Data = imageBuffer.toString('base64');
    const mimeType = filename.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
    const dataUrl = `data:${mimeType};base64,${base64Data}`;

    return {
      type: mimeType,
      data: dataUrl,
      name: filename,
      size: imageBuffer.length,
      source: 'ai-selected' // Mark as AI-selected for logging
    };
  } catch (error) {
    console.error(`[SharepicGeneration] Failed to load image ${filename}:`, error);
    throw new Error(`Failed to load selected image: ${filename}`);
  }
};

/**
 * Select and prepare an image attachment for sharepic generation
 * @param {string} textContent - Text content to analyze for image selection
 * @param {string} sharepicType - Type of sharepic being generated
 * @param {Object} aiWorkerPool - AI worker pool instance
 * @param {Object} req - Express request object (optional)
 * @returns {Object} Image attachment object
 */
const selectAndPrepareImage = async (textContent, sharepicType, aiWorkerPool, req = null) => {
  console.log(`[SharepicGeneration] Selecting image for ${sharepicType} sharepic`);

  try {
    // Use image picker service to select best image
    const selection = await imagePickerService.selectBestImage(textContent, aiWorkerPool, {}, req);

    console.log(`[SharepicGeneration] Selected image: ${selection.selectedImage.filename} (confidence: ${selection.confidence})`);
    console.log(`[SharepicGeneration] Selection reasoning: ${selection.reasoning}`);

    // Create attachment from selected image
    const imageAttachment = await createImageAttachmentFromFile(selection.selectedImage.filename);

    return {
      attachment: imageAttachment,
      selection: selection // Include selection details for logging/debugging
    };

  } catch (error) {
    console.error('[SharepicGeneration] Failed to select image:', error);

    // Fallback to a default safe image
    try {
      console.log('[SharepicGeneration] Using fallback image');
      const fallbackImage = await createImageAttachmentFromFile('mike-marrah-XNCv-DcTLx4-unsplash.jpg'); // Sunflower image as fallback
      return {
        attachment: fallbackImage,
        selection: {
          selectedImage: { filename: 'mike-marrah-XNCv-DcTLx4-unsplash.jpg' },
          confidence: 0.1,
          reasoning: 'Fallback after selection failed'
        }
      };
    } catch (fallbackError) {
      console.error('[SharepicGeneration] Even fallback image failed:', fallbackError);
      throw new Error('Failed to select any image for sharepic generation');
    }
  }
};

const getRouteHandler = (router) => {
  const layer = router.stack?.find((entry) => entry.route && entry.route.path === '/' && entry.route.methods?.post);
  if (!layer) {
    throw new Error('Canvas route handler not found');
  }

  const routeStack = layer.route.stack;
  const handlerLayer = routeStack[routeStack.length - 1];
  return handlerLayer.handle;
};

const createMockResponse = (resolve, reject) => {
  const res = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      resolve({ statusCode: this.statusCode || 200, payload });
    },
    send(payload) {
      resolve({ statusCode: this.statusCode || 200, payload });
    },
    set() {
      return this;
    }
  };
  return res;
};

const callSharepicClaude = async (expressReq, type, body) => {
  if (typeof sharepicClaudeRouter.handleClaudeRequest !== 'function') {
    throw new Error('Sharepic Claude handler unavailable');
  }

  const mockReq = {
    app: expressReq.app,
    headers: expressReq.headers,
    user: expressReq.user,
    correlationId: expressReq.correlationId,
    body: {
      ...body,
      count: 1 // Force single item generation for all sharepic requests
    }
  };

  return new Promise((resolve, reject) => {
    const res = createMockResponse(resolve, reject);

    const maybePromise = sharepicClaudeRouter.handleClaudeRequest(mockReq, res, type);

    if (maybePromise && typeof maybePromise.then === 'function') {
      maybePromise.catch(reject);
    }
  }).then(result => result.payload);
};

const callCanvasRoute = async (router, body, file = null) => {
  const handler = getRouteHandler(router);

  return new Promise((resolve, reject) => {
    const req = {
      body,
      file: file, // Properly set the file property
      // Add other multer properties that the canvas routes might expect
      params: {},
      query: {},
      headers: {}
    };

    const res = createMockResponse(resolve, reject);

    try {
      const maybePromise = handler(req, res, (err) => {
        if (err) {
          reject(err);
        }
      });

      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.catch(reject);
      }
    } catch (error) {
      reject(error);
    }
  });
};


const buildInfoCanvasPayload = ({ header, subheader, body }) => {
  const combinedBody = subheader && body ? `${subheader}. ${body}` : subheader || body || '';
  return {
    header,
    body: combinedBody
  };
};

const generateInfoSharepic = async (expressReq, requestBody) => {
  const textResponse = await callSharepicClaude(expressReq, 'info', requestBody);

  if (!textResponse?.success) {
    throw new Error(textResponse?.error || 'Info Sharepic generation failed');
  }

  const { header, subheader, body, alternatives = [] } = textResponse;

  const { payload: canvasPayload } = await callCanvasRoute(infoCanvasRouter, buildInfoCanvasPayload({ header, subheader, body }));

  if (!canvasPayload?.image) {
    throw new Error('Info canvas did not return an image');
  }

  return {
    success: true,
    agent: 'info',
    content: {
      metadata: {
        sharepicType: 'info'
      },
      sharepic: {
        image: canvasPayload.image,
        type: 'info',
        text: `${header}\n${subheader || ''}\n${body || ''}`.trim(),
        header,
        subheader,
        body,
        alternatives
      },
      sharepicTitle: 'Sharepic Vorschau',
      sharepicDownloadText: 'Sharepic herunterladen',
      sharepicDownloadFilename: `sharepic-info-${Date.now()}.png`
    }
  };
};

const generateZitatPureSharepic = async (expressReq, requestBody) => {
  const textResponse = await callSharepicClaude(expressReq, 'zitat_pure', {
    ...requestBody,
    preserveName: requestBody.preserveName || false  // Pass through preserveName flag
  });

  if (!textResponse?.success) {
    throw new Error(textResponse?.error || 'Zitat Pure Sharepic generation failed');
  }

  const { quote, alternatives = [] } = textResponse;
  // Use preserved name from request body if preserveName flag was set, otherwise use AI response
  const name = (requestBody.preserveName && expressReq.body.name)
    ? expressReq.body.name
    : textResponse.name || '';

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
        quoteAuthor: name
      },
      sharepic: {
        image: canvasPayload.image,
        type: 'zitat_pure',
        text: `"${quote}" - ${name}`,
        quote,
        name,
        alternatives
      },
      sharepicTitle: 'Sharepic Vorschau',
      sharepicDownloadText: 'Sharepic herunterladen',
      sharepicDownloadFilename: `sharepic-zitat_pure-${Date.now()}.png`
    }
  };
};


const buildDreizeilenCanvasPayload = ({ line1, line2, line3 }) => {
  return { line1, line2, line3 };
};

const buildHeadlineCanvasPayload = ({ line1, line2, line3 }) => {
  return { line1, line2, line3 };
};

const generateDreizeilenSharepic = async (expressReq, requestBody) => {
  const textResponse = await callSharepicClaude(expressReq, 'dreizeilen', requestBody);

  if (!textResponse?.success) {
    throw new Error(textResponse?.error || 'Dreizeilen Sharepic generation failed');
  }

  const { mainSlogan, alternatives = [] } = textResponse;
  console.log('[SharepicGeneration] Dreizeilen mainSlogan received:', JSON.stringify(mainSlogan));

  const { payload: canvasPayload } = await callCanvasRoute(dreizeilenCanvasRouter, mainSlogan);

  if (!canvasPayload?.image) {
    throw new Error('Dreizeilen canvas did not return an image');
  }

  return {
    success: true,
    agent: 'dreizeilen',
    content: {
      metadata: {
        sharepicType: 'dreizeilen'
      },
      sharepic: {
        image: canvasPayload.image,
        type: 'dreizeilen',
        text: `${mainSlogan.line1 || ''}\n${mainSlogan.line2 || ''}\n${mainSlogan.line3 || ''}`.trim(),
        mainSlogan,
        alternatives
      },
      sharepicTitle: 'Sharepic Vorschau',
      sharepicDownloadText: 'Sharepic herunterladen',
      sharepicDownloadFilename: `sharepic-dreizeilen-${Date.now()}.png`
    }
  };
};

const generateHeadlineSharepic = async (expressReq, requestBody) => {
  const textResponse = await callSharepicClaude(expressReq, 'headline', requestBody);

  if (!textResponse?.success) {
    throw new Error(textResponse?.error || 'Headline Sharepic generation failed');
  }

  const { mainSlogan, alternatives = [] } = textResponse;

  const { payload: canvasPayload } = await callCanvasRoute(headlineCanvasRouter, mainSlogan);

  if (!canvasPayload?.image) {
    throw new Error('Headline canvas did not return an image');
  }

  return {
    success: true,
    agent: 'headline',
    content: {
      metadata: {
        sharepicType: 'headline'
      },
      sharepic: {
        image: canvasPayload.image,
        type: 'headline',
        text: `${mainSlogan.line1 || ''}\n${mainSlogan.line2 || ''}\n${mainSlogan.line3 || ''}`.trim(),
        mainSlogan,
        alternatives
      },
      sharepicTitle: 'Sharepic Vorschau',
      sharepicDownloadText: 'Sharepic herunterladen',
      sharepicDownloadFilename: `sharepic-headline-${Date.now()}.png`
    }
  };
};

const generateZitatWithImageSharepic = async (expressReq, requestBody) => {
  console.log('[SharepicGeneration] Generating zitat with image');

  // First try to get image from SharepicImageManager (preferred)
  let imageAttachment = null;
  const sharepicImageManager = expressReq.app?.locals?.sharepicImageManager;
  const sharepicRequestId = requestBody.sharepicRequestId;

  if (sharepicImageManager && sharepicRequestId) {
    console.log('[SharepicGeneration] Attempting to retrieve image from SharepicImageManager');
    imageAttachment = await sharepicImageManager.retrieveAndConsume(sharepicRequestId);
  }

  // Fallback to legacy attachment method
  if (!imageAttachment) {
    console.log('[SharepicGeneration] Falling back to legacy attachment method');
    imageAttachment = getFirstImageAttachment(requestBody.attachments);
  }

  if (!imageAttachment) {
    throw new Error('Zitat sharepic requires an image attachment');
  }
  validateImageAttachment(imageAttachment);

  let tempFile = null;
  try {
    // Generate text content first
    // Generate text content first - use expressReq.body to include extracted name parameter
    const textResponse = await callSharepicClaude(expressReq, 'zitat_pure', {
      ...expressReq.body,
      preserveName: true  // Flag to preserve user-provided name for chat requests
    });
    if (!textResponse?.success) {
      throw new Error(textResponse?.error || 'Zitat text generation failed');
    }

    const { quote, alternatives = [] } = textResponse;
    // Use preserved name from request body if preserveName flag was set
    const name = expressReq.body.name || textResponse.name || '';

    // Convert attachment to temp file for zitat_canvas
    tempFile = await convertToTempFile(imageAttachment);

    // Create mock request for zitat_canvas
    const mockReq = {
      body: { quote, name },
      file: tempFile
    };

    // Call zitat_canvas route
    const { payload: canvasPayload } = await callCanvasRoute(zitatCanvasRouter, mockReq.body, mockReq.file);

    if (!canvasPayload?.image) {
      throw new Error('Zitat canvas did not return an image');
    }

    return {
      success: true,
      agent: 'zitat',
      content: {
        metadata: {
          sharepicType: 'zitat',
          quoteAuthor: name
        },
        sharepic: {
          image: canvasPayload.image,
          type: 'zitat',
          text: `"${quote}" - ${name}`,
          quote,
          name,
          alternatives
        },
        sharepicTitle: 'Sharepic Vorschau',
        sharepicDownloadText: 'Sharepic herunterladen',
        sharepicDownloadFilename: `sharepic-zitat-${Date.now()}.png`
      }
    };

  } finally {
    // Cleanup temp file
    if (tempFile && tempFile.cleanup) {
      await tempFile.cleanup();
    }
  }
};

const generateDreizeilenWithImageSharepic = async (expressReq, requestBody) => {
  console.log('[SharepicGeneration] Generating dreizeilen with image');

  // First try to get image from SharepicImageManager (preferred)
  let imageAttachment = null;
  const sharepicImageManager = expressReq.app?.locals?.sharepicImageManager;
  const sharepicRequestId = requestBody.sharepicRequestId;

  if (sharepicImageManager && sharepicRequestId) {
    console.log('[SharepicGeneration] Attempting to retrieve image from SharepicImageManager');
    imageAttachment = await sharepicImageManager.retrieveAndConsume(sharepicRequestId);
  }

  // Fallback to legacy attachment method
  if (!imageAttachment) {
    console.log('[SharepicGeneration] Falling back to legacy attachment method');
    imageAttachment = getFirstImageAttachment(requestBody.attachments);
  }

  if (!imageAttachment) {
    throw new Error('Dreizeilen sharepic requires an image attachment');
  }
  validateImageAttachment(imageAttachment);

  try {
    // Generate text content first
    const textResponse = await callSharepicClaude(expressReq, 'dreizeilen', requestBody);
    if (!textResponse?.success) {
      throw new Error(textResponse?.error || 'Dreizeilen text generation failed');
    }

    const { mainSlogan, alternatives = [] } = textResponse;

    // Convert attachment to buffer for dreizeilen_canvas (uses memory storage)
    const mockFile = convertToBuffer(imageAttachment);

    // Create mock request for dreizeilen_canvas
    const mockReq = {
      body: mainSlogan,
      file: mockFile
    };

    // Call dreizeilen_canvas route
    const { payload: canvasPayload } = await callCanvasRoute(dreizeilenCanvasRouter, mockReq.body, mockReq.file);

    if (!canvasPayload?.image) {
      throw new Error('Dreizeilen canvas did not return an image');
    }

    return {
      success: true,
      agent: 'dreizeilen',
      content: {
        metadata: {
          sharepicType: 'dreizeilen'
        },
        sharepic: {
          image: canvasPayload.image,
          type: 'dreizeilen',
          text: `${mainSlogan.line1 || ''}\n${mainSlogan.line2 || ''}\n${mainSlogan.line3 || ''}`.trim(),
          mainSlogan,
          alternatives
        },
        sharepicTitle: 'Sharepic Vorschau',
        sharepicDownloadText: 'Sharepic herunterladen',
        sharepicDownloadFilename: `sharepic-dreizeilen-${Date.now()}.png`
      }
    };

  } catch (error) {
    console.error('[SharepicGeneration] Error in dreizeilen with image:', error);
    throw error;
  }
};

const generateZitatWithAIImageSharepic = async (expressReq, requestBody) => {
  console.log('[SharepicGeneration] Generating zitat with AI-selected image');

  // Clean up any uploaded images first (since we're using AI-selected images)
  const sharepicImageManager = expressReq.app?.locals?.sharepicImageManager;
  const sharepicRequestId = requestBody.sharepicRequestId;
  if (sharepicImageManager && sharepicRequestId) {
    const hadUploadedImage = await sharepicImageManager.hasImageForRequest(sharepicRequestId);
    if (hadUploadedImage) {
      await sharepicImageManager.deleteImageForRequest(sharepicRequestId);
      console.log('[SharepicGeneration] Cleaned up uploaded image since AI selection is used');
    }
  }

  try {
    // Generate text content first to analyze for image selection
    const textResponse = await callSharepicClaude(expressReq, 'zitat_pure', {
      ...expressReq.body,
      preserveName: true
    });
    if (!textResponse?.success) {
      throw new Error(textResponse?.error || 'Zitat text generation failed');
    }

    const { quote, alternatives = [] } = textResponse;
    const name = expressReq.body.name || textResponse.name || '';

    // Select appropriate image based on quote content
    const textForAnalysis = `${quote} ${name}`.trim();
    const { attachment: aiImageAttachment, selection } = await selectAndPrepareImage(textForAnalysis, 'zitat', expressReq.app.locals.aiWorkerPool, expressReq);

    // Convert AI-selected image to temp file for zitat_canvas
    const tempFile = await convertToTempFile(aiImageAttachment);

    // Create mock request for zitat_canvas
    const mockReq = {
      body: { quote, name },
      file: tempFile
    };

    // Call zitat_canvas route
    const { payload: canvasPayload } = await callCanvasRoute(zitatCanvasRouter, mockReq.body, mockReq.file);

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
          aiSelectedImage: {
            filename: selection.selectedImage.filename,
            confidence: selection.confidence,
            reasoning: selection.reasoning
          }
        },
        sharepic: {
          image: canvasPayload.image,
          type: 'zitat',
          text: `"${quote}" - ${name}`,
          quote,
          name,
          alternatives,
          selectedImage: selection.selectedImage.filename
        },
        sharepicTitle: 'Sharepic Vorschau',
        sharepicDownloadText: 'Sharepic herunterladen',
        sharepicDownloadFilename: `sharepic-zitat-${Date.now()}.png`
      }
    };

  } catch (error) {
    console.error('[SharepicGeneration] Error in zitat with AI image:', error);
    throw error;
  } finally {
    // Cleanup any remaining uploaded images for this request
    if (sharepicImageManager && sharepicRequestId) {
      try {
        const hasRemainingImage = await sharepicImageManager.hasImageForRequest(sharepicRequestId);
        if (hasRemainingImage) {
          await sharepicImageManager.deleteImageForRequest(sharepicRequestId);
          console.log('[SharepicGeneration] Cleaned up remaining uploaded image after zitat AI generation');
        }
      } catch (cleanupError) {
        console.warn('[SharepicGeneration] Error during image cleanup:', cleanupError);
      }
    }
    // Cleanup temp file if it exists
    // Note: tempFile cleanup is handled by convertToTempFile utility
  }
};

const generateDreizeilenWithAIImageSharepic = async (expressReq, requestBody) => {
  console.log('[SharepicGeneration] Generating dreizeilen with AI-selected image');

  // Clean up any uploaded images first (since we're using AI-selected images)
  const sharepicImageManager = expressReq.app?.locals?.sharepicImageManager;
  const sharepicRequestId = requestBody.sharepicRequestId;
  if (sharepicImageManager && sharepicRequestId) {
    const hadUploadedImage = await sharepicImageManager.hasImageForRequest(sharepicRequestId);
    if (hadUploadedImage) {
      await sharepicImageManager.deleteImageForRequest(sharepicRequestId);
      console.log('[SharepicGeneration] Cleaned up uploaded image since AI selection is used');
    }
  }

  try {
    // Generate text content first to analyze for image selection
    const textResponse = await callSharepicClaude(expressReq, 'dreizeilen', requestBody);

    if (!textResponse?.success) {
      throw new Error(textResponse?.error || 'Dreizeilen text generation failed');
    }

    const { mainSlogan, alternatives = [] } = textResponse;

    // Select appropriate image based on slogan content
    const textForAnalysis = `${mainSlogan.line1 || ''} ${mainSlogan.line2 || ''} ${mainSlogan.line3 || ''}`.trim();
    const { attachment: aiImageAttachment, selection } = await selectAndPrepareImage(textForAnalysis, 'dreizeilen', expressReq.app.locals.aiWorkerPool, expressReq);

    // Convert AI-selected image to buffer for dreizeilen_canvas (uses memory storage)
    const mockFile = convertToBuffer(aiImageAttachment);

    // Create mock request for dreizeilen_canvas
    const mockReq = {
      body: mainSlogan,
      file: mockFile
    };

    // Call dreizeilen_canvas route
    const { payload: canvasPayload } = await callCanvasRoute(dreizeilenCanvasRouter, mockReq.body, mockReq.file);

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
            reasoning: selection.reasoning
          }
        },
        sharepic: {
          image: canvasPayload.image,
          type: 'dreizeilen',
          text: `${mainSlogan.line1 || ''}\n${mainSlogan.line2 || ''}\n${mainSlogan.line3 || ''}`.trim(),
          mainSlogan,
          alternatives,
          selectedImage: selection.selectedImage.filename
        },
        sharepicTitle: 'Sharepic Vorschau',
        sharepicDownloadText: 'Sharepic herunterladen',
        sharepicDownloadFilename: `sharepic-dreizeilen-${Date.now()}.png`
      }
    };

  } catch (error) {
    console.error('[SharepicGeneration] Error in dreizeilen with AI image:', error);
    throw error;
  } finally {
    // Cleanup any remaining uploaded images for this request
    if (sharepicImageManager && sharepicRequestId) {
      try {
        const hasRemainingImage = await sharepicImageManager.hasImageForRequest(sharepicRequestId);
        if (hasRemainingImage) {
          await sharepicImageManager.deleteImageForRequest(sharepicRequestId);
          console.log('[SharepicGeneration] Cleaned up remaining uploaded image after dreizeilen AI generation');
        }
      } catch (cleanupError) {
        console.warn('[SharepicGeneration] Error during image cleanup:', cleanupError);
      }
    }
    // Cleanup temp file if it exists
    // Note: tempFile cleanup is handled by convertToTempFile utility
  }
};

const generateSharepicForChat = async (expressReq, type, requestBody) => {
  if (!SHAREPIC_TYPES.has(type)) {
    throw new Error(`Unsupported sharepic type: ${type}`);
  }

  // Check for image attachments - prioritize SharepicImageManager over legacy attachments
  let hasImageAttachment = false;
  const sharepicImageManager = expressReq.app?.locals?.sharepicImageManager;
  const sharepicRequestId = requestBody.sharepicRequestId;

  if (sharepicImageManager && sharepicRequestId) {
    hasImageAttachment = await sharepicImageManager.hasImageForRequest(sharepicRequestId);
    console.log(`[SharepicGeneration] SharepicImageManager check: hasImage=${hasImageAttachment}`);
  }

  // Fallback to legacy attachment check
  if (!hasImageAttachment) {
    hasImageAttachment = requestBody.attachments &&
      Array.isArray(requestBody.attachments) &&
      requestBody.attachments.some(att => att.type && att.type.startsWith('image/'));
    console.log(`[SharepicGeneration] Legacy attachment check: hasImage=${hasImageAttachment}`);
  }

  console.log(`[SharepicGeneration] Processing ${type} with image: ${hasImageAttachment}`);

  switch (type) {
    case 'info':
      return generateInfoSharepic(expressReq, requestBody);
    case 'zitat_pure':
      return generateZitatPureSharepic(expressReq, requestBody);
    case 'zitat':
      // Image-based zitat - use AI selection if no image provided
      if (!hasImageAttachment) {
        console.log('[SharepicGeneration] No image provided for zitat, using AI selection');
        return generateZitatWithAIImageSharepic(expressReq, requestBody);
      }
      return generateZitatWithImageSharepic(expressReq, requestBody);
    case 'dreizeilen':
      // Check if we have image or should use AI-selected image or text-only version
      if (hasImageAttachment) {
        return generateDreizeilenWithImageSharepic(expressReq, requestBody);
      } else {
        // Use AI image selection for better visual impact
        console.log('[SharepicGeneration] No image provided for dreizeilen, using AI selection');
        return generateDreizeilenWithAIImageSharepic(expressReq, requestBody);
      }
    case 'headline':
      return generateHeadlineSharepic(expressReq, requestBody);
    default:
      throw new Error(`Unsupported sharepic type: ${type}`);
  }
};

module.exports = {
  generateSharepicForChat
};
