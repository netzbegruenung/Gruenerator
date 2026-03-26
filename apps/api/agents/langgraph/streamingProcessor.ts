/**
 * Streaming Processor - SSE variant of processGraphRequest
 *
 * Reuses all prompt assembly infrastructure from PromptProcessor.ts
 * but replaces aiWorkerPool.processRequest() with streamText()
 * for real-time token-by-token delivery via Server-Sent Events.
 */

import { streamText } from 'ai';

import { createSSEStream } from '../../routes/chat/services/sseHelpers.js';
import { getModel } from '../../services/ai/providers.js';
import { PrivacyCounter } from '../../services/counters/index.js';
import {
  localizePromptObject,
  extractLocaleFromRequest,
} from '../../services/localization/index.js';
import { selectProviderAndModel } from '../../services/providers/providerSelector.js';
import { createLogger } from '../../utils/logger.js';
import { enrichRequest } from '../../utils/requestEnrichment.js';

import { processAutomatischPR } from './PRAgent/index.js';
import { assemblePromptGraphAsync } from './promptAssemblyGraph.js';
import {
  loadPromptConfig,
  getAIOptions,
  buildSystemRole,
  buildRequestContent,
  buildConstraints,
  getFormattingInstructions,
  getTaskInstructions,
  getOutputFormat,
  buildWebSearchQuery,
  validateRequest,
  applyProfileDefaults,
  loadCustomGeneratorPrompt,
} from './PromptProcessor.js';

import type { Request, Response } from 'express';

const log = createLogger('streamingProcessor');

let generationStatsService: any = null;

async function logGeneration(data: {
  userId: string | null;
  generationType: string;
  platform: string | null;
  tokensUsed: number | null;
  success: boolean;
}): Promise<void> {
  try {
    if (!generationStatsService) {
      const module = await import('../../database/services/GenerationStatsService/index.js');
      generationStatsService = module.getGenerationStatsService();
    }
    await generationStatsService.logGeneration(data);
  } catch {
    // Silent failure - stats logging should not affect generation
  }
}

/**
 * Stream a text generation request via SSE.
 *
 * Mirrors processGraphRequest() (PromptProcessor.ts:596-882) but
 * streams the AI response token-by-token instead of waiting for completion.
 */
