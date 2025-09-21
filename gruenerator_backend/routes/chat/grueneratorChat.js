import express from 'express';
import { createAuthenticatedRouter } from '../../utils/createAuthenticatedRouter.js';
import { createRequire } from 'module';

// Use createRequire for CommonJS modules
const require = createRequire(import.meta.url);
const { classifyIntent } = require('../../agents/chat/intentClassifier');
const { extractParameters, analyzeParameterConfidence } = require('../../agents/chat/parameterExtractor');
const { handleInformationRequest } = require('../../agents/chat/informationRequestHandler');
const { processGraphRequest } = require('../../agents/langgraph/promptProcessor');
const { withErrorHandler } = require('../../utils/errorHandler');
const { generateSharepicForChat } = require('./services/sharepicGenerationService');
const chatMemory = require('../../services/chatMemoryService');
const { trimMessagesToTokenLimit } = require('../../utils/tokenCounter');
const DocumentQnAService = require('../../services/documentQnAService');
const redisClient = require('../../utils/redisClient');
const mistralClient = require('../../workers/mistralClient');

// Create authenticated router
const router = createAuthenticatedRouter();

// Initialize DocumentQnA service
const documentQnAService = new DocumentQnAService(redisClient, mistralClient);

/**
 * Main chat endpoint for Grünerator Chat
 * Handles all text generation through unified interface
 */
