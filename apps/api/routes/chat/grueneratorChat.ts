/**
 * Grünerator Chat Router
 * Thin HTTP layer that delegates to services
 */

import crypto from 'crypto';

import express from 'express';
import { z } from 'zod';

/** Express Response with captured content from setupResponseCapture() */
interface CapturedResponse extends express.Response {
  _responseContent?: {
    results?: Array<{ agent: string }>;
    content?: string | { text?: string };
  };
}

import {
  isWebSearchConfirmation,
  extractRequestedInformation,
  completePendingRequest,
  type PendingRequest,
} from '../../agents/chat/InformationRequestHandler.js';
import { classifyIntent } from '../../agents/chat/IntentClassifier.js';
import { validateBody, type TypedRequest } from '../../middleware/validateBody.js';
import * as chatMemory from '../../services/chat/ChatMemoryService.js';
import { processConversationRequest } from '../../services/chat/ConversationService.js';
import {
  processMultiIntentRequest,
  processSingleIntentRequest,
  isSharepicIntent,
  isImagineIntent,
} from '../../services/chat/IntentService.js';
import {
  generateSharepicForChat,
  type ExpressRequest as SharepicExpressRequest,
} from '../../services/chat/sharepicGenerationService.js';
import {
  detectSimpleMessage,
  generateSimpleResponse,
} from '../../services/chat/simple-messages/index.js';
import { trimMessagesToTokenLimit } from '../../services/counters/index.js';
import {
  DocumentQnAService,
  type DocumentQnARedisClient,
  type DocumentQnAMistralClient,
  type Attachment as DocumentQnAAttachment,
} from '../../services/document-services/DocumentQnAService/index.js';
import {
  searxngService as searxngWebSearchService,
  type SearxngAIWorkerPool,
} from '../../services/search/index.js';
import { withErrorHandler } from '../../utils/errors/index.js';
import { getAIWorkerPool } from '../../utils/getAIWorkerPool.js';
import { createAuthenticatedRouter } from '../../utils/keycloak/index.js';
import { createLogger } from '../../utils/logger.js';
import { redisClient } from '../../utils/redis/index.js';
import mistralClient from '../../workers/mistralClient.js';

import type { AIWorkerPool as ChatAIWorkerPool } from '../../agents/chat/types.js';
import type { UserProfile } from '../../services/user/types.js';

/** Zod schema for the POST body for the main chat endpoint */
const chatRequestSchema = z.object({
  message: z.string().min(1),
  context: z.record(z.unknown()).optional(),
  attachments: z
    .array(
      z.object({
        type: z.string(),
        name: z.string().optional(),
        content: z.string().optional(),
        url: z.string().optional(),
      })
    )
    .optional(),
  usePrivacyMode: z.boolean().optional(),
  provider: z.string().nullable().optional(),
});
type ChatRequestBody = z.infer<typeof chatRequestSchema>;

/** Shape of a parsed document from Redis */
interface ParsedDocument {
  type?: string;
  name?: string;
  content?: string;
}

const log = createLogger('grueneratorChat');

// Helper to safely get user properties
const getUser = (req: express.Request): UserProfile | undefined =>
  req.user as UserProfile | undefined;

const router = createAuthenticatedRouter();
router.use(express.json({ limit: '50mb' }));

// Configuration
const CONFIG = {
  TOKEN_LIMIT: 6000,
  MAX_RECENT_DOCUMENTS: 10,
};

// Initialize DocumentQnA service
const documentQnAService = new DocumentQnAService(
  redisClient as unknown as DocumentQnARedisClient,
  mistralClient as DocumentQnAMistralClient
);

/**
 * Main chat endpoint
 */
