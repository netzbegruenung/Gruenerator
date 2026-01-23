/**
 * Grünerator Chat Router
 * Thin HTTP layer that delegates to services
 */

import express from 'express';
import { createAuthenticatedRouter } from '../../utils/keycloak/index.js';
import crypto from 'crypto';
import { createLogger } from '../../utils/logger.js';
import { classifyIntent } from '../../agents/chat/IntentClassifier.js';
import { withErrorHandler } from '../../utils/errors/index.js';
import * as chatMemory from '../../services/chat/ChatMemoryService.js';
import { trimMessagesToTokenLimit } from '../../services/counters/index.js';
import { DocumentQnAService } from '../../services/document-services/DocumentQnAService/index.js';
import { redisClient } from '../../utils/redis/index.js';
import mistralClient from '../../workers/mistralClient.js';
import { detectSimpleMessage, generateSimpleResponse } from '../../services/chat/simple-messages/index.js';
import { isWebSearchConfirmation } from '../../agents/chat/InformationRequestHandler.js';
import { searxngService as searxngWebSearchService } from '../../services/search/index.js';
import { extractRequestedInformation, completePendingRequest } from '../../agents/chat/InformationRequestHandler.js';
import { processConversationRequest } from '../../services/chat/ConversationService.js';
import { processMultiIntentRequest, processSingleIntentRequest, isSharepicIntent, isImagineIntent } from '../../services/chat/IntentService.js';
import { generateSharepicForChat } from '../../services/chat/sharepicGenerationService.js';
import type { UserProfile } from '../../services/user/types.js';

const log = createLogger('grueneratorChat');

// Helper to safely get user properties
const getUser = (req: any): UserProfile | undefined => req.user as UserProfile | undefined;
const router = createAuthenticatedRouter();

// Configuration
const CONFIG = {
  TOKEN_LIMIT: 6000,
  MAX_RECENT_DOCUMENTS: 10
};

// Initialize DocumentQnA service
const documentQnAService = new DocumentQnAService(redisClient, mistralClient);

/**
 * Main chat endpoint
 */
router.post('/', withErrorHandler(async (req, res) => {
  const {
    message,
    context = {},
    attachments = [],
    usePrivacyMode = false,
    provider = null
  } = req.body || {};

  log.debug('[Chat] Processing request:', {
    messageLength: message?.length || 0,
    hasAttachments: attachments?.length || 0
  });

  // Validate required fields
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({
      success: false,
      error: 'Message is required and cannot be empty',
      code: 'VALIDATION_ERROR'
    });
  }

  try {
    // Get user ID and conversation history
    const user = getUser(req);
    const userId = user?.id || `anon_${req.ip}`;
    await chatMemory.addMessage(userId, 'user', message);

    const conversation = await chatMemory.getConversation(userId);
    const trimmedHistory = trimMessagesToTokenLimit(conversation.messages as any, CONFIG.TOKEN_LIMIT);

    // Check for simple messages (instant response)
    const simpleCheck = detectSimpleMessage(message);
    if (simpleCheck.isSimple && simpleCheck.category) {
      const locale = user?.locale || 'de-DE';
      const response = generateSimpleResponse(simpleCheck.category, locale);

      return res.json({
        success: true,
        agent: 'simple_response',
        content: { text: response }
      });
    }

    // Process attachments
    const requestId = crypto.randomBytes(8).toString('hex');
    const { documentIds, sharepicImages, recentDocuments } = await processAttachments(
      attachments,
      userId,
      requestId,
      req.app.locals.sharepicImageManager
    );

    // Build enhanced context
    const allAttachments = [...(attachments || []), ...recentDocuments];
    const hasImageAttachment = sharepicImages.length > 0;

    const enhancedContext = {
      ...context,
      messageHistory: trimmedHistory,
      lastAgent: conversation.metadata?.lastAgent,
      documentIds: documentIds,
      hasImageAttachment: hasImageAttachment,
      sharepicRequestId: requestId
    };

    // Check for pending requests
    const pendingRequest = await checkPendingRequests(userId);

    // Handle web search confirmation
    if (pendingRequest && pendingRequest.type === 'websearch_confirmation') {
      return await handleWebSearchConfirmation(message, pendingRequest, userId, req, res);
    }

    // Handle pending information requests
    if (pendingRequest && pendingRequest.type === 'missing_information') {
      const completionResult = await handlePendingInformationRequest(
        message,
        pendingRequest,
        userId,
        enhancedContext,
        req,
        res
      );
      if (completionResult) return completionResult;
    }

    // Classify intent
    const intentResult = await classifyIntent(message, enhancedContext, req.app.locals.aiWorkerPool);

    if (!intentResult.intents || intentResult.intents.length === 0) {
      throw new Error('Unable to classify intent from message');
    }

    log.debug('[Chat] Intent classified:', {
      isMultiIntent: intentResult.isMultiIntent,
      totalIntents: intentResult.intents.length,
      agents: intentResult.intents.map((i: any) => i.agent)
    });

    // Setup response capture for memory
    setupResponseCapture(res, intentResult);

    // Route to appropriate handler
    const baseContext = {
      originalMessage: message,
      chatContext: { ...enhancedContext, requestType: intentResult.requestType },
      usePrivacyMode: usePrivacyMode || false,
      provider: provider || null,
      attachments: allAttachments || [],
      documentIds: documentIds || [],
      userId: userId,
      requestType: intentResult.requestType,
      subIntent: intentResult.subIntent
    };

    if (intentResult.requestType === 'conversation') {
      log.debug('[Chat] Routing to conversation handler');
      const result = await processConversationRequest({
        message,
        userId,
        locale: user?.locale as any,
        subIntent: intentResult.subIntent,
        messageHistory: trimmedHistory,
        aiWorkerPool: req.app.locals.aiWorkerPool,
        req
      });
      return res.json(result);
    }

    // Handle text_edit requests
    if (intentResult.requestType === 'text_edit') {
      log.debug('[Chat] Routing to text edit handler');
      const { processEditIntent } = await import('../../services/chat/EditIntentService.js');
      const editResult = await processEditIntent(
        message,
        userId,
        req.app.locals.aiWorkerPool,
        req,
        intentResult.editContext
      );

      // Store edited text in chat memory
      if (editResult.success && editResult.content.text) {
        await chatMemory.addMessage(userId, 'assistant', editResult.content.text, 'text_edit');
      }

      return res.json(editResult);
    }

    if (intentResult.isMultiIntent) {
      log.debug('[Chat] Processing multi-intent request');
      await processMultiIntentRequest(intentResult.intents, req, res, baseContext);

      // Store response in memory
      const responseContent = (res as any)._responseContent;
      if (responseContent && responseContent.results) {
        const agentList = responseContent.results.map((r: any) => r.agent).join(', ');
        await chatMemory.addMessage(userId, 'assistant', `Multi-intent response: ${agentList}`, 'multi');
      }
    } else {
      log.debug('[Chat] Processing single intent');
      const intent = {
        ...intentResult.intents[0],
        requestType: intentResult.requestType
      };

      await processSingleIntentRequest(intent, req, res, baseContext);

      // Store response in memory (skip sharepic and imagine)
      const responseContent = (res as any)._responseContent;
      if (responseContent && responseContent.content && !isSharepicIntent(intent.agent) && !isImagineIntent(intent.agent)) {
        const responseText = typeof responseContent.content === 'string'
          ? responseContent.content
          : responseContent.content.text || 'Response generated';
        await chatMemory.addMessage(userId, 'assistant', responseText, intent.agent);
      }
    }

  } catch (error) {
    log.error('[Chat] Processing error:', error);
    return res.status(500).json({
      success: false,
      error: 'Bei der Verarbeitung ist ein Fehler aufgetreten. Bitte versuche es erneut.',
      code: 'PROCESSING_ERROR',
      details: { originalError: (error as Error).message }
    });
  }
}));

