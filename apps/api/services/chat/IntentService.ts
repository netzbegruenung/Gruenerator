/**
 * Intent Processing Service
 * Handles single and multi-intent request processing with orchestration
 */

import { createLogger } from '../../utils/logger.js';
import {
  extractParameters,
  analyzeParameterConfidence,
} from '../../agents/chat/ParameterExtractor/index.js';
import {
  handleInformationRequest,
  getWebSearchQuestion,
} from '../../agents/chat/InformationRequestHandler.js';
import { isQuestionMessage } from '../../agents/chat/IntentClassifier.js';
import { processGraphRequest } from '../../agents/langgraph/PromptProcessor.js';
import * as chatMemory from './index.js';
import { DocumentQnAService } from '../document-services/DocumentQnAService/index.js';
import { redisClient } from '../../utils/redis/index.js';
import mistralClient from '../../workers/mistralClient.js';
import { generateSharepicForChat } from './sharepicGenerationService.js';
import { generateImagineForChat } from './imagineGenerationService.js';
import type {
  Intent as DocumentIntent,
  AgentType,
} from '../document-services/DocumentQnAService/types.js';

const log = createLogger('IntentService');

// Initialize DocumentQnA service
const documentQnAService = new DocumentQnAService(redisClient, mistralClient);

/**
 * Configuration constants
 */
const CONFIG = {
  LOW_CONFIDENCE_THRESHOLD: 0.3,
  MULTI_INTENT_TIMEOUT: 30000,
  MIN_DETAILS_LENGTH: 10,
  MAX_DETAILS_LENGTH: 200,
  MAX_FALLBACK_LENGTH: 300,
};

/**
 * Intent interface
 */
interface Intent {
  agent: string;
  confidence: number;
  route?: string;
  params?: Record<string, unknown>;
  requestType?: string;
  [key: string]: unknown;
}

/**
 * Convert Intent to DocumentIntent for DocumentQnAService
 */
function toDocumentIntent(intent: Intent): DocumentIntent {
  return {
    agent: intent.agent as AgentType,
    confidence: intent.confidence,
    route: intent.route,
    params: intent.params,
    requestType: intent.requestType,
  };
}

/**
 * Base context interface
 */
interface BaseContext {
  originalMessage: string;
  chatContext: Record<string, unknown>;
  usePrivacyMode: boolean;
  provider: string | null;
  attachments: unknown[];
  documentIds: string[];
  userId: string;
  requestType?: string;
  subIntent?: string;
  [key: string]: unknown;
}

/**
 * Multi-intent result interface
 */
interface MultiIntentResult {
  success: boolean;
  agent: string;
  content?: any;
  error?: string;
  confidence: number;
  processingIndex: number;
}

/**
 * Build search query from user message for automatic document research
 */
function buildAutoSearchQuery(message: string, extractedParams: any, intent: Intent): string {
  // Priority 1: Use extracted thema if meaningful
  if (
    extractedParams.thema &&
    extractedParams.thema !== 'Grüne Politik' &&
    extractedParams.thema !== 'Politisches Thema'
  ) {
    return extractedParams.thema;
  }

  // Priority 2: Use extracted idee (for antrag agents)
  if (extractedParams.idee) {
    return extractedParams.idee;
  }

  // Priority 3: Use details if focused
  if (
    extractedParams.details &&
    extractedParams.details.length > CONFIG.MIN_DETAILS_LENGTH &&
    extractedParams.details.length < CONFIG.MAX_DETAILS_LENGTH
  ) {
    return extractedParams.details;
  }

  // Priority 4: Clean the message - remove common command phrases
  const cleanedMessage = message
    .replace(/(?:erstelle|mache|schreibe|generiere)\s+(?:mir|uns|einen?|eine?|das|die|der)/gi, '')
    .replace(/(?:bitte|danke|könntest du|kannst du)/gi, '')
    .replace(/(?:post|beitrag|pressemitteilung|antrag|zitat|sharepic)/gi, '')
    .replace(/(?:für|über|zum thema|bezüglich)/gi, '')
    .trim();

  return cleanedMessage.length > CONFIG.MIN_DETAILS_LENGTH &&
    cleanedMessage.length < CONFIG.MAX_FALLBACK_LENGTH
    ? cleanedMessage
    : cleanedMessage.substring(0, CONFIG.MAX_FALLBACK_LENGTH);
}

/**
 * Helper function to check if an intent is sharepic-related
 */
function isSharepicIntent(agent: string): boolean {
  return (
    agent === 'zitat' ||
    agent === 'zitat_pure' ||
    agent === 'zitat_with_image' ||
    agent === 'quote' ||
    agent === 'info' ||
    agent === 'headline' ||
    agent === 'dreizeilen' ||
    agent === 'dreizeilen_with_image' ||
    agent === 'dreizeilen_text_only' ||
    agent === 'sharepic' ||
    agent?.startsWith('sharepic_')
  );
}

