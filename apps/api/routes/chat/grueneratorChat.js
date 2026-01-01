import express from 'express';
import { createAuthenticatedRouter } from '../../utils/createAuthenticatedRouter.js';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from '../../utils/logger.js';
const log = createLogger('grueneratorChat');


// Get __dirname equivalent for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use createRequire for CommonJS modules
const require = createRequire(import.meta.url);
import { classifyIntent, isQuestionMessage } from '../../agents/chat/intentClassifier.js';
import { extractParameters, analyzeParameterConfidence } from '../../agents/chat/parameterExtractor.js';
import { handleInformationRequest, isWebSearchConfirmation, getWebSearchQuestion } from '../../agents/chat/informationRequestHandler.js';
import { searxngService as searxngWebSearchService } from '../../services/search/index.js';
import { processGraphRequest } from '../../agents/langgraph/promptProcessor.js';
import { withErrorHandler } from '../../utils/errorHandler.js';
import { generateSharepicForChat } from './services/sharepicGenerationService.js';
import { generateImagineForChat } from './services/imagineGenerationService.js';
import * as chatMemory from '../../services/chatMemoryService.js';
import { trimMessagesToTokenLimit } from '../../utils/tokenCounter.js';
import DocumentQnAService from '../../services/documentQnAService.js';
import SharepicImageManager from '../../services/sharepicImageManager.js';
import redisClient from '../../utils/redisClient.js';
import mistralClient from '../../workers/mistralClient.js';
import crypto from 'crypto';
import { localizePlaceholders } from '../../utils/localizationHelper.js';
import { detectSimpleMessage, generateSimpleResponse } from '../../utils/simpleMessageDetector.js';

// Configuration constants - centralized for easy maintenance
const CONFIG = {
  // Intent classification
  LOW_CONFIDENCE_THRESHOLD: 0.3,

  // Conversation limits
  MAX_HISTORY_MESSAGES: 10,
  TOKEN_LIMIT: 6000,

  // Timeouts (ms)
  MULTI_INTENT_TIMEOUT: 30000,
  AI_REQUEST_TIMEOUT: 60000,

  // Document limits
  MAX_RECENT_DOCUMENTS: 10,

  // Text validation
  MIN_DETAILS_LENGTH: 10,
  MAX_DETAILS_LENGTH: 200,
  MAX_FALLBACK_LENGTH: 300
};

/**
 * Create standardized error response
 * @param {Object} res - Express response object
 * @param {string} code - Error code (e.g., 'VALIDATION_ERROR')
 * @param {string} message - User-friendly message
 * @param {number} status - HTTP status code (default 500)
 * @param {Object} details - Optional additional details
 * @returns {Object} Express response
 */
function createErrorResponse(res, code, message, status = 500, details = null) {
  log.error(`[GrueneratorChat] ${code}: ${message}`, details || '');
  return res.status(status).json({
    success: false,
    error: message,
    code,
    ...(details && { details })
  });
}

// Create authenticated router
const router = createAuthenticatedRouter();

// Initialize DocumentQnA service
const documentQnAService = new DocumentQnAService(redisClient, mistralClient);

// Cache for conversation config
let conversationConfigCache = null;

/**
 * Load conversation config from JSON file (with caching)
 */