router.post('/', withErrorHandler(async (req, res) => {
  const {
    message,
    context = {},
    attachments = [],
    usePrivacyMode = false,
    provider = null
  } = req.body || {};

  console.log('[GrueneratorChat] Processing request:', {
    messageLength: message?.length || 0,
    hasContext: Object.keys(context).length > 0,
    hasAttachments: attachments?.length || 0,
    usePrivacyMode,
    provider
  });

  if (attachments && attachments.length > 0) {
    console.log('[GrueneratorChat] Request contains attachments:', attachments.map(att => ({
      name: att.name,
      type: att.type,
      size: att.size,
      hasData: !!att.data
    })));
  } else {
    console.log('[GrueneratorChat] Request contains no attachments');
  }

  // Validate required fields
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({
      success: false,
      error: 'Message is required and cannot be empty',
      code: 'VALIDATION_ERROR'
    });
  }

  try {
    // Step 1: Get user ID and manage conversation memory
    const userId = req.user?.id || `anon_${req.ip}`;
    console.log('[GrueneratorChat] Processing for user:', userId);

    // Store user message in memory
    await chatMemory.addMessage(userId, 'user', message);

    // Retrieve conversation history for context
    const conversation = await chatMemory.getConversation(userId);
    const trimmedHistory = trimMessagesToTokenLimit(conversation.messages, 6000);

    // Step 1.5: Process and store attachments in Redis if present
    let documentIds = [];
    if (attachments && attachments.length > 0) {
      console.log(`[GrueneratorChat] Storing ${attachments.length} attachments in Redis`);
      try {
        documentIds = await documentQnAService.storeAttachments(userId, attachments);
        console.log(`[GrueneratorChat] Successfully stored attachments with IDs:`, documentIds);
      } catch (error) {
        console.error('[GrueneratorChat] Error storing attachments:', error);
        // Continue without documents rather than failing the request
      }
    } else {
      console.log('[GrueneratorChat] No attachments to store');
    }

    // Step 1.6: Retrieve recent documents from Redis and include as attachments
    let recentDocuments = [];
    try {
      const recentDocIds = await documentQnAService.getRecentDocuments(userId, 10);
      console.log(`[GrueneratorChat] Found ${recentDocIds.length} recent documents for user ${userId}`);

      if (recentDocIds.length > 0) {
        console.log('[GrueneratorChat] Recent document IDs:', recentDocIds);

        for (const docId of recentDocIds) {
          try {
            if (!docId.includes(userId)) {
              console.warn(`[GrueneratorChat] Access denied to document ${docId} for user ${userId}`);
              continue;
            }

            const docData = await documentQnAService.redis.get(docId);
            if (docData) {
              const document = JSON.parse(docData);
              recentDocuments.push(document);
              console.log(`[GrueneratorChat] Retrieved recent document: ${document.name} (${document.type})`);
            } else {
              console.warn(`[GrueneratorChat] Document ${docId} not found in Redis`);
            }
          } catch (error) {
            console.error(`[GrueneratorChat] Error retrieving document ${docId}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('[GrueneratorChat] Error retrieving recent documents:', error);
      // Continue without recent documents rather than failing the request
    }

    // Combine attachments from request body and recent documents
    const allAttachments = [...(attachments || []), ...recentDocuments];
    console.log('[GrueneratorChat] Combined attachments:', {
      fromRequest: attachments?.length || 0,
      fromRecent: recentDocuments.length,
      total: allAttachments.length
    });

    // Enhance context with conversation history and document IDs
    const hasImageAttachment = allAttachments.some(attachment =>
      attachment.type && attachment.type.startsWith('image/')
    );

    console.log('[GrueneratorChat] Image detection result:', {
      hasImageAttachment,
      imageAttachments: allAttachments.filter(att => att.type?.startsWith('image/')).map(att => ({
        name: att.name,
        type: att.type,
        source: att.data ? 'data' : 'unknown'
      }))
    });

    const enhancedContext = {
      ...context,
      messageHistory: trimmedHistory,
      lastAgent: conversation.metadata?.lastAgent,
      documentIds: documentIds,
      hasImageAttachment: hasImageAttachment
    };

    console.log('[GrueneratorChat] Using conversation context:', {
      historyMessages: trimmedHistory.length,
      lastAgent: conversation.metadata?.lastAgent,
      documentsStored: documentIds.length,
      recentDocumentsRetrieved: recentDocuments.length,
      totalAttachments: allAttachments.length,
      hasImageAttachment: hasImageAttachment
    });

    // Step 1.8: Check for pending information requests first
    const pendingRequest = await chatMemory.getPendingRequest(userId);
    if (pendingRequest && pendingRequest.type === 'missing_information') {
      console.log('[GrueneratorChat] Found pending information request, checking if this is a new command or answer');

      // Check if this looks like a new command rather than an answer
      const commandKeywords = ['erstelle', 'mache', 'schreibe', 'generiere', 'sharepic', 'zitat'];
      const isNewCommand = commandKeywords.some(keyword =>
        message.toLowerCase().includes(keyword)
      );

      if (isNewCommand) {
        console.log('[GrueneratorChat] Detected new command, clearing old pending request');
        await chatMemory.clearPendingRequest(userId);
        // Continue with normal intent classification below
      } else {
        console.log('[GrueneratorChat] Treating as answer to pending request');

        // Try to extract the requested information from the current message
        const { extractRequestedInformation, completePendingRequest } = require('../../agents/chat/informationRequestHandler');
        const extractedInfo = extractRequestedInformation(message, pendingRequest);

        if (extractedInfo) {
        console.log('[GrueneratorChat] Information extracted, completing pending request');

        // Clear the pending request
        await chatMemory.clearPendingRequest(userId);

        // Complete the original request with the new information
        const completedRequest = completePendingRequest(pendingRequest, extractedInfo, req);

        // Create request context for the completed request
        const completedRequestContext = {
          message: completedRequest.originalMessage || completedRequest.message || '',
          thema: completedRequest.thema || '',
          details: completedRequest.details || '',
          name: completedRequest.name || '',
          usePrivacyMode: completedRequest.usePrivacyMode || false,
          provider: completedRequest.provider || null,
          chatContext: enhancedContext,
          attachments: completedRequest.attachments || [],
          documentIds: completedRequest.documentIds || []
        };

        // Process the completed request as a sharepic
        if (completedRequest.agent === 'zitat') {
          try {
            req.body = { ...req.body, ...completedRequestContext };
            const sharepicResponse = await generateSharepicForChat(req, 'zitat_pure', req.body);

            // Don't store sharepic responses as chat messages to avoid text content conflicts

            res.json(sharepicResponse);
            return;
          } catch (error) {
            console.error('[GrueneratorChat] Error processing completed request:', error);
            res.status(500).json({
              success: false,
              error: 'Fehler beim Erstellen des Sharepics mit den bereitgestellten Informationen',
              code: 'COMPLETION_ERROR'
            });
            return;
          }
        }

        // Handle cases where agent is still undefined or unrecognized
        if (!completedRequest.agent || completedRequest.agent === 'undefined') {
          console.log('[GrueneratorChat] No valid agent in completed request, clearing and treating as new request');
          await chatMemory.clearPendingRequest(userId);
          // Continue with normal intent classification instead of returning error
        } else {
          // For any other completed request, log and return to prevent further processing
          console.log('[GrueneratorChat] Completed pending request for agent:', completedRequest.agent);
          res.status(500).json({
            success: false,
            error: 'Handler for completed request not implemented for agent: ' + completedRequest.agent,
            code: 'UNHANDLED_AGENT_TYPE'
          });
          return;
        }
        } else {
          console.log('[GrueneratorChat] Could not extract requested information, will treat as new request');
          // Clear the pending request if it's too old or irrelevant
          await chatMemory.clearPendingRequest(userId);
        }
      }
    }

    // Step 2: Classify intent to determine which agent(s) to use
    console.log('[GrueneratorChat] Classifying intent for message:', message.substring(0, 100) + '...');
    const intentResult = await classifyIntent(message, enhancedContext, req.app.locals.aiWorkerPool);

    if (!intentResult.intents || intentResult.intents.length === 0) {
      throw new Error('Unable to classify intent from message');
    }

    console.log('[GrueneratorChat] Intent classified:', {
      isMultiIntent: intentResult.isMultiIntent,
      totalIntents: intentResult.intents.length,
      agents: intentResult.intents.map(i => i.agent),
      method: intentResult.method
    });

    // Create response wrapper to capture responses for memory
    const originalJson = res.json;
    let responseContent = null;
    let responseAgent = null;

    res.json = function(data) {
      // Capture response data for memory storage
      responseContent = data;
      responseAgent = intentResult.intents[0]?.agent || 'unknown';
      return originalJson.call(this, data);
    };

    // Step 3: Handle multi-intent vs single-intent processing
    if (intentResult.isMultiIntent) {
      console.log('[GrueneratorChat] Processing multi-intent request with', intentResult.intents.length, 'intents');
      await processMultiIntentRequest(intentResult.intents, req, res, {
        originalMessage: message,
        chatContext: enhancedContext,
        usePrivacyMode: usePrivacyMode || false,
        provider: provider || null,
        attachments: allAttachments || [],
        documentIds: documentIds || [],
        userId: userId
      });

      // Store multi-intent response in memory
      if (responseContent && responseContent.results) {
        const agentList = responseContent.results.map(r => r.agent).join(', ');
        await chatMemory.addMessage(userId, 'assistant', `Multi-intent response: ${agentList}`, 'multi');
      }
    } else {
      // Single intent - existing flow with minor adaptations
      const intent = intentResult.intents[0];
      console.log('[GrueneratorChat] Processing single intent:', intent.agent);

      await processSingleIntentRequest(intent, req, res, {
        originalMessage: message,
        chatContext: enhancedContext,
        usePrivacyMode: usePrivacyMode || false,
        provider: provider || null,
        attachments: allAttachments || [],
        documentIds: documentIds || [],
        userId: userId
      });

      // Store single intent response in memory (skip sharepic responses to avoid text content conflicts)
      if (responseContent && responseContent.content && !isSharepicIntent(intent.agent)) {
        const responseText = typeof responseContent.content === 'string'
          ? responseContent.content
          : responseContent.content.text || 'Response generated';
        await chatMemory.addMessage(userId, 'assistant', responseText, intent.agent);
      }
    }

  } catch (error) {
    console.error('[GrueneratorChat] Error processing chat request:', error);

    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error during chat processing',
      code: 'PROCESSING_ERROR',
      agent: null
    });
  }
}));

/**
 * Process multiple intents in parallel using Promise.all
 * @param {Array} intents - Array of detected intents
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Object} baseContext - Shared context for all intents
 */
async function processMultiIntentRequest(intents, req, res, baseContext) {
  console.log('[GrueneratorChat] Starting parallel processing of', intents.length, 'intents');

  // Create parallel processing tasks
  const processingTasks = intents.map(async (intent, index) => {
    try {
      console.log(`[GrueneratorChat] Processing intent ${index + 1}/${intents.length}: ${intent.agent}`);

      // Process each intent and return result
      const result = await processIntentAsync(intent, req, baseContext);

      return {
        success: true,
        agent: intent.agent,
        content: result,
        confidence: intent.confidence,
        processingIndex: index
      };
    } catch (error) {
      console.error(`[GrueneratorChat] Error processing ${intent.agent}:`, error.message);
      return {
        success: false,
        agent: intent.agent,
        error: error.message,
        confidence: intent.confidence,
        processingIndex: index
      };
    }
  });

  try {
    // Execute all intents in parallel
    console.log('[GrueneratorChat] Executing', processingTasks.length, 'tasks in parallel');
    const results = await Promise.all(processingTasks);

    // Calculate success metrics
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    console.log(`[GrueneratorChat] Multi-intent processing completed: ${successful.length} successful, ${failed.length} failed`);

    // Return multi-response format
    res.json({
      success: successful.length > 0, // Success if at least one intent succeeded
      multiResponse: true,
      results: results,
      metadata: {
        totalIntents: intents.length,
        successfulIntents: successful.length,
        failedIntents: failed.length,
        executionType: 'parallel',
        processingTime: Date.now() - req.startTime || null
      }
    });

  } catch (error) {
    console.error('[GrueneratorChat] Multi-intent processing failed:', error);
    return res.status(500).json({
      success: false,
      error: 'Multi-intent processing failed: ' + error.message,
      code: 'MULTI_INTENT_PROCESSING_ERROR'
    });
  }
}

/**
 * Process single intent (backward compatibility with existing flow)
 * @param {Object} intent - Single intent object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Object} baseContext - Base context for processing
 */
async function processSingleIntentRequest(intent, req, res, baseContext) {
  // Extract parameters for this intent
  const extractedParams = await extractParameters(baseContext.originalMessage, intent.agent, baseContext.chatContext);

  // Check if we have all required information with sufficient confidence
  const parameterAnalysis = analyzeParameterConfidence(extractedParams, intent.agent);

  // If required fields are missing, check if we should ask for information
  if (!parameterAnalysis.allRequiredPresent && parameterAnalysis.missingFields.length > 0) {
    console.log('[GrueneratorChat] Missing required fields, checking for information request');

    const userId = req.user?.id || `anon_${req.ip}`;
    const informationResult = await handleInformationRequest(
      userId,
      baseContext.originalMessage,
      intent.agent,
      extractedParams,
      baseContext,
      intent  // Pass complete classified intent
    );

    if (informationResult?.type === 'request') {
      console.log('[GrueneratorChat] Returning information request for missing fields');
      res.json(informationResult.data);

      // Store the information request in chat memory
      await chatMemory.addMessage(userId, 'assistant', informationResult.data.content.text, 'information_request');
      return;
    }
  }

  // Extract document knowledge if documents are present
  // Skip for image-based sharepics since images are handled directly by sharepic generation
  let documentKnowledge = null;
  if (baseContext.documentIds && baseContext.documentIds.length > 0) {
    // Check if this is an image-based sharepic intent
        // Check if this is an image-based sharepic intent
        const isImageBasedSharepic = intent.agent === 'zitat_with_image' ||
        intent.agent === 'dreizeilen_with_image' ||
        (baseContext.hasImageAttachment &&
         ['zitat', 'dreizeilen'].includes(intent.agent));
    if (!isImageBasedSharepic) {
      try {
        console.log(`[GrueneratorChat] Extracting document knowledge for intent: ${intent.agent}`);
        documentKnowledge = await documentQnAService.extractKnowledgeForIntent(
          baseContext.documentIds,
          intent,
          baseContext.originalMessage,
          req.user?.id || `anon_${req.ip}`
        );
        console.log(`[GrueneratorChat] Document knowledge extracted:`, documentKnowledge ? `${documentKnowledge.length} chars` : 'none');
      } catch (error) {
        console.error('[GrueneratorChat] Error extracting document knowledge:', error);
        // Continue without document knowledge rather than failing
      }
    } else {
      console.log(`[GrueneratorChat] Skipping document knowledge extraction for image-based sharepic: ${intent.agent}`);
    }
  }

  // Update request body for single intent processing
  req.body = {
    ...extractedParams,
    ...intent.params,
    agent: intent.agent,
    documentKnowledge: documentKnowledge,
    ...baseContext
  };

  // Route to appropriate processor (existing logic)
  const routeType = intent.route || intent.agent;

  console.log('[GrueneratorChat] Routing single intent to:', {
    routeType,
    agent: intent.agent,
    paramsCount: Object.keys(req.body).length
  });

  // Handle sharepic routing differently
  if (routeType === 'sharepic' || routeType.startsWith('sharepic_')) {
    await processSharepicRequest(intent, req, res, baseContext.userId);
  } else {
    // Use existing processGraphRequest for all other agents
    await processGraphRequest(routeType, req, res);
  }
}

/**
 * Process single intent asynchronously and return promise with result
 * @param {Object} intent - Intent to process
 * @param {Object} req - Express request object
 * @param {Object} baseContext - Shared context
 * @returns {Promise} Promise that resolves with the processing result
 */
async function processIntentAsync(intent, req, baseContext) {
  return new Promise(async (resolve, reject) => {
    try {
      // Extract parameters for this specific intent
      const extractedParams = await extractParameters(baseContext.originalMessage, intent.agent, baseContext.chatContext);

      // Extract document knowledge if documents are present
      let documentKnowledge = null;
      if (baseContext.documentIds && baseContext.documentIds.length > 0) {
        try {
          console.log(`[GrueneratorChat] Extracting document knowledge for async intent: ${intent.agent}`);
          documentKnowledge = await documentQnAService.extractKnowledgeForIntent(
            baseContext.documentIds,
            intent,
            baseContext.originalMessage,
            req.user?.id || `anon_${req.ip}`
          );
          console.log(`[GrueneratorChat] Async document knowledge extracted:`, documentKnowledge ? `${documentKnowledge.length} chars` : 'none');
        } catch (error) {
          console.error('[GrueneratorChat] Error extracting async document knowledge:', error);
          // Continue without document knowledge rather than failing
        }
      }

      // Create a copy of the request for this intent, preserving Express properties
      const intentReq = {
        ...req,
        app: req.app,           // Preserve app with locals.aiWorkerPool
        headers: req.headers,   // Preserve headers
        user: req.user,         // Preserve user
        correlationId: req.correlationId, // Preserve correlation ID
        body: {
          ...extractedParams,
          ...intent.params,
          agent: intent.agent,
          documentKnowledge: documentKnowledge,
          ...baseContext
        },
        startTime: Date.now() // For timing metrics
      };

      // Create production response collector to capture result
      const responseCollector = {
        statusCode: 200,
        responseData: null,

        status: function(code) {
          this.statusCode = code;
          return this;
        },

        json: function(data) {
          this.responseData = data;
          if (this.statusCode >= 400) {
            reject(new Error(`Processing failed: ${data.error || 'Unknown error'}`));
          } else {
            resolve(data);
          }
        },

        send: function(data) {
          this.responseData = data;
          resolve(data);
        }
      };

      // Route to appropriate processor
      const routeType = intent.route || intent.agent;

      console.log(`[GrueneratorChat] Async processing ${intent.agent} via ${routeType}`);

      // Handle different route types
      if (routeType === 'sharepic' || routeType.startsWith('sharepic_')) {
        await processSharepicRequest(intent, intentReq, responseCollector, baseContext.userId);
      } else {
        await processGraphRequest(routeType, intentReq, responseCollector);
      }

    } catch (error) {
      console.error(`[GrueneratorChat] Async processing error for ${intent.agent}:`, error);
      reject(error);
    }
  });
}

/**
 * Handle sharepic-specific routing
 * Routes to sharepic_claude.json with appropriate type parameter
 */
async function processSharepicRequest(intentResult, req, res, userId = null) {
  console.log('[GrueneratorChat] Processing sharepic request:', {
    agent: intentResult.agent,
    sharepicType: intentResult.params?.type
  });

  // Map sharepic agent to appropriate type for sharepic_claude.json
  const sharepicTypeMapping = {
    'zitat': 'zitat_pure',
    'quote': 'zitat_pure',
    'zitat_with_image': 'zitat', // Handle image-based zitat
    'info': 'info',
    'headline': 'headline',
    'dreizeilen': 'dreizeilen'
  };

  const sharepicType = sharepicTypeMapping[intentResult.agent] ||
                      intentResult.params?.type ||
                      'dreizeilen'; // Default fallback

  // Update request body with sharepic-specific parameters
  req.body = {
    ...req.body,
    type: sharepicType,
    sharepicType: sharepicType
  };

  console.log('[GrueneratorChat] Routing sharepic with type:', sharepicType);

  if (sharepicType === 'info' || sharepicType === 'zitat_pure' || sharepicType === 'zitat') {
    try {
      // Extract parameters for the sharepic type, preserving existing name parameter
      const newExtractedParams = await extractParameters(
        req.body.message || req.body.originalMessage || '',
        (sharepicType === 'zitat_pure' || sharepicType === 'zitat') ? 'zitat' : sharepicType,
        req.body.chatContext || {}
      );

      // Preserve existing name parameter from first extraction
      const extractedParams = {
        ...newExtractedParams,
        name: req.body.name || newExtractedParams.name
      };

      // Check for missing information (especially for quotes)
      const resolvedUserId = userId || req.user?.id || `anon_${req.ip}`;
      const sharepicIntent = {
        agent: (sharepicType === 'zitat_pure' || sharepicType === 'zitat') ? 'zitat' : sharepicType,
        route: 'sharepic',
        params: { type: sharepicType },
        confidence: 0.9
      };

      const informationResult = await handleInformationRequest(
        resolvedUserId,
        req.body.message || req.body.originalMessage || '',
        sharepicIntent.agent,
        extractedParams,
        {
          agent: sharepicIntent.agent,
          message: req.body.message || req.body.originalMessage || '',
          chatContext: req.body.chatContext || {},
          usePrivacyMode: req.body.usePrivacyMode || false,
          provider: req.body.provider || null,
          attachments: req.body.attachments || [],
          documentIds: req.body.documentIds || [],
          // Include all extracted parameters so they're preserved in pending request
          ...extractedParams
        },
        sharepicIntent  // Pass complete classified intent
      );

      // If information is missing, return the request
      if (informationResult && informationResult.type === 'request') {
        res.json(informationResult.data);
        return;
      }

      // If we have a completion, use the updated request data
      let finalRequestBody = req.body;
      if (informationResult && informationResult.type === 'completion') {
        finalRequestBody = {
          ...req.body,
          ...informationResult.data
        };
      }

      const sharepicResponse = await generateSharepicForChat(req, sharepicType, finalRequestBody);
      res.json(sharepicResponse);
      return;
    } catch (error) {
      console.error('[GrueneratorChat] Sharepic generation error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Fehler bei der Sharepic-Erstellung',
        code: 'SHAREPIC_GENERATION_FAILED'
      });
      return;
    }
  }

  // Fallback to existing processor for unsupported sharepic types
  await processGraphRequest('sharepic_claude', req, res);
}

/**
 * Clear all user data for chat reset
 */
router.delete('/clear', withErrorHandler(async (req, res) => {
  const userId = req.user?.id || `anon_${req.ip}`;

  console.log(`[GrueneratorChat] Clearing all data for user: ${userId}`);

  try {
    let results = {
      conversationCleared: false,
      pendingRequestCleared: false,
      documentsCleared: false
    };

    // Clear chat memory and conversation history
    results.conversationCleared = await chatMemory.clearConversation(userId);

    // Clear any pending information requests
    await chatMemory.clearPendingRequest(userId);
    results.pendingRequestCleared = true;

    // Clear stored documents and knowledge
    results.documentsCleared = await documentQnAService.clearUserDocuments(userId);

    console.log(`[GrueneratorChat] Clear operation completed for ${userId}:`, results);

    res.json({
      success: true,
      message: 'All user data cleared successfully',
      details: results
    });

  } catch (error) {
    console.error('[GrueneratorChat] Error clearing user data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear user data',
      code: 'CLEAR_DATA_ERROR',
      details: error.message
    });
  }
}));

/**
 * Helper function to check if an intent is sharepic-related
 * @param {string} agent - The agent/intent name
 * @returns {boolean} True if the intent is sharepic-related
 */
function isSharepicIntent(agent) {
  return agent === 'zitat' ||
         agent === 'quote' ||
         agent === 'info' ||
         agent === 'headline' ||
         agent === 'dreizeilen' ||
         agent === 'sharepic' ||
         agent?.startsWith('sharepic_');
}

/**
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'GrueneratorChat',
    timestamp: new Date().toISOString(),
    status: 'healthy'
  });
});

export default router;