/**
 * Helper function to check if an intent is imagine-related
 */
function isImagineIntent(agent: string): boolean {
  return (
    agent === 'imagine' ||
    agent === 'imagine_pure' ||
    agent === 'imagine_sharepic' ||
    agent === 'imagine_edit'
  );
}

/**
 * Process sharepic request with intelligent routing
 */
async function processSharepicRequest(
  intentResult: Intent,
  req: any,
  res: any,
  userId: string | null = null
): Promise<void> {
  log.debug('[IntentService] Processing sharepic request:', {
    agent: intentResult.agent,
    sharepicType: intentResult.params?.type,
  });

  // Map sharepic agent to appropriate type
  const sharepicTypeMapping: Record<string, string> = {
    quote: 'zitat_pure',
    zitat_with_image: 'zitat',
    info: 'info',
    headline: 'headline',
    dreizeilen: 'dreizeilen',
  };

  // Dynamic type determination for zitat based on image presence
  let sharepicType: string;
  if (intentResult.agent === 'zitat') {
    const hasImageAttachment =
      req.body.attachments &&
      Array.isArray(req.body.attachments) &&
      req.body.attachments.some((att: any) => att.type && att.type.startsWith('image/'));

    sharepicType = hasImageAttachment ? 'zitat' : 'zitat_pure';
  } else {
    sharepicType =
      sharepicTypeMapping[intentResult.agent] ||
      (intentResult.params?.type as string) ||
      'dreizeilen';
  }

  // Update request body with sharepic-specific parameters
  Object.assign(req.body, {
    type: sharepicType,
    sharepicType: sharepicType,
  });

  log.debug('[IntentService] Routing sharepic with type:', {
    originalAgent: intentResult.agent,
    finalSharepicType: sharepicType,
  });

  // Route all supported sharepic types to the generation service
  if (
    sharepicType === 'info' ||
    sharepicType === 'zitat_pure' ||
    sharepicType === 'zitat' ||
    sharepicType === 'dreizeilen'
  ) {
    try {
      const extractedParams = {
        ...req.body,
        thema: req.body.thema || 'Grüne Politik',
        details: req.body.details || req.body.originalMessage || '',
        type: sharepicType,
        originalMessage: req.body.originalMessage || '',
        chatContext: req.body.chatContext || {},
      };

      const resolvedUserId = userId || req.user?.id || `anon_${req.ip}`;
      const sharepicIntent: Intent = {
        agent: sharepicType === 'zitat_pure' || sharepicType === 'zitat' ? 'zitat' : sharepicType,
        route: 'sharepic',
        params: { type: sharepicType },
        confidence: 0.9,
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
          ...extractedParams,
        },
        sharepicIntent
      );

      if (informationResult && informationResult.type === 'request') {
        res.json(informationResult.data);
        return;
      }

      let finalRequestBody = req.body;
      if (informationResult && informationResult.type === 'completion') {
        finalRequestBody = {
          ...req.body,
          ...informationResult.data,
        };
      }

      finalRequestBody = {
        ...finalRequestBody,
        count: 1,
      };

      const sharepicResponse = await generateSharepicForChat(req, sharepicType, finalRequestBody);
      res.json(sharepicResponse);
      return;
    } catch (error) {
      log.error('[IntentService] Sharepic generation failed:', error);
      res.status(500).json({
        success: false,
        error: 'Fehler bei der Sharepic-Erstellung. Bitte versuche es erneut.',
        code: 'SHAREPIC_GENERATION_FAILED',
      });
      return;
    }
  }

  await processGraphRequest('sharepic_claude', req, res);
}

/**
 * Process imagine request with variant selection
 */
async function processImagineRequest(
  intentResult: Intent,
  req: any,
  res: any,
  userId: string | null = null
): Promise<any> {
  log.debug('[IntentService] Processing imagine request:', {
    mode: req.body.mode,
    hasVariant: !!req.body.variant,
    needsVariantSelection: req.body._needsVariantSelection,
  });

  const resolvedUserId = userId || req.user?.id || `anon_${req.ip}`;

  if (req.body._needsVariantSelection && !req.body.variant) {
    const informationResult = await handleInformationRequest(
      resolvedUserId,
      req.body.originalMessage || '',
      'imagine',
      req.body,
      {
        agent: 'imagine',
        message: req.body.originalMessage || '',
        chatContext: req.body.chatContext || {},
        ...req.body,
      },
      intentResult
    );

    if (informationResult?.type === 'request') {
      const requestData = informationResult.data as { content: { text: string } };
      await chatMemory.addMessage(
        resolvedUserId,
        'assistant',
        requestData.content.text,
        'imagine_variant_request'
      );
      return res.json(informationResult.data);
    }

    if (informationResult?.type === 'completion') {
      Object.assign(req.body, informationResult.data);
    }
  }

  try {
    const mode = req.body.mode || 'pure';
    const imagineResponse = await generateImagineForChat(req, mode, req.body);
    return res.json(imagineResponse);
  } catch (error) {
    log.error('[IntentService] Imagine generation failed:', error);
    return res.status(500).json({
      success: false,
      error: 'Fehler bei der Bilderzeugung. Bitte versuche es erneut.',
      code: 'IMAGINE_GENERATION_FAILED',
    });
  }
}