/**
 * Process and separate attachments by type
 */
async function processAttachments(
  attachments: any[],
  userId: string,
  requestId: string,
  sharepicImageManager: any
): Promise<{ documentIds: string[]; sharepicImages: any[]; recentDocuments: any[] }> {
  let documentIds: string[] = [];
  let sharepicImages: any[] = [];

  if (attachments && attachments.length > 0) {
    const textAttachments: any[] = [];
    const imageAttachments: any[] = [];

    for (const attachment of attachments) {
      if (attachment.type && attachment.type.startsWith('image/')) {
        imageAttachments.push(attachment);
      } else {
        textAttachments.push(attachment);
      }
    }

    // Store text documents
    if (textAttachments.length > 0) {
      try {
        documentIds = await documentQnAService.storeAttachments(userId, textAttachments);
        log.debug(`[Chat] Stored ${textAttachments.length} text documents`);
      } catch (error) {
        log.error('[Chat] Error storing text attachments:', error);
      }
    }

    // Store images temporarily
    if (imageAttachments.length > 0 && sharepicImageManager) {
      try {
        for (const img of imageAttachments) {
          await sharepicImageManager.storeForRequest(requestId, userId, img);
        }
        sharepicImages = imageAttachments;
        log.debug(`[Chat] Stored ${imageAttachments.length} images`);
      } catch (error) {
        log.error('[Chat] Error storing images:', error);
      }
    }
  }

  // Retrieve recent documents (excluding images)
  const recentDocuments: any[] = [];
  try {
    const recentDocIds = await documentQnAService.getRecentDocuments(userId, CONFIG.MAX_RECENT_DOCUMENTS);

    for (const docId of recentDocIds) {
      if (!docId.includes(userId)) continue;

      const docData = await redisClient.get(docId);
      if (docData && typeof docData === 'string') {
        const document = JSON.parse(docData);
        if (!document.type?.startsWith('image/')) {
          recentDocuments.push(document);
        }
      }
    }
  } catch (error) {
    log.error('[Chat] Error retrieving recent documents:', error);
  }

  return { documentIds, sharepicImages, recentDocuments };
}

/**
 * Check for pending requests with lock
 */
