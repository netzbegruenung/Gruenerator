/**
 * Streaming Processor - SSE variant of processGraphRequest
 *
 * Reuses all prompt assembly infrastructure from PromptProcessor.ts
 * but replaces aiWorkerPool.processRequest() with streamText()
 * for real-time token-by-token delivery via Server-Sent Events.
 */

import { streamText } from 'ai';

import { createSSEStream } from '../../routes/chat/services/sseHelpers.js';
import { getModel, type ProviderName } from '../../services/ai/providers.js';
import { PrivacyCounter } from '../../services/counters/index.js';
import {
  localizePromptObject,
  extractLocaleFromRequest,
  type RequestWithLocale,
} from '../../services/localization/index.js';
import { selectProviderAndModel } from '../../services/providers/providerSelector.js';
import { getAIWorkerPool } from '../../utils/getAIWorkerPool.js';
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

import type { PRAgentRequest } from './PRAgent/types.js';
import type { PromptAssemblyState } from './types/promptAssembly.js';
import type { GenerationStatsService } from '../../database/services/GenerationStatsService/index.js';
import type { AuthenticatedRequest } from '../../middleware/types.js';
import type { WebSearchSource } from '../../utils/types/requestEnrichment.js';
import type { Request, Response } from 'express';

const log = createLogger('streamingProcessor');