/**
 * Process multiple intents in parallel
 */
export async function processMultiIntentRequest(
  intents: Intent[],
  req: any,
  res: any,
  baseContext: BaseContext
): Promise<void> {
  log.debug('[IntentService] Starting parallel processing of', intents.length, 'intents');

  const processingTasks = intents.map(async (intent, index): Promise<MultiIntentResult> => {
    try {
      log.debug(
        `[IntentService] Processing intent ${index + 1}/${intents.length}: ${intent.agent}`
      );

      const result = await processIntentAsync(intent, req, baseContext);

      return {
        success: true,
        agent: intent.agent,
        content: result,
        confidence: intent.confidence,
        processingIndex: index,
      };
    } catch (error) {
      log.error(`[IntentService] Error processing ${intent.agent}:`, (error as Error).message);
      return {
        success: false,
        agent: intent.agent,
        error: (error as Error).message,
        confidence: intent.confidence,
        processingIndex: index,
      };
    }
  });

  try {
    const results = await Promise.race([
      Promise.all(processingTasks),
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                `Multi-intent processing timeout after ${CONFIG.MULTI_INTENT_TIMEOUT / 1000}s`
              )
            ),
          CONFIG.MULTI_INTENT_TIMEOUT
        )
      ),
    ]);

    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    log.debug(
      `[IntentService] Multi-intent processing completed: ${successful.length} successful, ${failed.length} failed`
    );

    res.json({
      success: successful.length > 0,
      multiResponse: true,
      results: results,
      metadata: {
        totalIntents: intents.length,
        successfulIntents: successful.length,
        failedIntents: failed.length,
        executionType: 'parallel',
      },
    });
  } catch (error) {
    log.error('[IntentService] Multi-intent processing error:', error);
    res.status(500).json({
      success: false,
      error: 'Mehrfachverarbeitung fehlgeschlagen. Bitte versuche es erneut.',
      code: 'MULTI_INTENT_PROCESSING_ERROR',
    });
  }
}

/**
 * Process single intent request
 */