async function checkPendingRequests(userId: string): Promise<any> {
  const lockAcquired = await chatMemory.acquirePendingLock(userId);
  let pendingRequest: any = null;

  if (lockAcquired) {
    try {
      pendingRequest = await chatMemory.getPendingRequest(userId);
    } catch (error) {
      log.warn('[Chat] Error checking pending request:', error);
    } finally {
      await chatMemory.releasePendingLock(userId);
    }
  }

  return pendingRequest;
}

/**
 * Handle web search confirmation
 */
async function handleWebSearchConfirmation(
  message: string,
  pendingRequest: any,
  userId: string,
  req: any,
  res: any
): Promise<any> {
  const confirmed = isWebSearchConfirmation(message);
  await chatMemory.clearPendingRequest(userId);

  if (confirmed) {
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
        sources: resultsWithSummary.results?.slice(0, 5).map((r: any) => ({
          title: r.title,
          url: r.url,
          domain: r.domain
        })),
        metadata: {
          searchQuery: pendingRequest.originalQuery,
          resultCount: searchResults.resultCount || 0
        }
      });
    } catch (error) {
      log.error('[Chat] Web search failed:', error);
      const errorText = 'Entschuldigung, bei der Websuche ist ein Fehler aufgetreten.';
      await chatMemory.addMessage(userId, 'assistant', errorText, 'websearch_error');
      return res.json({
        success: true,
        agent: 'universal',
        content: { text: errorText, type: 'text' }
      });
    }
  } else {
    const declineText = 'Alles klar! Kann ich dir bei etwas anderem helfen?';
    await chatMemory.addMessage(userId, 'assistant', declineText, 'websearch_declined');
    return res.json({
      success: true,
      agent: 'universal',
      content: { text: declineText, type: 'text' }
    });
  }
}

/**
 * Handle pending information request completion
 */
async function handlePendingInformationRequest(
  message: string,
  pendingRequest: any,
  userId: string,
  enhancedContext: any,
  req: any,
  res: any
): Promise<any> {
  // Check if this is a new command
  const commandKeywords = ['erstelle', 'mache', 'schreibe', 'generiere', 'sharepic', 'zitat'];
  const isNewCommand = commandKeywords.some(keyword => message.toLowerCase().includes(keyword));

  if (isNewCommand) {
    await chatMemory.clearPendingRequest(userId);
    return null;
  }

  // Try to extract requested information
  const extractedInfo = extractRequestedInformation(message, pendingRequest);

  if (extractedInfo) {
    await chatMemory.clearPendingRequest(userId);

    const completedRequest = completePendingRequest(pendingRequest, extractedInfo, req);

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

    const hasCompletedImageAttachment = completedRequest.attachments &&
      Array.isArray(completedRequest.attachments) &&
      completedRequest.attachments.some((att: any) => att.type && att.type.startsWith('image/'));

    let finalAgent = completedRequest.agent;
    if (completedRequest.agent === 'zitat' && hasCompletedImageAttachment) {
      finalAgent = 'zitat_with_image';
    }

    // Process completed sharepic request
    if (finalAgent === 'zitat' || finalAgent === 'zitat_with_image' || finalAgent === 'dreizeilen') {
      try {
        const sharepicType = finalAgent === 'zitat_with_image' ? 'zitat' : (finalAgent === 'zitat' ? 'zitat_pure' : 'dreizeilen');
        Object.assign(req.body, completedRequestContext, {
          count: 1,
          preserveName: true
        });
        const sharepicResponse = await generateSharepicForChat(req, sharepicType, req.body);
        return res.json(sharepicResponse);
      } catch (error) {
        log.error('[Chat] Completion error:', error);
        return res.status(500).json({
          success: false,
          error: 'Fehler beim Erstellen des Sharepics.',
          code: 'COMPLETION_ERROR'
        });
      }
    }

    if (!finalAgent || finalAgent === 'undefined') {
      await chatMemory.clearPendingRequest(userId);
      return null;
    }

    return res.status(500).json({
      success: false,
      error: `Handler für Agent "${finalAgent}" nicht implementiert.`,
      code: 'UNHANDLED_AGENT_TYPE'
    });
  } else {
    await chatMemory.clearPendingRequest(userId);
    return null;
  }
}

/**
 * Setup response capture for memory storage
 */
function setupResponseCapture(res: any, intentResult: any): void {
  const originalJson = res.json.bind(res);

  res.json = function(data: any) {
    res._responseContent = data;
    return originalJson(data);
  };
}

/**
 * Clear all user data
 */
router.delete('/clear', withErrorHandler(async (req, res) => {
  const user = getUser(req);
  const userId = user?.id || `anon_${req.ip}`;

  try {
    const results = {
      conversationCleared: await chatMemory.clearConversation(userId),
      pendingRequestCleared: true,
      documentsCleared: await documentQnAService.clearUserDocuments(userId)
    };

    await chatMemory.clearPendingRequest(userId);

    res.json({
      success: true,
      message: 'All user data cleared successfully',
      details: results
    });
  } catch (error) {
    log.error('[Chat] Clear error:', error);
    res.status(500).json({
      success: false,
      error: 'Benutzerdaten konnten nicht gelöscht werden.',
      code: 'CLEAR_DATA_ERROR'
    });
  }
}));

/**
 * Health check
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