export async function processGraphRequestStreaming(
  routeType: string,
  req: Request,
  res: Response
): Promise<void> {
  const sse = createSSEStream(res);
  const abortController = new AbortController();

  req.on('close', () => {
    abortController.abort();
  });

  try {
    const requestData = req.body;
    const {
      customPrompt,
      usePrivacyMode,
      provider,
      knowledgeContent,
      selectedDocumentIds,
      selectedTextIds,
      searchQuery,
      useAutomaticSearch,
      useNotebookEnrich,
    } = requestData;

    // Handle structured customPrompt from frontend
    let extractedInstructions = customPrompt;
    let extractedKnowledgeContent = knowledgeContent;

    if (customPrompt && typeof customPrompt === 'object' && !Array.isArray(customPrompt)) {
      extractedInstructions = customPrompt.instructions || null;
      extractedKnowledgeContent = customPrompt.knowledgeContent || knowledgeContent || null;
    }

    log.debug(`[streaming] Processing ${routeType} request`);

    // Route to PR Agent if "automatisch" platform detected (not streamable)
    if (routeType === 'social' && requestData.platforms?.includes('automatisch')) {
      sse.end();
      return processAutomatischPR(requestData, req, res);
    }

    // --- Progress: enriching ---
    sse.sendRaw('progress', { stage: 'enriching', message: 'Durchsuche Quellen...' });

    // Load configuration and localize
    const baseConfig = loadPromptConfig(routeType);
    const userLocale = extractLocaleFromRequest(req);
    const config = localizePromptObject(baseConfig, userLocale);

    // Validate request
    const validationError = validateRequest(requestData, config);
    if (validationError) {
      sse.sendRaw('error', { error: validationError });
      sse.end();
      return;
    }

    // Apply profile defaults
    await applyProfileDefaults(requestData, req, routeType);

    if (!extractedInstructions && requestData.customPrompt) {
      extractedInstructions = requestData.customPrompt;
    }

    // Handle custom_generator special case
    let generatorData: any = null;
    if (config.features?.customPromptFromDb) {
      generatorData = await loadCustomGeneratorPrompt(requestData.slug);
    }

    // Build prompt components
    const systemRole = buildSystemRole(config, requestData, generatorData);
    const requestContent = buildRequestContent(config, requestData, generatorData);
    const constraints = buildConstraints(config, requestData);
    const formatting = getFormattingInstructions(config);
    const taskInstructions = getTaskInstructions(config, requestData);
    const outputFormat = getOutputFormat(config, requestData);
    requestData.partySearchTerm =
      userLocale === 'de-AT' ? 'Die Grünen Österreich' : 'Bündnis 90 Die Grünen';
    const webSearchQuery = buildWebSearchQuery(config, requestData);

    // Enrich request (web search, document retrieval, etc.)
    const enrichedState = await enrichRequest(
      requestData,
      {
        type: routeType,
        enableUrls: config.features?.urlCrawl !== false,
        enableWebSearch: !!webSearchQuery,
        enableDocQnA: config.features?.docQnA !== false,
        usePrivacyMode: usePrivacyMode || false,
        useProMode: requestData.useProMode || false,
        webSearchQuery,
        systemRole,
        constraints,
        formatting,
        taskInstructions: taskInstructions || null,
        outputFormat: outputFormat || null,
        instructions: extractedInstructions || null,
        knowledgeContent: extractedKnowledgeContent || null,
        selectedDocumentIds: selectedDocumentIds || [],
        selectedTextIds: selectedTextIds || [],
        searchQuery: searchQuery || null,
        useAutomaticSearch: useAutomaticSearch || false,
        examples: [],
        provider,
        aiWorkerPool: (req as any).app.locals.aiWorkerPool,
        enableNotebookEnrich: useNotebookEnrich ?? config.features?.notebookEnrich ?? false,
      },
      req
    );

    enrichedState.requestFormatted = requestContent;
    if (config.tools) {
      enrichedState.tools = config.tools;
    }

    sse.sendRaw('progress', { stage: 'assembling', message: 'Bereite Prompt vor...' });

    // Assemble prompt
    const promptResult = await assemblePromptGraphAsync(enrichedState as any);

    // --- Progress: generating ---
    sse.sendRaw('progress', { stage: 'generating', message: 'Erstelle Text...' });

    // Resolve provider and model
    const aiOptions = getAIOptions(config, requestData);

    const selection = selectProviderAndModel({
      type: routeType,
      options: {
        ...aiOptions,
        useProMode: !!requestData.useProMode,
        useUltraMode: !!requestData.useUltraMode,
      },
      metadata: {},
      env: process.env,
    });

    let effectiveProvider = selection.provider;
    let effectiveModel = selection.model;

    // Privacy mode rotation
    if (usePrivacyMode) {
      try {
        const { redisClient } = await import('../../utils/redis/index.js');
        const privacyCounter = new PrivacyCounter(redisClient);
        const userId =
          (req as any).user?.id ||
          (req as any).session?.passport?.user?.id ||
          (req as any).sessionID;
        if (userId) {
          const privacyProvider = await privacyCounter.getProviderForUser(userId);
          effectiveProvider = privacyProvider as any;
        }
      } catch (privacyError) {
        log.warn('[streaming] Privacy mode error, using default provider:', privacyError);
      }
    }

    // Explicit provider + model override (from request data, e.g. playground)
    if (requestData.provider) {
      effectiveProvider = requestData.provider;
    }
    if (requestData.model) {
      effectiveModel = requestData.model;
    }

    // Reasoning effort: explicit from request (playground), or auto-detect from content type
    const REASONING_BY_TYPE: Record<string, string> = {
      antrag_simple: 'medium',
      antrag: 'high',
      kleine_anfrage: 'medium',
      grosse_anfrage: 'high',
      rede: 'medium',
      wahlprogramm: 'medium',
      qa_draft: 'low',
      universal: 'low',
      social: 'low',
      buergeranfragen: 'low',
      leichte_sprache: 'low',
    };
    const reasoningEffort =
      (requestData.reasoningEffort as string | undefined) || REASONING_BY_TYPE[routeType];
    log.debug(
      `[streaming] Using provider=${effectiveProvider}, model=${effectiveModel}${reasoningEffort ? `, reasoningEffort=${reasoningEffort}` : ''}`
    );

    // Build messages for streamText
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: promptResult.system },
    ];

    for (const msg of promptResult.messages) {
      let content: string;
      if (typeof msg.content === 'string') {
        content = msg.content;
      } else if (Array.isArray(msg.content)) {
        content = msg.content.map((c: any) => c.text || c.content || '').join('\n');
      } else {
        content = String(msg.content);
      }
      messages.push({
        role: msg.role as 'user' | 'assistant',
        content,
      });
    }

    // Create the language model and stream
    const model = getModel(effectiveProvider, effectiveModel);

    const result = streamText({
      model,
      messages,
      maxOutputTokens: reasoningEffort
        ? 32768
        : aiOptions.max_tokens
          ? aiOptions.max_tokens * 2
          : 16384,
      temperature: aiOptions.temperature ?? 0.7,
      abortSignal: abortController.signal,
      ...(reasoningEffort
        ? {
            providerOptions: {
              openai: { reasoningEffort },
            },
          }
        : {}),
    });

    let fullText = '';
    let isReasoning = false;

    // Heartbeat: send keepalive comment every 8s so proxies/browsers don't close the connection
    const heartbeatInterval = setInterval(() => {
      if (!abortController.signal.aborted) {
        res.write(': heartbeat\n\n');
      }
    }, 8000);

    try {
      for await (const part of result.fullStream) {
        if (abortController.signal.aborted) break;

        switch (part.type) {
          case 'reasoning-start': {
            isReasoning = true;
            sse.sendRaw('reasoning_start', {});
            break;
          }
          case 'reasoning-delta': {
            sse.sendRaw('reasoning_delta', { text: (part as any).text });
            break;
          }
          case 'reasoning-end': {
            isReasoning = false;
            sse.sendRaw('reasoning_end', {});
            break;
          }
          case 'text-delta': {
            fullText += part.text;
            sse.sendRaw('text_delta', { text: part.text });
            break;
          }
          case 'error': {
            throw part.error;
          }
          default:
            break;
        }
      }

      log.debug(`[streaming] fullStream finished: textLength=${fullText.length}`);
    } catch (streamError: unknown) {
      if (abortController.signal.aborted) {
        log.debug(`[streaming] Stream aborted by client for ${routeType}`);
        clearInterval(heartbeatInterval);
        sse.end();
        return;
      }
      clearInterval(heartbeatInterval);
      throw streamError;
    }

    clearInterval(heartbeatInterval);

    // Log successful generation
    logGeneration({
      userId: (req as any).user?.id || (req as any).session?.passport?.user?.id || null,
      generationType: routeType,
      platform: requestData.platforms?.[0] || null,
      tokensUsed: null,
      success: true,
    });

    // Cache edit context in Redis
    if ((req as any).session?.id) {
      try {
        const { redisClient } = await import('../../utils/redis/index.js');
        const contextCacheKey = `edit_context:${(req as any).session.id}:${routeType}`;
        const contextData = {
          originalRequest: requestData,
          enrichedState: {
            type: routeType,
            platforms: requestData.platforms || [],
            theme: requestData.theme || requestData.thema || requestData.details || null,
            urlsScraped: enrichedState.enrichmentMetadata?.urlsProcessed || [],
            documentsUsed:
              enrichedState.documents
                ?.filter(
                  (d: any) => d.type === 'text' && d.source?.metadata?.contentSource === 'url_crawl'
                )
                .map((d: any) => ({
                  title: d.source.metadata?.title || 'Document',
                  url: d.source.metadata?.url || null,
                })) || [],
            docQnAUsed: enrichedState.enrichmentMetadata?.enableDocQnA || false,
            vectorSearchUsed: (selectedDocumentIds && selectedDocumentIds.length > 0) || false,
            webSearchUsed: (enrichedState.enrichmentMetadata?.webSearchSources?.length ?? 0) > 0,
          },
          timestamp: Date.now(),
        };
        await redisClient.setEx(contextCacheKey, 3600, JSON.stringify(contextData));
      } catch {
        // Don't fail if caching fails
      }
    }

    // Build enrichment summary
    const enrichmentSummary = {
      urlsScraped: enrichedState.enrichmentMetadata?.urlsProcessed?.length || 0,
      documentsProcessed: enrichedState.documents?.length || 0,
      docQnAUsed: enrichedState.enrichmentMetadata?.enableDocQnA || false,
      vectorSearchUsed: (selectedDocumentIds && selectedDocumentIds.length > 0) || false,
      webSearchUsed: (enrichedState.enrichmentMetadata?.webSearchSources?.length ?? 0) > 0,
      autoSearchUsed: enrichedState.enrichmentMetadata?.autoSearchUsed || false,
      autoSelectedDocuments: enrichedState.enrichmentMetadata?.autoSelectedDocuments || [],
      notebookEnrichUsed: enrichedState.enrichmentMetadata?.notebookEnrichUsed || false,
      sources: [
        ...(enrichedState.enrichmentMetadata?.urlsProcessed || []).map((url: string) => ({
          type: 'url',
          title: 'Gescrapte Website',
          url,
        })),
        ...(enrichedState.enrichmentMetadata?.webSearchSources || []).map((source: any) => ({
          type: 'websearch',
          title: source.title || source.url,
          url: source.url,
        })),
        ...(enrichedState.enrichmentMetadata?.autoSelectedDocuments || []).map((doc: any) => ({
          type: 'auto-document',
          title: doc.title,
          filename: doc.filename,
          relevance: doc.relevance_percent,
        })),
      ],
    };

    // Send done event with full content + metadata
    sse.sendRaw('done', {
      content: fullText,
      metadata: {
        webSearchSources: enrichedState.enrichmentMetadata?.webSearchSources || null,
        platforms: requestData.platforms || null,
      },
      enrichmentSummary,
    });
    sse.end();
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error(`[streaming] Error processing ${routeType}:`, errorMessage);

    logGeneration({
      userId: (req as any).user?.id || (req as any).session?.passport?.user?.id || null,
      generationType: routeType,
      platform: req.body?.platforms?.[0] || null,
      tokensUsed: null,
      success: false,
    });

    if (!res.headersSent) {
      sse.sendRaw('error', { error: errorMessage });
    }
    sse.end();
  }
}
