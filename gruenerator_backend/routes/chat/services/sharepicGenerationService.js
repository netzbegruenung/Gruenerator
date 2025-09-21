const sharepicClaudeRouter = require('../../sharepic/sharepic_claude/sharepic_claude');
const infoCanvasRouter = require('../../sharepic/sharepic_canvas/info_canvas');
const zitatPureCanvasRouter = require('../../sharepic/sharepic_canvas/zitat_pure_canvas');
const zitatCanvasRouter = require('../../sharepic/sharepic_canvas/zitat_canvas');
const dreizeilenCanvasRouter = require('../../sharepic/sharepic_canvas/dreizeilen_canvas');
const headlineCanvasRouter = require('../../sharepic/sharepic_canvas/headline_canvas');

const { getFirstImageAttachment, convertToBuffer, convertToTempFile, validateImageAttachment } = require('../../../utils/attachmentToCanvasAdapter');

const SHAREPIC_TYPES = new Set(['info', 'zitat_pure', 'zitat', 'dreizeilen', 'headline']);
const IMAGE_REQUIRED_TYPES = new Set(['zitat', 'dreizeilen']);

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
    body
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

const formatInfoText = ({ header, subheader, body }) => {
  const parts = [];
  if (header) {
    parts.push(`**${header}**`);
  }
  if (subheader) {
    parts.push(`*${subheader}*`);
  }
  if (body) {
    parts.push(body);
  }
  return parts.join('\n\n');
};

const formatZitatPureText = ({ quote, name }) => {
  return name ? `"${quote}"\n\n— ${name}` : `"${quote}"`;
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
      text: formatInfoText({ header, subheader, body }),
      metadata: {
        sharepicType: 'info'
      },
      sharepic: {
        image: canvasPayload.image,
        type: 'info',
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
  const textResponse = await callSharepicClaude(expressReq, 'zitat_pure', requestBody);

  if (!textResponse?.success) {
    throw new Error(textResponse?.error || 'Zitat Pure Sharepic generation failed');
  }

  const { quote, name, alternatives = [] } = textResponse;

  const { payload: canvasPayload } = await callCanvasRoute(zitatPureCanvasRouter, { quote, name });

  if (!canvasPayload?.image) {
    throw new Error('Zitat Pure canvas did not return an image');
  }

  return {
    success: true,
    agent: 'zitat_pure',
    content: {
      text: formatZitatPureText({ quote, name }),
      metadata: {
        sharepicType: 'zitat_pure',
        quoteAuthor: name
      },
      sharepic: {
        image: canvasPayload.image,
        type: 'zitat_pure',
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

const formatDreizeilenText = ({ line1, line2, line3 }) => {
  return [line1, line2, line3].filter(Boolean).join('\n');
};

const formatHeadlineText = ({ line1, line2, line3 }) => {
  return [line1, line2, line3].filter(Boolean).join('\n');
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

  const { payload: canvasPayload } = await callCanvasRoute(dreizeilenCanvasRouter, buildDreizeilenCanvasPayload(mainSlogan));

  if (!canvasPayload?.image) {
    throw new Error('Dreizeilen canvas did not return an image');
  }

  return {
    success: true,
    agent: 'dreizeilen',
    content: {
      text: formatDreizeilenText(mainSlogan),
      metadata: {
        sharepicType: 'dreizeilen'
      },
      sharepic: {
        image: canvasPayload.image,
        type: 'dreizeilen',
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

  const { payload: canvasPayload } = await callCanvasRoute(headlineCanvasRouter, buildHeadlineCanvasPayload(mainSlogan));

  if (!canvasPayload?.image) {
    throw new Error('Headline canvas did not return an image');
  }

  return {
    success: true,
    agent: 'headline',
    content: {
      text: formatHeadlineText(mainSlogan),
      metadata: {
        sharepicType: 'headline'
      },
      sharepic: {
        image: canvasPayload.image,
        type: 'headline',
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

  // Get and validate image attachment
  const imageAttachment = getFirstImageAttachment(requestBody.attachments);
  if (!imageAttachment) {
    throw new Error('Zitat sharepic requires an image attachment');
  }
  validateImageAttachment(imageAttachment);

  let tempFile = null;
  try {
    // Generate text content first
    // Generate text content first - use expressReq.body to include extracted name parameter
    const textResponse = await callSharepicClaude(expressReq, 'zitat_pure', expressReq.body);
    if (!textResponse?.success) {
      throw new Error(textResponse?.error || 'Zitat text generation failed');
    }

    const { quote, name, alternatives = [] } = textResponse;

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
        text: formatZitatPureText({ quote, name }),
        metadata: {
          sharepicType: 'zitat',
          quoteAuthor: name
        },
        sharepic: {
          image: canvasPayload.image,
          type: 'zitat',
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

  // Get and validate image attachment
  const imageAttachment = getFirstImageAttachment(requestBody.attachments);
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
      body: buildDreizeilenCanvasPayload(mainSlogan),
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
        text: formatDreizeilenText(mainSlogan),
        metadata: {
          sharepicType: 'dreizeilen'
        },
        sharepic: {
          image: canvasPayload.image,
          type: 'dreizeilen',
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

const generateSharepicForChat = async (expressReq, type, requestBody) => {
  if (!SHAREPIC_TYPES.has(type)) {
    throw new Error(`Unsupported sharepic type: ${type}`);
  }

  // Check for image attachments for image-required types
  const hasImageAttachment = requestBody.attachments &&
    Array.isArray(requestBody.attachments) &&
    requestBody.attachments.some(att => att.type && att.type.startsWith('image/'));

  console.log(`[SharepicGeneration] Processing ${type} with image: ${hasImageAttachment}`);

  switch (type) {
    case 'info':
      return generateInfoSharepic(expressReq, requestBody);
    case 'zitat_pure':
      return generateZitatPureSharepic(expressReq, requestBody);
    case 'zitat':
      // Image-based zitat
      if (!hasImageAttachment) {
        throw new Error('Zitat sharepic requires an image upload. Please attach an image or use text-only quotes.');
      }
      return generateZitatWithImageSharepic(expressReq, requestBody);
    case 'dreizeilen':
      // Check if we have image or should use existing text-only version
      if (hasImageAttachment) {
        return generateDreizeilenWithImageSharepic(expressReq, requestBody);
      } else {
        // Fall back to existing dreizeilen (text-only)
        return generateDreizeilenSharepic(expressReq, requestBody);
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