let generationStatsService: GenerationStatsService | null = null;

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
  const authReq = req as AuthenticatedRequest;
  const sse = createSSEStream(res);
  const abortController = new AbortController();

  req.on('close', () => {
    abortController.abort();
  });

  try {
    const requestData = req.body as {
      platforms?: string[];
      customPrompt?: { instructions?: string; knowledgeContent?: string } | string;
      usePrivacyMode?: boolean;
      provider?: string;
      model?: string;
      knowledgeContent?: string;
      selectedDocumentIds?: string[];
      selectedTextIds?: string[];
      searchQuery?: string;
      useNotebookEnrich?: boolean;
      useProMode?: boolean;
      useUltraMode?: boolean;
      reasoningEffort?: string;
      slug?: string;
      theme?: string;
      thema?: string;
      details?: string;
      partySearchTerm?: string;
    };
    const {
      customPrompt,
      usePrivacyMode,
      provider,
      knowledgeContent,
      selectedDocumentIds,
      selectedTextIds,
      searchQuery,
      useNotebookEnrich,
    } = requestData;

    // Handle structured customPrompt from frontend
    let extractedInstructions: string | null =
      typeof customPrompt === 'string' ? customPrompt : null;
    let extractedKnowledgeContent: string | null = knowledgeContent ?? null;

    if (customPrompt && typeof customPrompt === 'object' && !Array.isArray(customPrompt)) {
      extractedInstructions = customPrompt.instructions ?? null;
      extractedKnowledgeContent = customPrompt.knowledgeContent ?? knowledgeContent ?? null;
    }

    log.debug(`[streaming] Processing ${routeType} request`);

    // Route to PR Agent if "automatisch" platform detected (not streamable)
    if (routeType === 'social' && requestData.platforms?.includes('automatisch')) {
      sse.end();
      return processAutomatischPR(requestData as PRAgentRequest, req, res);
    }

    // --- Progress: enriching ---
    sse.sendRaw('progress', { stage: 'enriching', message: 'Durchsuche Quellen...' });

    // Load configuration and localize
    const baseConfig = loadPromptConfig(routeType);
    const userLocale = extractLocaleFromRequest(req as RequestWithLocale);
    const config = localizePromptObject(baseConfig, userLocale);

    // Validate request
    const validationError = validateRequest(requestData, config);
    if (validationError) {
      sse.sendRaw('error', { error: validationError });
      sse.end();
      return;
    }

    // Apply profile defaults
    await applyProfileDefaults(
      requestData,
      req as Parameters<typeof applyProfileDefaults>[1],
      routeType
    );

    if (!extractedInstructions && typeof requestData.customPrompt === 'string') {
      extractedInstructions = requestData.customPrompt;
    }

    // Handle custom_generator special case
    let generatorData: Awaited<ReturnType<typeof loadCustomGeneratorPrompt>> = null;
    if (config.features?.customPromptFromDb) {
      generatorData = await loadCustomGeneratorPrompt(requestData.slug ?? '');
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
        examples: [],
        provider,
        aiWorkerPool: getAIWorkerPool(req),
        enableNotebookEnrich: useNotebookEnrich ?? config.features?.notebookEnrich ?? false,
      },
      req
    );

    if (typeof requestContent === 'string') {
      enrichedState.requestFormatted = requestContent;
    }
    if (config.tools) {
      enrichedState.tools = config.tools;
    }

    sse.sendRaw('progress', { stage: 'assembling', message: 'Bereite Prompt vor...' });

    // Assemble prompt
    const promptAssemblyState: PromptAssemblyState = {
      systemRole: enrichedState.systemRole ?? '',
      locale: enrichedState.locale,
      request: enrichedState.request,
      requestFormatted: enrichedState.requestFormatted,
      documents: enrichedState.documents,
      knowledge: enrichedState.knowledge,
      examples: enrichedState.examples,
      instructions: enrichedState.instructions,
      toolInstructions: enrichedState.toolInstructions,
      constraints: enrichedState.constraints,
      formatting: enrichedState.formatting,
      taskInstructions: enrichedState.taskInstructions,
      outputFormat: enrichedState.outputFormat,
      tools: enrichedState.tools,
      type: enrichedState.type,
      enrichmentMetadata: enrichedState.enrichmentMetadata,
      selectedDocumentIds: enrichedState.selectedDocumentIds,
    };
    const promptResult = await assemblePromptGraphAsync(promptAssemblyState);

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
        const userId = authReq.user?.id;
        if (userId) {
          const privacyProvider = await privacyCounter.getProviderForUser(userId);
          effectiveProvider = privacyProvider as ProviderName;
        }
      } catch (privacyError) {
        log.warn('[streaming] Privacy mode error, using default provider:', privacyError);
      }
    }

    // Explicit provider + model override (from request data, e.g. playground)
    if (requestData.provider) {
      effectiveProvider = requestData.provider as ProviderName;
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

    // Build messages for streamText. The system prompt is passed via the
    // top-level `system` option (see streamText call below), not as a
    // role:'system' entry in messages — the latter triggers an AI SDK warning
    // and is treated as a prompt-injection vector.
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    for (const msg of promptResult.messages) {
      let content: string;
      if (typeof msg.content === 'string') {
        content = msg.content;
      } else if (Array.isArray(msg.content)) {
        content = msg.content
          .map((c) => ('text' in c ? (c as { text: string }).text : ''))
          .join('\n');
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
      system: promptResult.system,
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

    // Heartbeat: send keepalive comment every 8s so proxies/browsers don't close the connection
    const heartbeatInterval = setInterval(() => {
      if (!abortController.signal.aborted) {
        res.write(': heartbeat\n\n');
      }
    }, 8000);

    try {
      // eslint-disable-next-line @typescript-eslint/await-thenable -- AI SDK fullStream is async-iterable; the rule mis-types it
      for await (const part of result.fullStream) {
        if (abortController.signal.aborted) break;

        switch (part.type) {
          case 'reasoning-start': {
            sse.sendRaw('reasoning_start', {});
            break;
          }
          case 'reasoning-delta': {
            sse.sendRaw('reasoning_delta', { text: part.text });
            break;
          }
          case 'reasoning-end': {
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
          case 'source':
          case 'tool-call':
          case 'tool-result':
          case 'tool-error':
          case 'tool-output-denied':
          case 'text-start':
          case 'text-end':
          case 'tool-input-start':
          case 'tool-input-end':
          case 'tool-input-delta':
          case 'file':
          case 'start-step':
          case 'finish-step':
          case 'start':
          case 'finish':
          case 'abort':
          case 'raw':
          case 'tool-approval-request':
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
    void logGeneration({
      userId: authReq.user?.id || null,
      generationType: routeType,
      platform: requestData.platforms?.[0] || null,
      tokensUsed: null,
      success: true,
    });

    // Cache edit context in Redis
    if (authReq.user?.id) {
      try {
        const { redisClient } = await import('../../utils/redis/index.js');
        const contextCacheKey = `edit_context:${authReq.user.id}:${routeType}`;
        const contextData = {
          originalRequest: requestData,
          enrichedState: {
            type: routeType,
            platforms: requestData.platforms || [],
            theme: requestData.theme || requestData.thema || requestData.details || null,
            urlsScraped: enrichedState.enrichmentMetadata?.urlsProcessed || [],
            documentsUsed:
              enrichedState.documents
                ?.filter((d) => {
                  const meta = d.source?.metadata;
                  return (
                    d.type === 'text' &&
                    meta != null &&
                    'contentSource' in meta &&
                    meta.contentSource === 'url_crawl'
                  );
                })
                .map((d) => {
                  const meta = d.source.metadata as { title?: string; url?: string };
                  return { title: meta?.title || 'Document', url: meta?.url || null };
                }) || [],
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
      notebookEnrichUsed: enrichedState.enrichmentMetadata?.notebookEnrichUsed || false,
      sources: [
        ...(enrichedState.enrichmentMetadata?.urlsProcessed || []).map((url: string) => ({
          type: 'url',
          title: 'Gescrapte Website',
          url,
        })),
        ...(enrichedState.enrichmentMetadata?.webSearchSources || []).map(
          (source: WebSearchSource) => ({
            type: 'websearch' as const,
            title: source.title || source.url,
            url: source.url,
          })
        ),
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

    void logGeneration({
      userId: authReq.user?.id || null,
      generationType: routeType,
      platform: (req.body as { platforms?: string[] } | undefined)?.platforms?.[0] ?? null,
      tokensUsed: null,
      success: false,
    });

    if (!res.headersSent) {
      sse.sendRaw('error', { error: errorMessage });
    }
    sse.end();
  }
}