router.post(
  '/',
  validateBody(chatRequestSchema),
  withErrorHandler(
    async (req: TypedRequest<ChatRequestBody>, res: express.Response): Promise<void> => {
      const {
        message,
        context = {},
        attachments = [],
        usePrivacyMode = false,
        provider = null,
      } = req.body;

      log.debug('[Chat] Processing request:', {
        messageLength: message.length,
        hasAttachments: attachments?.length || 0,
      });

      try {
        // Get user ID and conversation history
        const user = getUser(req);
        const userId = user?.id || `anon_${req.ip}`;
        await chatMemory.addMessage(userId, 'user', message);

        const conversation = await chatMemory.getConversation(userId);
        const trimmedHistory = trimMessagesToTokenLimit(
          conversation.messages as Array<{
            role: 'user' | 'assistant' | 'system';
            content: string;
          }>,
          CONFIG.TOKEN_LIMIT
        );

        // Check for simple messages (instant response)
        const simpleCheck = detectSimpleMessage(message);
        if (simpleCheck.isSimple && simpleCheck.category) {
          const locale = user?.locale || 'de-DE';
          const response = generateSimpleResponse(simpleCheck.category, locale);

          res.json({
            success: true,
            agent: 'simple_response',
            content: { text: response },
          });
          return;
        }

        // Process attachments
        const requestId = crypto.randomBytes(8).toString('hex');
        const sharepicImageManager = (req.app.locals.sharepicImageManager as {
          storeForRequest: (requestId: string, userId: string, img: ChatAttachment) => Promise<void>;
        } | null) ?? null;
        const { documentIds, sharepicImages, recentDocuments } = await processAttachments(
          attachments,
          userId,
          requestId,
          sharepicImageManager
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
          sharepicRequestId: requestId,
        };

        // Check for pending requests
        const pendingRequest = await checkPendingRequests(userId);

        // Handle web search confirmation
        if (pendingRequest && pendingRequest.type === 'websearch_confirmation') {
          await handleWebSearchConfirmation(
            message,
            pendingRequest as { originalQuery: string },
            userId,
            req,
            res
          );
          return;
        }

        // Handle pending information requests
        if (pendingRequest && pendingRequest.type === 'missing_information') {
          const completionResult = await handlePendingInformationRequest(
            message,
            pendingRequest as unknown as PendingRequest,
            userId,
            enhancedContext,
            req,
            res
          );
          if (completionResult) return;
        }

        // Classify intent
        const intentResult = await classifyIntent(
          message,
          enhancedContext,
          getAIWorkerPool(req) as unknown as ChatAIWorkerPool
        );

        if (!intentResult.intents || intentResult.intents.length === 0) {
          throw new Error('Unable to classify intent from message');
        }

        log.debug('[Chat] Intent classified:', {
          isMultiIntent: intentResult.isMultiIntent,
          totalIntents: intentResult.intents.length,
          agents: intentResult.intents.map((i: { agent: string }) => i.agent),
        });

        // Setup response capture for memory
        setupResponseCapture(res, intentResult);

        // Route to appropriate handler
        const baseContext = {
          originalMessage: message,
          chatContext: { ...enhancedContext, requestType: intentResult.requestType } as Record<
            string,
            unknown
          >,
          usePrivacyMode: usePrivacyMode || false,
          provider: provider || null,
          attachments: allAttachments || [],
          documentIds: documentIds || [],
          userId: userId,
          ...(intentResult.requestType != null && { requestType: intentResult.requestType }),
          ...(intentResult.subIntent != null && { subIntent: intentResult.subIntent }),
        };

        if (intentResult.requestType === 'conversation') {
          log.debug('[Chat] Routing to conversation handler');
          const result = await processConversationRequest({
            message,
            userId,
            ...(user?.locale && { locale: user.locale }),
            ...(intentResult.subIntent && { subIntent: intentResult.subIntent }),
            messageHistory: trimmedHistory,
            aiWorkerPool: getAIWorkerPool(req) as unknown as Parameters<
              typeof processConversationRequest
            >[0]['aiWorkerPool'],
            req,
          });
          res.json(result);
          return;
        }

        // Handle text_edit requests
        if (intentResult.requestType === 'text_edit') {
          log.debug('[Chat] Routing to text edit handler');
          const { processEditIntent } = await import('../../services/chat/EditIntentService.js');
          const editResult = await processEditIntent(
            message,
            userId,
            getAIWorkerPool(req) as unknown as ChatAIWorkerPool,
            req,
            intentResult.editContext
          );

          // Store edited text in chat memory
          if (editResult.success && editResult.content.text) {
            await chatMemory.addMessage(userId, 'assistant', editResult.content.text, 'text_edit');
          }

          res.json(editResult);
          return;
        }

        if (intentResult.isMultiIntent) {
          log.debug('[Chat] Processing multi-intent request');
          await processMultiIntentRequest(intentResult.intents, req, res, baseContext);

          // Store response in memory
          const responseContent = (res as CapturedResponse)._responseContent;
          if (responseContent && responseContent.results) {
            const agentList = responseContent.results
              .map((r: { agent: string }) => r.agent)
              .join(', ');
            await chatMemory.addMessage(
              userId,
              'assistant',
              `Multi-intent response: ${agentList}`,
              'multi'
            );
          }
        } else {
          log.debug('[Chat] Processing single intent');
          const intent = {
            ...intentResult.intents[0],
            ...(intentResult.requestType && { requestType: intentResult.requestType }),
          };

          await processSingleIntentRequest(intent, req, res, baseContext);

          // Store response in memory (skip sharepic and imagine)
          const responseContent = (res as CapturedResponse)._responseContent;
          if (
            responseContent &&
            responseContent.content &&
            !isSharepicIntent(intent.agent) &&
            !isImagineIntent(intent.agent)
          ) {
            const responseText =
              typeof responseContent.content === 'string'
                ? responseContent.content
                : typeof responseContent.content === 'object' &&
                    responseContent.content !== null &&
                    'text' in responseContent.content
                  ? String((responseContent.content as Record<string, unknown>).text) ||
                    'Response generated'
                  : 'Response generated';
            await chatMemory.addMessage(userId, 'assistant', responseText, intent.agent);
          }
        }
      } catch (error) {
        log.error('[Chat] Processing error:', error);
        res.status(500).json({
          success: false,
          error: 'Bei der Verarbeitung ist ein Fehler aufgetreten. Bitte versuche es erneut.',
          code: 'PROCESSING_ERROR',
          details: { originalError: (error as Error).message },
        });
        return;
      }
    }
  )
);