export async function processSingleIntentRequest(
  intent: Intent,
  req: any,
  res: any,
  baseContext: BaseContext
): Promise<void> {
  const requestType =
    intent.requestType || baseContext.chatContext?.requestType || 'content_creation';

  log.debug('[IntentService] Processing single intent with requestType:', requestType);

  // Check for low-confidence universal fallback with a question - offer web search
  if (
    intent.agent === 'universal' &&
    intent.confidence <= CONFIG.LOW_CONFIDENCE_THRESHOLD &&
    isQuestionMessage(baseContext.originalMessage)
  ) {
    log.debug('[IntentService] Low-confidence question detected, offering web search');
    const userId = req.user?.id || `anon_${req.ip}`;

    await chatMemory.setPendingRequest(userId, {
      type: 'websearch_confirmation',
      originalQuery: baseContext.originalMessage,
      timestamp: Date.now(),
    });

    const question = getWebSearchQuestion();
    await chatMemory.addMessage(userId, 'assistant', question, 'websearch_offer');

    res.json({
      success: true,
      agent: 'websearch_offer',
      content: {
        text: question,
        type: 'question',
      },
      requiresResponse: true,
    });
    return;
  }

  // Extract parameters for this intent
  const extractedParams = await extractParameters(
    baseContext.originalMessage,
    intent.agent,
    baseContext.chatContext
  );

  // Check if we have all required information
  const parameterAnalysis = analyzeParameterConfidence(extractedParams, intent.agent);

  if (!parameterAnalysis.allRequiredPresent && parameterAnalysis.missingFields.length > 0) {
    log.debug('[IntentService] Missing required fields, checking for information request');

    const userId = req.user?.id || `anon_${req.ip}`;
    const informationResult = await handleInformationRequest(
      userId,
      baseContext.originalMessage,
      intent.agent,
      extractedParams,
      baseContext,
      intent
    );

    if (informationResult?.type === 'request') {
      log.debug('[IntentService] Returning information request for missing fields');
      res.json(informationResult.data);
      const requestData = informationResult.data as { content: { text: string } };
      await chatMemory.addMessage(
        userId,
        'assistant',
        requestData.content.text,
        'information_request'
      );
      return;
    }
  }

  // Extract document knowledge if documents are present
  let documentKnowledge: string | null = null;
  if (baseContext.documentIds && baseContext.documentIds.length > 0) {
    const isImageBasedSharepic =
      intent.agent === 'zitat_with_image' ||
      intent.agent === 'dreizeilen_with_image' ||
      (baseContext.chatContext.hasImageAttachment &&
        ['zitat', 'dreizeilen'].includes(intent.agent));

    if (!isImageBasedSharepic) {
      try {
        log.debug(`[IntentService] Extracting document knowledge for intent: ${intent.agent}`);
        documentKnowledge = await documentQnAService.extractKnowledgeForIntent(
          baseContext.documentIds,
          toDocumentIntent(intent),
          baseContext.originalMessage,
          req.user?.id || `anon_${req.ip}`
        );
        log.debug(
          `[IntentService] Document knowledge extracted:`,
          documentKnowledge ? `${documentKnowledge.length} chars` : 'none'
        );
      } catch (error) {
        log.error('[IntentService] Error extracting document knowledge:', error);
      }
    }
  }

  // Determine if auto-search should be enabled
  const enableAutoSearch = requestType !== 'conversation';

  const autoSearchQuery = enableAutoSearch
    ? buildAutoSearchQuery(baseContext.originalMessage, extractedParams, intent)
    : null;

  // Update request body for single intent processing
  Object.assign(
    req.body,
    extractedParams,
    intent.params,
    {
      agent: intent.agent,
      documentKnowledge: documentKnowledge,
    },
    baseContext,
    {
      useAutomaticSearch: enableAutoSearch,
      searchQuery: autoSearchQuery,
    }
  );

  const routeType = intent.route || intent.agent;

  log.debug('[IntentService] Routing single intent to:', {
    routeType,
    agent: intent.agent,
  });

  // Handle imagine routing
  if (routeType === 'imagine') {
    await processImagineRequest(intent, req, res, baseContext.userId);
  }
  // Handle sharepic routing
  else if (routeType === 'sharepic' || routeType.startsWith('sharepic_')) {
    await processSharepicRequest(intent, req, res, baseContext.userId);
  } else {
    // Use existing processGraphRequest for all other agents
    await processGraphRequest(routeType, req, res);
  }
}

/**
 * Process single intent asynchronously (for multi-intent parallel processing)
 */
async function processIntentAsync(
  intent: Intent,
  req: any,
  baseContext: BaseContext
): Promise<any> {
  return new Promise(async (resolve, reject) => {
    try {
      const requestType = baseContext.requestType || 'content_creation';

      const extractedParams = await extractParameters(
        baseContext.originalMessage,
        intent.agent,
        baseContext.chatContext
      );

      let documentKnowledge: string | null = null;
      if (baseContext.documentIds && baseContext.documentIds.length > 0) {
        try {
          documentKnowledge = await documentQnAService.extractKnowledgeForIntent(
            baseContext.documentIds,
            toDocumentIntent(intent),
            baseContext.originalMessage,
            req.user?.id || `anon_${req.ip}`
          );
        } catch (error) {
          log.error('[IntentService] Error extracting async document knowledge:', error);
        }
      }

      const enableAutoSearch = requestType !== 'conversation';
      const autoSearchQuery = enableAutoSearch
        ? buildAutoSearchQuery(baseContext.originalMessage, extractedParams, intent)
        : null;

      const intentReq: any = {
        ...req,
        app: req.app,
        headers: req.headers,
        user: req.user,
        body: {
          ...extractedParams,
          ...intent.params,
          agent: intent.agent,
          documentKnowledge: documentKnowledge,
          ...baseContext,
          useAutomaticSearch: enableAutoSearch,
          searchQuery: autoSearchQuery,
        },
        startTime: Date.now(),
      };

      const responseCollector: any = {
        statusCode: 200,
        responseData: null,

        status: function (code: number) {
          this.statusCode = code;
          return this;
        },

        json: function (data: any) {
          this.responseData = data;
          if (this.statusCode >= 400) {
            reject(new Error(`Processing failed: ${data.error || 'Unknown error'}`));
          } else {
            resolve(data);
          }
        },

        send: function (data: any) {
          this.responseData = data;
          resolve(data);
        },
      };

      const routeType = intent.route || intent.agent;

      if (routeType === 'sharepic' || routeType.startsWith('sharepic_')) {
        await processSharepicRequest(intent, intentReq, responseCollector, baseContext.userId);
      } else {
        await processGraphRequest(routeType, intentReq, responseCollector);
      }
    } catch (error) {
      log.error(`[IntentService] Async processing error for ${intent.agent}:`, error);
      reject(error);
    }
  });
}

/**
 * Export utility functions for use in routes
 */
export { isSharepicIntent, isImagineIntent };