function loadConversationConfig() {
  if (conversationConfigCache) return conversationConfigCache;

  const configPath = path.join(__dirname, '../../prompts/conversation.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  conversationConfigCache = config;
  return config;
}

/**
 * Build messages array from conversation history
 */
function buildConversationMessages(history, currentMessage) {
  const messages = [];

  // Add recent history (limited to prevent context overflow)
  if (history && history.length > 0) {
    const recentHistory = history.slice(-CONFIG.MAX_HISTORY_MESSAGES);
    for (const msg of recentHistory) {
      messages.push({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
      });
    }
  }

  // Add current message
  messages.push({ role: 'user', content: currentMessage });

  return messages;
}

/**
 * Process conversation requests - lightweight handler for general chat
 * @param {Object} intentResult - Classification result with subIntent
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Object} baseContext - Context including message, history, userId
 */
async function processConversationRequest(intentResult, req, res, baseContext) {
  const { originalMessage, chatContext, userId, subIntent } = baseContext;

  log.debug('[GrueneratorChat] Processing conversation request:', {
    subIntent,
    messageLength: originalMessage?.length,
    hasHistory: chatContext?.messageHistory?.length > 0
  });

  try {
    // Load conversation config
    const conversationConfig = loadConversationConfig();
    const subIntentConfig = conversationConfig.subIntents[subIntent] || conversationConfig.subIntents.general;

    // Determine if pro mode should be used for complex tasks
    const useProMode = subIntentConfig.useProMode || false;

    // Build system prompt with Green identity (localized)
    const systemPrompt = localizePlaceholders(conversationConfig.systemRole, req.user?.locale || 'de-DE');

    // Build user message with sub-intent instruction
    let userMessage = originalMessage;
    if (subIntentConfig.instruction) {
      userMessage = `${subIntentConfig.instruction}\n\n${originalMessage}`;
    }

    // Build messages array with conversation history
    const messages = buildConversationMessages(chatContext?.messageHistory, userMessage);

    // Determine options based on mode
    const options = useProMode ? conversationConfig.proModeOptions : conversationConfig.options;

    log.debug('[GrueneratorChat] Calling AI for conversation:', {
      subIntent,
      useProMode,
      messageCount: messages.length,
      temperature: options.temperature,
      maxTokens: options.max_tokens
    });

    const result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'conversation',
      systemPrompt: systemPrompt,
      messages: messages,
      options: {
        ...options,
        useProMode: useProMode
      }
    }, req);

    if (!result.success) {
      throw new Error(result.error || 'AI request failed');
    }

    // Store in chat memory
    await chatMemory.addMessage(userId, 'assistant', result.content, 'conversation');

    log.debug('[GrueneratorChat] Conversation response generated:', {
      subIntent,
      responseLength: result.content?.length,
      useProMode
    });

    return res.json({
      success: true,
      agent: 'conversation',
      subIntent: subIntent,
      content: {
        text: result.content,
        type: 'conversation'
      },
      metadata: {
        useProMode: useProMode,
        subIntent: subIntent
      }
    });
  } catch (error) {
    return createErrorResponse(res, 'CONVERSATION_ERROR',
      'Konversationsverarbeitung fehlgeschlagen. Bitte versuche es erneut.',
      500, { originalError: error.message });
  }
}

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

  log.debug('[GrueneratorChat] Processing request:', {
    messageLength: message?.length || 0,
    hasContext: Object.keys(context).length > 0,
    hasAttachments: attachments?.length || 0,
    usePrivacyMode,
    provider
  });

  if (attachments && attachments.length > 0) {
    log.debug('[GrueneratorChat] Request contains attachments:', attachments.map(att => ({
      name: att.name,
      type: att.type,
      size: att.size,
      hasData: !!att.data
    })));
  } else {
    log.debug('[GrueneratorChat] Request contains no attachments');
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
    log.debug('[GrueneratorChat] Processing for user:', userId);

    // Store user message in memory
    await chatMemory.addMessage(userId, 'user', message);

    // Retrieve conversation history for context
    const conversation = await chatMemory.getConversation(userId);
    const trimmedHistory = trimMessagesToTokenLimit(conversation.messages, CONFIG.TOKEN_LIMIT);

    // Check for simple conversational messages (bypass AI for instant response)
    const simpleCheck = detectSimpleMessage(message);
    if (simpleCheck.isSimple) {
      const locale = req.user?.locale || 'de-DE';
      const response = generateSimpleResponse(simpleCheck.category, locale);

      return res.json({
        success: true,
        agent: 'simple_response',
        content: { text: response }
      });
    }

    // Step 1.5: Separate attachments by type and handle appropriately
    const requestId = crypto.randomBytes(8).toString('hex');
    let documentIds = [];
    let sharepicImages = [];

    if (attachments && attachments.length > 0) {
      log.debug(`[GrueneratorChat] Processing ${attachments.length} attachments`);

      // Separate attachments by type
      const textAttachments = [];
      const imageAttachments = [];

      for (const attachment of attachments) {
        if (attachment.type && attachment.type.startsWith('image/')) {
          imageAttachments.push(attachment);
        } else {
          // Text documents, PDFs, etc. for knowledge extraction
          textAttachments.push(attachment);
        }
      }

      log.debug(`[GrueneratorChat] Separated: ${textAttachments.length} text documents, ${imageAttachments.length} images`);

      // Store text documents for knowledge extraction via DocumentQnAService
      if (textAttachments.length > 0) {
        try {
          documentIds = await documentQnAService.storeAttachments(userId, textAttachments);
          log.debug(`[GrueneratorChat] Successfully stored ${textAttachments.length} text documents with IDs:`, documentIds);
        } catch (error) {
          log.error('[GrueneratorChat] Error storing text attachments:', error);
          // Continue without documents rather than failing the request
        }
      }

      // Store images temporarily for sharepic generation via SharepicImageManager
      if (imageAttachments.length > 0) {
        try {
          const sharepicImageManager = req.app.locals.sharepicImageManager;
          if (!sharepicImageManager) {
            log.error('[GrueneratorChat] SharepicImageManager not initialized');
          } else {
            for (const img of imageAttachments) {
              await sharepicImageManager.storeForRequest(requestId, userId, img);
            }
            sharepicImages = imageAttachments;
            log.debug(`[GrueneratorChat] Stored ${imageAttachments.length} images temporarily for sharepic generation`);
          }
        } catch (error) {
          log.error('[GrueneratorChat] Error storing sharepic images:', error);
          // Continue without images rather than failing the request
        }
      }
    } else {
      log.debug('[GrueneratorChat] No attachments to process');
    }

    // Step 1.6: Retrieve recent documents from Redis (EXCLUDE IMAGES for context)
    let recentDocuments = [];
    try {
      const recentDocIds = await documentQnAService.getRecentDocuments(userId, CONFIG.MAX_RECENT_DOCUMENTS);
      log.debug(`[GrueneratorChat] Found ${recentDocIds.length} recent documents for user ${userId}`);

      if (recentDocIds.length > 0) {
        log.debug('[GrueneratorChat] Recent document IDs:', recentDocIds);

        for (const docId of recentDocIds) {
          try {
            if (!docId.includes(userId)) {
              log.warn(`[GrueneratorChat] Access denied to document ${docId} for user ${userId}`);
              continue;
            }

            const docData = await documentQnAService.redis.get(docId);
            if (docData) {
              const document = JSON.parse(docData);

              // IMPORTANT: Skip images from context retrieval
              // Images should only be used explicitly for current sharepic generation
              if (document.type && document.type.startsWith('image/')) {
                log.debug(`[GrueneratorChat] Skipping image document: ${document.name} (${document.type})`);
                continue;
              }

              recentDocuments.push(document);
              log.debug(`[GrueneratorChat] Retrieved recent document: ${document.name} (${document.type})`);
            } else {
              log.warn(`[GrueneratorChat] Document ${docId} not found in Redis`);
            }
          } catch (error) {
            log.error(`[GrueneratorChat] Error retrieving document ${docId}:`, error);
          }
        }
      }
    } catch (error) {
      log.error('[GrueneratorChat] Error retrieving recent documents:', error);
      // Continue without recent documents rather than failing the request
    }

    // Combine attachments from request body and recent documents
    // Note: recentDocuments now excludes images, so allAttachments won't have stale images
    const allAttachments = [...(attachments || []), ...recentDocuments];
    log.debug('[GrueneratorChat] Combined attachments:', {
      fromRequest: attachments?.length || 0,
      fromRecent: recentDocuments.length,
      total: allAttachments.length,
      currentRequestImages: sharepicImages.length
    });

    // Enhance context with conversation history and document IDs
    // Check for images in current request only (not from old attachments)
    const hasImageAttachment = sharepicImages.length > 0;

    log.debug('[GrueneratorChat] Image detection result:', {
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
      hasImageAttachment: hasImageAttachment,
      sharepicRequestId: requestId  // Pass request ID for image retrieval
    };

    log.debug('[GrueneratorChat] Using conversation context:', {
      historyMessages: trimmedHistory.length,
      lastAgent: conversation.metadata?.lastAgent,
      documentsStored: documentIds.length,
      recentDocumentsRetrieved: recentDocuments.length,
      totalAttachments: allAttachments.length,
      hasImageAttachment: hasImageAttachment
    });

    // Step 1.8: Check for pending information requests first (with race condition prevention)
    const pendingLockAcquired = await chatMemory.acquirePendingLock(userId);
    let pendingRequest = null;

    if (pendingLockAcquired) {
      try {
        pendingRequest = await chatMemory.getPendingRequest(userId);
      } catch (lockError) {
        log.warn('[GrueneratorChat] Error while holding pending lock:', lockError.message);
      } finally {
        await chatMemory.releasePendingLock(userId);
      }
    } else {
      log.warn('[GrueneratorChat] Could not acquire pending lock, skipping pending check for user:', userId);
    }

    // Handle web search confirmation
    if (pendingRequest && pendingRequest.type === 'websearch_confirmation') {
      log.debug('[GrueneratorChat] Found pending websearch confirmation');
      const confirmed = isWebSearchConfirmation(message);
      await chatMemory.clearPendingRequest(userId);

      if (confirmed) {
        log.debug('[GrueneratorChat] Web search confirmed, executing search');
        try {
          const searchResults = await searxngWebSearchService.performWebSearch(
            pendingRequest.originalQuery,
            { maxResults: 8, language: 'de-DE' }
          );

          const resultsWithSummary = await searxngWebSearchService.generateAISummary(
            searchResults,
            pendingRequest.originalQuery,
            req.app.locals.aiWorkerPool,
            {},
            req
          );

          const responseText = resultsWithSummary.summary?.text || 'Leider konnte ich keine relevanten Informationen finden.';
          await chatMemory.addMessage(userId, 'assistant', responseText, 'websearch');

          return res.json({
            success: true,
            agent: 'websearch',
            content: {
              text: responseText,
              type: 'websearch_answer'
            },
            sources: resultsWithSummary.results?.slice(0, 5).map(r => ({
              title: r.title,
              url: r.url,
              domain: r.domain
            })),
            metadata: {
              searchQuery: pendingRequest.originalQuery,
              resultCount: searchResults.resultCount || 0,
              generated: resultsWithSummary.summary?.generated || false
            }
          });
        } catch (error) {
          log.error('[GrueneratorChat] Web search failed:', error);
          const errorText = 'Entschuldigung, bei der Websuche ist ein Fehler aufgetreten. Kann ich dir anders helfen?';
          await chatMemory.addMessage(userId, 'assistant', errorText, 'websearch_error');
          return res.json({
            success: true,
            agent: 'universal',
            content: { text: errorText, type: 'text' }
          });
        }
      } else {
        log.debug('[GrueneratorChat] Web search declined');
        const declineText = 'Alles klar! Kann ich dir bei etwas anderem helfen?';
        await chatMemory.addMessage(userId, 'assistant', declineText, 'websearch_declined');
        return res.json({
          success: true,
          agent: 'universal',
          content: { text: declineText, type: 'text' }
        });
      }
    }

    if (pendingRequest && pendingRequest.type === 'missing_information') {
      log.debug('[GrueneratorChat] Found pending information request, checking if this is a new command or answer');

      // Check if this looks like a new command rather than an answer
      const commandKeywords = ['erstelle', 'mache', 'schreibe', 'generiere', 'sharepic', 'zitat'];
      const isNewCommand = commandKeywords.some(keyword =>
        message.toLowerCase().includes(keyword)
      );

      if (isNewCommand) {
        log.debug('[GrueneratorChat] Detected new command, clearing old pending request');
        await chatMemory.clearPendingRequest(userId);
        // Continue with normal intent classification below
      } else {
        log.debug('[GrueneratorChat] Treating as answer to pending request');

        // Try to extract the requested information from the current message
        const { extractRequestedInformation, completePendingRequest } = await import('../../agents/chat/informationRequestHandler.js');
        const extractedInfo = extractRequestedInformation(message, pendingRequest);

        if (extractedInfo) {
        log.debug('[GrueneratorChat] Information extracted, completing pending request');

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

        // Check if we have image attachments and upgrade agent accordingly
        const hasImageAttachment = completedRequest.attachments &&
          Array.isArray(completedRequest.attachments) &&
          completedRequest.attachments.some(att => att.type && att.type.startsWith('image/'));

        let finalAgent = completedRequest.agent;
        if (completedRequest.agent === 'zitat' && hasImageAttachment) {
          log.debug('[GrueneratorChat] Upgrading completed request agent from zitat to zitat_with_image due to image attachment');
          finalAgent = 'zitat_with_image';
        } else if (completedRequest.agent === 'dreizeilen' && hasImageAttachment) {
          log.debug('[GrueneratorChat] Keeping completed request agent as dreizeilen with image attachment');
          // dreizeilen already handles images correctly
        }

        log.debug('[GrueneratorChat] Processing completed request:', {
          originalAgent: completedRequest.agent,
          finalAgent: finalAgent,
          hasImageAttachment: hasImageAttachment,
          attachmentCount: completedRequest.attachments?.length || 0
        });

        // Process the completed request as a sharepic
        if (finalAgent === 'zitat' || finalAgent === 'zitat_with_image') {
          try {
            // Determine correct sharepic type based on final agent
            const sharepicType = finalAgent === 'zitat_with_image' ? 'zitat' : 'zitat_pure';
            log.debug('[GrueneratorChat] Using sharepic type for completed request:', sharepicType);

            Object.assign(req.body, completedRequestContext, {
              count: 1,
              preserveName: true
            });
            const sharepicResponse = await generateSharepicForChat(req, sharepicType, req.body);

            // Don't store sharepic responses as chat messages to avoid text content conflicts

            res.json(sharepicResponse);
            return;
          } catch (error) {
            createErrorResponse(res, 'COMPLETION_ERROR',
              'Fehler beim Erstellen des Sharepics mit den bereitgestellten Informationen.',
              500, { originalError: error.message });
            return;
          }
        }

        // Handle dreizeilen completion
        if (finalAgent === 'dreizeilen') {
          try {
            log.debug('[GrueneratorChat] Processing completed dreizeilen request');
            Object.assign(req.body, completedRequestContext, {
              count: 1,
              preserveName: true
            });
            const sharepicResponse = await generateSharepicForChat(req, 'dreizeilen', req.body);

            res.json(sharepicResponse);
            return;
          } catch (error) {
            createErrorResponse(res, 'COMPLETION_ERROR',
              'Fehler beim Erstellen des Dreizeilen-Sharepics.',
              500, { originalError: error.message });
            return;
          }
        }

        // Handle cases where agent is still undefined or unrecognized
        if (!finalAgent || finalAgent === 'undefined') {
          log.debug('[GrueneratorChat] No valid agent in completed request, clearing and treating as new request');
          await chatMemory.clearPendingRequest(userId);
        } else {
          createErrorResponse(res, 'UNHANDLED_AGENT_TYPE',
            `Handler für Agent "${finalAgent}" nicht implementiert.`,
            500, { agent: finalAgent });
          return;
        }
        } else {
          log.debug('[GrueneratorChat] Could not extract requested information, will treat as new request');
          // Clear the pending request if it's too old or irrelevant
          await chatMemory.clearPendingRequest(userId);
        }
      }
    }

    // Step 2: Classify intent to determine which agent(s) to use
    log.debug('[GrueneratorChat] Classifying intent for message:', message.substring(0, 100) + '...');
    const intentResult = await classifyIntent(message, enhancedContext, req.app.locals.aiWorkerPool);

    if (!intentResult.intents || intentResult.intents.length === 0) {
      throw new Error('Unable to classify intent from message');
    }

    log.debug('[GrueneratorChat] Intent classified:', {
      isMultiIntent: intentResult.isMultiIntent,
      totalIntents: intentResult.intents.length,
      agents: intentResult.intents.map(i => i.agent),
      method: intentResult.method,
      hasImageAttachment: enhancedContext.hasImageAttachment,
      imageUpgradeApplied: intentResult.intents.some(i => i.agent === 'zitat_with_image')
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

    // Step 3: Handle conversation requests separately (lightweight processing)
    if (intentResult.requestType === 'conversation') {
      log.debug('[GrueneratorChat] Routing to conversation handler, subIntent:', intentResult.subIntent);
      return await processConversationRequest(intentResult, req, res, {
        originalMessage: message,
        chatContext: enhancedContext,
        userId: userId,
        subIntent: intentResult.subIntent || 'general'
      });
    }

    // Step 4: Handle multi-intent vs single-intent processing
    if (intentResult.isMultiIntent) {
      log.debug('[GrueneratorChat] Processing multi-intent request with', intentResult.intents.length, 'intents');
      await processMultiIntentRequest(intentResult.intents, req, res, {
        originalMessage: message,
        chatContext: { ...enhancedContext, requestType: intentResult.requestType },
        usePrivacyMode: usePrivacyMode || false,
        provider: provider || null,
        attachments: allAttachments || [],
        documentIds: documentIds || [],
        userId: userId,
        requestType: intentResult.requestType
      });

      // Store multi-intent response in memory
      if (responseContent && responseContent.results) {
        const agentList = responseContent.results.map(r => r.agent).join(', ');
        await chatMemory.addMessage(userId, 'assistant', `Multi-intent response: ${agentList}`, 'multi');
      }
    } else {
      // Single intent - existing flow with minor adaptations
      const intent = {
        ...intentResult.intents[0],
        requestType: intentResult.requestType  // Propagate requestType to intent
      };
      log.debug('[GrueneratorChat] Processing single intent:', intent.agent, 'requestType:', intent.requestType);

      await processSingleIntentRequest(intent, req, res, {
        originalMessage: message,
        chatContext: { ...enhancedContext, requestType: intentResult.requestType },
        usePrivacyMode: usePrivacyMode || false,
        provider: provider || null,
        attachments: allAttachments || [],
        documentIds: documentIds || [],
        userId: userId,
        requestType: intentResult.requestType
      });

      // Store single intent response in memory (skip sharepic and imagine responses to avoid text content conflicts)
      if (responseContent && responseContent.content && !isSharepicIntent(intent.agent) && !isImagineIntent(intent.agent)) {
        const responseText = typeof responseContent.content === 'string'
          ? responseContent.content
          : responseContent.content.text || 'Response generated';
        await chatMemory.addMessage(userId, 'assistant', responseText, intent.agent);
      }
    }

  } catch (error) {
    return createErrorResponse(res, 'PROCESSING_ERROR',
      'Bei der Verarbeitung ist ein Fehler aufgetreten. Bitte versuche es erneut.',
      500, { originalError: error.message });
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
  log.debug('[GrueneratorChat] Starting parallel processing of', intents.length, 'intents');

  // Create parallel processing tasks
  const processingTasks = intents.map(async (intent, index) => {
    try {
      log.debug(`[GrueneratorChat] Processing intent ${index + 1}/${intents.length}: ${intent.agent}`);

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
      log.error(`[GrueneratorChat] Error processing ${intent.agent}:`, error.message);
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
    // Execute all intents in parallel with timeout protection
    log.debug('[GrueneratorChat] Executing', processingTasks.length, 'tasks in parallel');
    const results = await Promise.race([
      Promise.all(processingTasks),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Multi-intent processing timeout after ${CONFIG.MULTI_INTENT_TIMEOUT / 1000}s`)), CONFIG.MULTI_INTENT_TIMEOUT)
      )
    ]);

    // Calculate success metrics
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    log.debug(`[GrueneratorChat] Multi-intent processing completed: ${successful.length} successful, ${failed.length} failed`);

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
    return createErrorResponse(res, 'MULTI_INTENT_PROCESSING_ERROR',
      'Mehrfachverarbeitung fehlgeschlagen. Bitte versuche es erneut.',
      500, { originalError: error.message });
  }
}

/**
 * Build search query from user message for automatic document research
 * @param {string} message - Original user message
 * @param {object} extractedParams - Parameters extracted by parameterExtractor
 * @param {object} intent - Classified intent
 * @returns {string} Search query for vector search
 */
function buildAutoSearchQuery(message, extractedParams, intent) {
  // Priority 1: Use extracted thema if meaningful
  if (extractedParams.thema &&
      extractedParams.thema !== 'Grüne Politik' &&
      extractedParams.thema !== 'Politisches Thema') {
    return extractedParams.thema;
  }

  // Priority 2: Use extracted idee (for antrag agents)
  if (extractedParams.idee) {
    return extractedParams.idee;
  }

  // Priority 3: Use details if focused
  if (extractedParams.details &&
      extractedParams.details.length > CONFIG.MIN_DETAILS_LENGTH &&
      extractedParams.details.length < CONFIG.MAX_DETAILS_LENGTH) {
    return extractedParams.details;
  }

  // Priority 4: Clean the message - remove common command phrases
  const cleanedMessage = message
    .replace(/(?:erstelle|mache|schreibe|generiere)\s+(?:mir|uns|einen?|eine?|das|die|der)/gi, '')
    .replace(/(?:bitte|danke|könntest du|kannst du)/gi, '')
    .replace(/(?:post|beitrag|pressemitteilung|antrag|zitat|sharepic)/gi, '')
    .replace(/(?:für|über|zum thema|bezüglich)/gi, '')
    .trim();

  return cleanedMessage.length > CONFIG.MIN_DETAILS_LENGTH && cleanedMessage.length < CONFIG.MAX_FALLBACK_LENGTH
    ? cleanedMessage
    : cleanedMessage.substring(0, CONFIG.MAX_FALLBACK_LENGTH);
}

/**
 * Process single intent (backward compatibility with existing flow)
 * @param {Object} intent - Single intent object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Object} baseContext - Base context for processing
 */
async function processSingleIntentRequest(intent, req, res, baseContext) {
  // Get requestType from intent (set by AI classification)
  const requestType = intent.requestType || baseContext.chatContext?.requestType || 'content_creation';

  log.debug('[GrueneratorChat] Processing single intent with requestType:', requestType);

  // Check for low-confidence universal fallback with a question - offer web search
  if (intent.agent === 'universal' &&
      intent.confidence <= CONFIG.LOW_CONFIDENCE_THRESHOLD &&
      isQuestionMessage(baseContext.originalMessage)) {

    log.debug('[GrueneratorChat] Low-confidence question detected, offering web search');
    const userId = req.user?.id || `anon_${req.ip}`;

    // Store pending web search request
    await chatMemory.setPendingRequest(userId, {
      type: 'websearch_confirmation',
      originalQuery: baseContext.originalMessage,
      timestamp: Date.now()
    });

    const question = getWebSearchQuestion();
    await chatMemory.addMessage(userId, 'assistant', question, 'websearch_offer');

    return res.json({
      success: true,
      agent: 'websearch_offer',
      content: {
        text: question,
        type: 'question'
      },
      requiresResponse: true
    });
  }

  // Extract parameters for this intent
  const extractedParams = await extractParameters(baseContext.originalMessage, intent.agent, baseContext.chatContext);

  // Check if we have all required information with sufficient confidence
  const parameterAnalysis = analyzeParameterConfidence(extractedParams, intent.agent);

  // If required fields are missing, check if we should ask for information
  if (!parameterAnalysis.allRequiredPresent && parameterAnalysis.missingFields.length > 0) {
    log.debug('[GrueneratorChat] Missing required fields, checking for information request');

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
      log.debug('[GrueneratorChat] Returning information request for missing fields');
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
        log.debug(`[GrueneratorChat] Extracting document knowledge for intent: ${intent.agent}`);
        documentKnowledge = await documentQnAService.extractKnowledgeForIntent(
          baseContext.documentIds,
          intent,
          baseContext.originalMessage,
          req.user?.id || `anon_${req.ip}`
        );
        log.debug(`[GrueneratorChat] Document knowledge extracted:`, documentKnowledge ? `${documentKnowledge.length} chars` : 'none');
      } catch (error) {
        log.error('[GrueneratorChat] Error extracting document knowledge:', error);
        // Continue without document knowledge rather than failing
      }
    } else {
      log.debug(`[GrueneratorChat] Skipping document knowledge extraction for image-based sharepic: ${intent.agent}`);
    }
  }

  // Determine if auto-search should be enabled based on AI-classified requestType
  // conversation → NO document search (general knowledge questions)
  // document_query → YES document search (questions about user's documents)
  // content_creation → YES document search (creating content)
  const enableAutoSearch = requestType !== 'conversation';

  if (!enableAutoSearch) {
    log.debug('[GrueneratorChat] Conversation request - skipping document search');
  }

  const autoSearchQuery = enableAutoSearch
    ? buildAutoSearchQuery(baseContext.originalMessage, extractedParams, intent)
    : null;

  // Update request body for single intent processing
  Object.assign(req.body, extractedParams, intent.params, {
    agent: intent.agent,
    documentKnowledge: documentKnowledge
  }, baseContext, {
    useAutomaticSearch: enableAutoSearch,
    searchQuery: autoSearchQuery
  });

  // Route to appropriate processor (existing logic)
  const routeType = intent.route || intent.agent;

  log.debug('[GrueneratorChat] Routing single intent to:', {
    routeType,
    agent: intent.agent,
    platforms: req.body.platforms || 'none',
    paramsCount: Object.keys(req.body).length
  });

  // Handle imagine routing
  if (routeType === 'imagine') {
    await processImagineRequest(intent, req, res, baseContext.userId);
  }
  // Handle sharepic routing differently
  else if (routeType === 'sharepic' || routeType.startsWith('sharepic_')) {
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
      // Get requestType from baseContext (set by AI classification)
      const requestType = baseContext.requestType || 'content_creation';

      // Extract parameters for this specific intent
      const extractedParams = await extractParameters(baseContext.originalMessage, intent.agent, baseContext.chatContext);

      // Extract document knowledge if documents are present
      let documentKnowledge = null;
      if (baseContext.documentIds && baseContext.documentIds.length > 0) {
        try {
          log.debug(`[GrueneratorChat] Extracting document knowledge for async intent: ${intent.agent}`);
          documentKnowledge = await documentQnAService.extractKnowledgeForIntent(
            baseContext.documentIds,
            intent,
            baseContext.originalMessage,
            req.user?.id || `anon_${req.ip}`
          );
          log.debug(`[GrueneratorChat] Async document knowledge extracted:`, documentKnowledge ? `${documentKnowledge.length} chars` : 'none');
        } catch (error) {
          log.error('[GrueneratorChat] Error extracting async document knowledge:', error);
          // Continue without document knowledge rather than failing
        }
      }

      // Determine if auto-search should be enabled based on AI-classified requestType
      const enableAutoSearch = requestType !== 'conversation';
      const autoSearchQuery = enableAutoSearch
        ? buildAutoSearchQuery(baseContext.originalMessage, extractedParams, intent)
        : null;

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
          ...baseContext,
          // Enable automatic document research for chat (conditionally)
          useAutomaticSearch: enableAutoSearch,
          searchQuery: autoSearchQuery
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

      log.debug(`[GrueneratorChat] Async processing ${intent.agent} via ${routeType}`);

      // Handle different route types
      if (routeType === 'sharepic' || routeType.startsWith('sharepic_')) {
        await processSharepicRequest(intent, intentReq, responseCollector, baseContext.userId);
      } else {
        await processGraphRequest(routeType, intentReq, responseCollector);
      }

    } catch (error) {
      log.error(`[GrueneratorChat] Async processing error for ${intent.agent}:`, error);
      reject(error);
    }
  });
}

/**
 * Handle imagine-specific routing
 * Routes to FLUX image generation service
 */
async function processImagineRequest(intentResult, req, res, userId = null) {
  log.debug('[GrueneratorChat] Processing imagine request:', {
    mode: req.body.mode,
    hasVariant: !!req.body.variant,
    needsVariantSelection: req.body._needsVariantSelection,
    hasSubject: !!req.body.subject
  });

  const resolvedUserId = userId || req.user?.id || `anon_${req.ip}`;

  // Check if variant selection is needed (user didn't specify style)
  if (req.body._needsVariantSelection && !req.body.variant) {
    log.debug('[GrueneratorChat] Imagine needs variant selection, checking for information request');

    const informationResult = await handleInformationRequest(
      resolvedUserId,
      req.body.originalMessage || '',
      'imagine',
      req.body,
      {
        agent: 'imagine',
        message: req.body.originalMessage || '',
        chatContext: req.body.chatContext || {},
        ...req.body
      },
      intentResult
    );

    if (informationResult?.type === 'request') {
      log.debug('[GrueneratorChat] Returning variant selection question for imagine');
      await chatMemory.addMessage(resolvedUserId, 'assistant', informationResult.data.content.text, 'imagine_variant_request');
      return res.json(informationResult.data);
    }

    // If information was completed, update the request body
    if (informationResult?.type === 'completion') {
      Object.assign(req.body, informationResult.data);
    }
  }

  try {
    const mode = req.body.mode || 'pure';
    log.debug('[GrueneratorChat] Calling generateImagineForChat:', { mode });

    const imagineResponse = await generateImagineForChat(req, mode, req.body);

    // Don't store imagine responses in chat memory (per requirements)
    return res.json(imagineResponse);

  } catch (error) {
    return createErrorResponse(res, 'IMAGINE_GENERATION_FAILED',
      'Fehler bei der Bilderzeugung. Bitte versuche es erneut.',
      500, { originalError: error.message });
  }
}

/**
 * Handle sharepic-specific routing
 * Routes to sharepic_claude.json with appropriate type parameter
 */
async function processSharepicRequest(intentResult, req, res, userId = null) {
  log.debug('[GrueneratorChat] Processing sharepic request:', {
    agent: intentResult.agent,
    sharepicType: intentResult.params?.type
  });

  // Map sharepic agent to appropriate type for sharepic_claude.json
  const sharepicTypeMapping = {
    'quote': 'zitat_pure', // Legacy alias for zitat_pure
    'zitat_with_image': 'zitat', // Handle image-based zitat
    'info': 'info',
    'headline': 'headline',
    'dreizeilen': 'dreizeilen'
  };

  // Dynamic type determination for zitat based on image presence
  let sharepicType;
  if (intentResult.agent === 'zitat') {
    // Check if we have image attachments for zitat
    const hasImageAttachment = req.body.attachments &&
      Array.isArray(req.body.attachments) &&
      req.body.attachments.some(att => att.type && att.type.startsWith('image/'));

    log.debug('[GrueneratorChat] Zitat type determination:', {
      agent: intentResult.agent,
      hasImageAttachment,
      attachmentCount: req.body.attachments?.length || 0
    });

    sharepicType = hasImageAttachment ? 'zitat' : 'zitat_pure';
  } else {
    // Use static mapping for other agents
    sharepicType = sharepicTypeMapping[intentResult.agent] ||
                   intentResult.params?.type ||
                   'dreizeilen'; // Default fallback
  }

  // Update request body with sharepic-specific parameters
  Object.assign(req.body, {
    type: sharepicType,
    sharepicType: sharepicType
  });

  log.debug('[GrueneratorChat] Routing sharepic with type:', {
    originalAgent: intentResult.agent,
    finalSharepicType: sharepicType,
    hasImageAttachment: req.body.attachments?.some(att => att.type?.startsWith('image/')) || false,
    attachmentCount: req.body.attachments?.length || 0
  });

  // Route all supported sharepic types to the generation service
  if (sharepicType === 'info' || sharepicType === 'zitat_pure' || sharepicType === 'zitat' || sharepicType === 'dreizeilen') {
    try {
      // Use parameters from the initial extraction (already in req.body)
      // Preserve all extracted params including name from Mistral/regex extraction
      const extractedParams = {
        ...req.body,
        thema: req.body.thema || 'Grüne Politik',
        details: req.body.details || req.body.originalMessage || '',
        type: sharepicType,
        originalMessage: req.body.originalMessage || '',
        chatContext: req.body.chatContext || {}
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

      // Ensure count: 1 for single sharepic generation
      finalRequestBody = {
        ...finalRequestBody,
        count: 1
      };

      const sharepicResponse = await generateSharepicForChat(req, sharepicType, finalRequestBody);
      res.json(sharepicResponse);
      return;
    } catch (error) {
      createErrorResponse(res, 'SHAREPIC_GENERATION_FAILED',
        'Fehler bei der Sharepic-Erstellung. Bitte versuche es erneut.',
        500, { originalError: error.message });
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

  log.debug(`[GrueneratorChat] Clearing all data for user: ${userId}`);

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

    log.debug(`[GrueneratorChat] Clear operation completed for ${userId}:`, results);

    res.json({
      success: true,
      message: 'All user data cleared successfully',
      details: results
    });

  } catch (error) {
    createErrorResponse(res, 'CLEAR_DATA_ERROR',
      'Benutzerdaten konnten nicht gelöscht werden.',
      500, { originalError: error.message });
  }
}));

/**
 * Helper function to check if an intent is sharepic-related
 * @param {string} agent - The agent/intent name
 * @returns {boolean} True if the intent is sharepic-related
 */
function isSharepicIntent(agent) {
  return agent === 'zitat' ||
         agent === 'zitat_pure' ||
         agent === 'zitat_with_image' ||
         agent === 'quote' ||
         agent === 'info' ||
         agent === 'headline' ||
         agent === 'dreizeilen' ||
         agent === 'dreizeilen_with_image' ||
         agent === 'dreizeilen_text_only' ||
         agent === 'sharepic' ||
         agent?.startsWith('sharepic_');
}

/**
 * Helper function to check if an intent is imagine-related
 * @param {string} agent - The agent/intent name
 * @returns {boolean} True if the intent is imagine-related
 */
function isImagineIntent(agent) {
  return agent === 'imagine' ||
         agent === 'imagine_pure' ||
         agent === 'imagine_sharepic' ||
         agent === 'imagine_edit';
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