/**
 * Process and separate attachments by type
 */
interface ChatAttachment {
  type: string;
  name?: string | undefined;
  content?: string | undefined;
  url?: string | undefined;
}

interface ChatDocument {
  type?: string;
  name?: string;
  content?: string;
}

async function processAttachments(
  attachments: ChatAttachment[],
  userId: string,
  requestId: string,
  sharepicImageManager: {
    storeForRequest: (requestId: string, userId: string, img: ChatAttachment) => Promise<void>;
  } | null
): Promise<{
  documentIds: string[];
  sharepicImages: ChatAttachment[];
  recentDocuments: ChatDocument[];
}> {
  let documentIds: string[] = [];
  let sharepicImages: ChatAttachment[] = [];

  if (attachments && attachments.length > 0) {
    const textAttachments: ChatAttachment[] = [];
    const imageAttachments: ChatAttachment[] = [];

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
        documentIds = await documentQnAService.storeAttachments(
          userId,
          textAttachments as unknown as DocumentQnAAttachment[]
        );
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
  const recentDocuments: ChatDocument[] = [];
  try {
    const recentDocIds = await documentQnAService.getRecentDocuments(
      userId,
      CONFIG.MAX_RECENT_DOCUMENTS
    );

    for (const docId of recentDocIds) {
      if (!docId.includes(userId)) continue;

      const docData = await redisClient.get(docId);
      if (docData && typeof docData === 'string') {
        const parsed: unknown = JSON.parse(docData);
        const document = parsed as ParsedDocument;
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
async function checkPendingRequests(userId: string): Promise<Record<string, unknown> | null> {
  const lockAcquired = await chatMemory.acquirePendingLock(userId);
  let pendingRequest: Record<string, unknown> | null = null;

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
  pendingRequest: { originalQuery: string },
  userId: string,
  req: express.Request,
  res: express.Response
): Promise<unknown> {
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
        getAIWorkerPool(req) as unknown as SearxngAIWorkerPool,
        {},
        req
      );

      const responseText =
        resultsWithSummary.summary?.text ||
        'Leider konnte ich keine relevanten Informationen finden.';
      await chatMemory.addMessage(userId, 'assistant', responseText, 'websearch');

      return res.json({
        success: true,
        agent: 'websearch',
        content: {
          text: responseText,
          type: 'websearch_answer',
        },
        sources: resultsWithSummary.results
          ?.slice(0, 5)
          .map((r: { title: string; url: string; domain: string }) => ({
            title: r.title,
            url: r.url,
            domain: r.domain,
          })),
        metadata: {
          searchQuery: pendingRequest.originalQuery,
          resultCount: searchResults.resultCount || 0,
        },
      });
    } catch (error) {
      log.error('[Chat] Web search failed:', error);
      const errorText = 'Entschuldigung, bei der Websuche ist ein Fehler aufgetreten.';
      await chatMemory.addMessage(userId, 'assistant', errorText, 'websearch_error');
      return res.json({
        success: true,
        agent: 'universal',
        content: { text: errorText, type: 'text' },
      });
    }
  } else {
    const declineText = 'Alles klar! Kann ich dir bei etwas anderem helfen?';
    await chatMemory.addMessage(userId, 'assistant', declineText, 'websearch_declined');
    return res.json({
      success: true,
      agent: 'universal',
      content: { text: declineText, type: 'text' },
    });
  }
}

/**
 * Handle pending information request completion
 */
async function handlePendingInformationRequest(
  message: string,
  pendingRequest: PendingRequest,
  userId: string,
  enhancedContext: unknown,
  req: express.Request,
  res: express.Response
): Promise<unknown> {
  // Check if this is a new command
  const commandKeywords = ['erstelle', 'mache', 'schreibe', 'generiere', 'sharepic', 'zitat'];
  const isNewCommand = commandKeywords.some((keyword) => message.toLowerCase().includes(keyword));

  if (isNewCommand) {
    await chatMemory.clearPendingRequest(userId);
    return null;
  }

  // Try to extract requested information
  const extractedInfo = extractRequestedInformation(message, pendingRequest);

  if (extractedInfo) {
    await chatMemory.clearPendingRequest(userId);

    const completedRequest = completePendingRequest(pendingRequest, extractedInfo, {});

    const completedRequestContext = {
      message: completedRequest.originalMessage || completedRequest.message || '',
      thema: completedRequest.thema || '',
      details: completedRequest.details || '',
      name: completedRequest.name || '',
      usePrivacyMode: completedRequest.usePrivacyMode || false,
      provider: completedRequest.provider || null,
      chatContext: enhancedContext,
      attachments: completedRequest.attachments || [],
      documentIds: completedRequest.documentIds || [],
    };

    const hasCompletedImageAttachment =
      completedRequest.attachments &&
      Array.isArray(completedRequest.attachments) &&
      completedRequest.attachments.some((att: unknown) => {
        const a = att as ChatAttachment;
        return a.type && a.type.startsWith('image/');
      });

    let finalAgent = completedRequest.agent;
    if (completedRequest.agent === 'zitat' && hasCompletedImageAttachment) {
      finalAgent = 'zitat_with_image';
    }

    // Process completed sharepic request
    if (
      finalAgent === 'zitat' ||
      finalAgent === 'zitat_with_image' ||
      finalAgent === 'dreizeilen'
    ) {
      try {
        const sharepicType =
          finalAgent === 'zitat_with_image'
            ? 'zitat'
            : finalAgent === 'zitat'
              ? 'zitat_pure'
              : 'dreizeilen';
        Object.assign(req.body, completedRequestContext, {
          count: 1,
          preserveName: true,
        });
        const sharepicBody = req.body as {
          text?: string;
          subject?: string;
          preserveName?: boolean;
          name?: string;
          attachments?: unknown[];
          sharepicRequestId?: string;
          campaignId?: string;
          campaignTypeId?: string;
          [key: string]: unknown;
        };
        const sharepicResponse = await generateSharepicForChat(
          req as SharepicExpressRequest,
          sharepicType,
          sharepicBody
        );
        return res.json(sharepicResponse);
      } catch (error) {
        log.error('[Chat] Completion error:', error);
        return res.status(500).json({
          success: false,
          error: 'Fehler beim Erstellen des Sharepics.',
          code: 'COMPLETION_ERROR',
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
      code: 'UNHANDLED_AGENT_TYPE',
    });
  } else {
    await chatMemory.clearPendingRequest(userId);
    return null;
  }
}

/**
 * Setup response capture for memory storage
 */
function setupResponseCapture(res: CapturedResponse, _intentResult: unknown): void {
  const originalJson = res.json.bind(res);

  res.json = function (data: CapturedResponse['_responseContent']) {
    if (data) {
      res._responseContent = data;
    }
    return originalJson(data);
  };
}

/**
 * Clear all user data
 */
router.delete(
  '/clear',
  withErrorHandler(async (req, res) => {
    const user = getUser(req);
    const userId = user?.id || `anon_${req.ip}`;

    try {
      const results = {
        conversationCleared: await chatMemory.clearConversation(userId),
        pendingRequestCleared: true,
        documentsCleared: await documentQnAService.clearUserDocuments(userId),
      };

      await chatMemory.clearPendingRequest(userId);

      res.json({
        success: true,
        message: 'All user data cleared successfully',
        details: results,
      });
    } catch (error) {
      log.error('[Chat] Clear error:', error);
      res.status(500).json({
        success: false,
        error: 'Benutzerdaten konnten nicht gelöscht werden.',
        code: 'CLEAR_DATA_ERROR',
      });
    }
  })
);

/**
 * Health check
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'GrueneratorChat',
    timestamp: new Date().toISOString(),
    status: 'healthy',
  });
});

export default router;
