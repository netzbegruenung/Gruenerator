/**
 * Notebook Stream Core
 * Shared SSE streaming logic for notebook Q&A, used by both the authenticated
 * notebook controller and the public Gruen-O-Mat controller.
 */

import { streamText, type ModelMessage } from 'ai';

import {
  buildConcisePromptGrundsatz,
  buildConcisePromptGeneral,
} from '../../agents/langgraph/prompts.js';
import {
  SYSTEM_COLLECTIONS,
  getSystemCollectionConfig,
} from '../../config/systemCollectionsConfig.js';
import { NotebookQdrantHelper } from '../../database/services/NotebookQdrantHelper.js';
import { notebookQAService } from '../../services/notebook/index.js';
import { rerankNotebookResults } from '../../services/notebook/rerankNotebookResults.js';
import {
  renumberCitationsInOrder,
  validateAndInjectCitations,
  groupSourcesByCollection,
} from '../../services/search/index.js';
import { createLogger } from '../../utils/logger.js';
import { containsPromptLeakage } from '../gruenomat/topicGuard.js';

import { isProviderConfigured } from './agents/providers.js';
import { resolveModel } from './services/responseStreamingService.js';
import { SSEWriter } from './services/sseHelpers.js';

import type { SearchContext } from '../../services/notebook/types.js';
import type express from 'express';

const log = createLogger('NotebookStreamCore');
const notebookHelper = new NotebookQdrantHelper();

const DEFAULT_PROVIDER = 'litellm';
const DEFAULT_MODEL = 'gpt-oss:120b';

export interface NotebookStreamOptions {
  req: express.Request;
  res: express.Response;
  messages: ModelMessage[];
  collectionId?: string;
  collectionIds?: string[];
  filters?: Record<string, any>;
  provider?: string;
  model?: string;
  mode?: 'fast' | 'deep';
  userId?: string;
  allowUserCollections?: boolean;
  systemPromptOverride?: string;
  /** Custom message when too few results survive reranking (Layer 4). */
  noResultsMessage?: string;
  /** Minimum results after rerank to proceed with generation (default: 0 = no gate). */
  minResultsForGeneration?: number;
  /** Filter search to specific document IDs within the collection. */
  documentIds?: string[];
  /** Shared SSE writer — if provided, used instead of creating one internally. */
  sse?: SSEWriter;
}

export interface NotebookStreamResult {
  answer: string;
  citations: any[];
  sources: any[];
  question: string;
}

export async function handleNotebookStream(
  options: NotebookStreamOptions
): Promise<NotebookStreamResult | null> {
  const {
    req,
    res,
    messages,
    collectionId,
    collectionIds,
    filters,
    provider,
    model,
    mode,
    userId,
    allowUserCollections = true,
    documentIds,
  } = options;

  const isFast = mode === 'fast';

  // SSE headers (skip if already flushed by controller for thread_created)
  if (!res.headersSent) {
    SSEWriter.initHeaders(res);
  }

  const sse = options.sse ?? new SSEWriter(res);

  const abortController = new AbortController();
  req.on('close', () => {
    abortController.abort();
  });

  try {
    if (!messages || messages.length === 0) {
      sse.send('error', { error: 'Messages are required' });
      sse.end();
      return null;
    }

    if (!collectionId && (!collectionIds || collectionIds.length === 0)) {
      sse.send('error', { error: 'collectionId or collectionIds is required' });
      sse.end();
      return null;
    }

    const lastUserMessage = messages.filter((m) => m.role === 'user').pop();
    if (!lastUserMessage || typeof lastUserMessage.content !== 'string') {
      sse.send('error', { error: 'No user message found' });
      sse.end();
      return null;
    }

    const question = lastUserMessage.content;
    const t0 = Date.now();

    sse.send('search_start', { message: 'Suche in Dokumenten...' });

    console.log(
      '[NotebookStreamCore] 🔍 filters passed to getSearchContext:',
      JSON.stringify(filters)
    );

    let searchContext: SearchContext | null;
    try {
      searchContext = await notebookQAService.getSearchContext({
        question,
        collectionId,
        collectionIds,
        userId: userId || 'anonymous',
        requestFilters: filters,
        getCollectionFn: async (id: string) => {
          const systemConfig = getSystemCollectionConfig(id);
          if (systemConfig) return null;
          if (!allowUserCollections) return null;
          return await notebookHelper.getNotebookCollection(id);
        },
        getDocumentIdsFn: async (id: string) => {
          if (!allowUserCollections) return [];
          const docs = await notebookHelper.getCollectionDocuments(id);
          const allIds = docs.map((d) => d.document_id);
          if (documentIds?.length) {
            return allIds.filter((docId) => documentIds.includes(docId));
          }
          return allIds;
        },
      });
    } catch (error: any) {
      log.error('Search context error:', error);
      log.debug(`⏱ Search context failed: ${Date.now() - t0}ms`);
      sse.send('error', { error: error.message || 'Failed to get search context' });
      sse.end();
      return null;
    }

    const t1 = Date.now();
    log.debug(
      `⏱ Search context: ${t1 - t0}ms, ${searchContext?.sortedResults.length ?? 0} results`
    );

    sse.send('search_complete', {
      message: searchContext
        ? `${searchContext.sortedResults.length} relevante Stellen gefunden`
        : '0 relevante Stellen gefunden',
      resultCount: searchContext?.sortedResults.length ?? 0,
    });

    // Fast mode: rerank results to reduce context size
    if (isFast && searchContext) {
      const reranked = await rerankNotebookResults({
        results: searchContext.sortedResults,
        referencesMap: searchContext.referencesMap,
        question,
        limit: 10,
      });
      searchContext.sortedResults = reranked.results;
      searchContext.referencesMap = reranked.referencesMap;
      searchContext.contextSummary = reranked.contextSummary;

      log.debug(
        `⏱ Rerank: ${reranked.rerankTimeMs}ms, ${searchContext.sortedResults.length} results kept`
      );

      const isSystemCollection =
        searchContext.effectiveCollectionIds?.some((id) => !!getSystemCollectionConfig(id)) ??
        false;
      searchContext.systemPrompt = isSystemCollection
        ? buildConcisePromptGrundsatz(searchContext.collectionName || 'Grüne Dokumente').system
        : buildConcisePromptGeneral(searchContext.collectionName || 'Ihre Dokumente').system;
    }

    // Apply custom system prompt if provided (e.g. Gruen-O-Mat persona)
    if (options.systemPromptOverride && searchContext) {
      searchContext.systemPrompt = options.systemPromptOverride;
    }

    // Layer 4: Quality gate — require minimum results after rerank
    const minResults = options.minResultsForGeneration ?? 0;
    if (minResults > 0 && searchContext && searchContext.sortedResults.length < minResults) {
      const msg = options.noResultsMessage || 'Keine passenden Quellen gefunden.';
      log.info(
        'Quality gate: %d results < threshold %d',
        searchContext.sortedResults.length,
        minResults
      );
      sse.send('text_delta', { text: msg });
      sse.send('completion', {
        answer: msg,
        citations: [],
        sources: [],
        allSources: [],
        metadata: {
          totalResults: searchContext.sortedResults.length,
          qualityGateTriggered: true,
        },
      });
      sse.end();
      return null;
    }

    // Handle no results case
    if (!searchContext) {
      const noResultsMessage = collectionId
        ? 'Leider konnte ich in dieser Sammlung keine passenden Stellen zu Ihrer Frage finden.'
        : 'Leider konnte ich in den verfügbaren Quellen keine passenden Informationen zu Ihrer Frage finden.';

      sse.send('text_delta', { text: noResultsMessage });
      sse.send('completion', {
        answer: noResultsMessage,
        citations: [],
        sources: [],
        allSources: [],
        metadata: {
          isMulti: !!collectionIds && collectionIds.length > 0,
          totalResults: 0,
          citationsCount: 0,
        },
      });
      sse.end();
      return null;
    }

    // Determine AI provider and model (same resolution as chat — handles model ID → real name)
    const defaultAgentConfig = { provider: DEFAULT_PROVIDER, model: DEFAULT_MODEL };
    const { model: aiModel, provider: resolvedProvider } = resolveModel(defaultAgentConfig, model);

    if (!isProviderConfigured(resolvedProvider)) {
      sse.send('error', { error: `Provider "${resolvedProvider}" is not configured` });
      sse.end();
      return null;
    }

    // Layer 2: Use XML delimiters for content isolation when a system prompt override
    // is active (Gruen-O-Mat). This structurally separates user input from retrieved
    // documents, making it harder for injected instructions to be treated as system-level.
    const userContent = options.systemPromptOverride
      ? `<user_question>${question}</user_question>\n\n<retrieved_sources>\n${searchContext.contextSummary}\n</retrieved_sources>`
      : `Frage: ${question}\n\nVerfügbare Quellen:\n${searchContext.contextSummary}`;

    const aiMessages: ModelMessage[] = [
      { role: 'system', content: searchContext.systemPrompt },
      ...messages.slice(0, -1),
      { role: 'user', content: userContent },
    ];

    const t2 = Date.now();
    log.debug(`⏱ Model setup: ${t2 - t1}ms`);

    const result = streamText({
      model: aiModel,
      messages: aiMessages,
      maxOutputTokens: isFast ? 3000 : 16000,
      temperature: 0.2,
      abortSignal: abortController.signal,
    });

    sse.send('response_start', { message: 'Generiere Antwort...' });

    let fullText = '';
    let firstChunkTime: number | undefined;

    try {
      for await (const chunk of result.textStream) {
        if (abortController.signal.aborted) break;
        if (!firstChunkTime) {
          firstChunkTime = Date.now();
          log.debug(`⏱ First token latency: ${firstChunkTime - t2}ms`);
        }
        fullText += chunk;
        sse.send('text_delta', { text: chunk });
      }
    } catch (streamError: any) {
      if (abortController.signal.aborted) {
        log.debug('Notebook stream aborted by client disconnect');
        log.debug(`⏱ Total (aborted): ${Date.now() - t0}ms, ${fullText.length} chars`);
        sse.end();
        return null;
      }
      const t4err = Date.now();
      log.warn('Stream error (accumulated %d chars): %s', fullText.length, streamError.message);
      log.debug(
        `⏱ Streaming (error): ${t4err - (firstChunkTime || t2)}ms, ${fullText.length} chars`
      );

      if (fullText.length > 0) {
        try {
          const { renumberedDraft, newReferencesMap } = renumberCitationsInOrder(
            fullText,
            searchContext.referencesMap
          );
          const { cleanDraft, citations, sources } = validateAndInjectCitations(
            renumberedDraft,
            newReferencesMap
          );
          const allSources = searchContext.sortedResults
            .filter((_, i) => !citations.some((c) => c.index === String(i + 1)))
            .slice(0, 10);

          let sourcesByCollection: Record<string, any> | undefined;
          if (searchContext.isMulti && searchContext.effectiveCollectionIds) {
            const collectionsConfig: Record<string, any> = {};
            for (const id of searchContext.effectiveCollectionIds) {
              const config = SYSTEM_COLLECTIONS[id];
              if (config) collectionsConfig[id] = config;
            }
            sourcesByCollection = groupSourcesByCollection(
              citations,
              searchContext.sortedResults,
              collectionsConfig
            );
          }

          sse.send('completion', {
            answer: cleanDraft,
            citations,
            sources,
            allSources,
            ...(sourcesByCollection && { sourcesByCollection }),
            metadata: {
              isMulti: searchContext.isMulti,
              collectionName: searchContext.collectionName,
              effectiveCollectionIds: searchContext.effectiveCollectionIds,
              totalResults: searchContext.sortedResults.length,
              citationsCount: citations.length,
              partial: true,
            },
          });
        } catch (citationError: any) {
          log.error('Failed to process partial citations:', citationError);
          sse.send('error', { error: streamError.message || 'Stream interrupted' });
        }
      } else {
        sse.send('error', { error: streamError.message || 'Stream interrupted' });
      }
      log.debug(`⏱ Total (error path): ${Date.now() - t0}ms`);
      sse.end();
      return null;
    }

    const t4 = Date.now();
    log.debug(`⏱ Streaming: ${t4 - (firstChunkTime || t2)}ms, ${fullText.length} chars`);

    // Layer 5: Output leakage detection — check if the LLM leaked system prompt fragments
    if (options.systemPromptOverride && containsPromptLeakage(fullText)) {
      log.warn('Prompt leakage detected in response, replacing with fallback');
      const fallback =
        options.noResultsMessage || 'Entschuldigung, ich konnte keine passende Antwort generieren.';
      sse.send('completion', {
        answer: fallback,
        citations: [],
        sources: [],
        allSources: [],
        metadata: { totalResults: searchContext.sortedResults.length, leakageDetected: true },
      });
      sse.end();
      return null;
    }

    const { renumberedDraft, newReferencesMap } = renumberCitationsInOrder(
      fullText,
      searchContext.referencesMap
    );
    const { cleanDraft, citations, sources } = validateAndInjectCitations(
      renumberedDraft,
      newReferencesMap
    );

    const allSources = searchContext.sortedResults
      .filter((_, i) => !citations.some((c) => c.index === String(i + 1)))
      .slice(0, 10);

    let sourcesByCollection: Record<string, any> | undefined;
    if (searchContext.isMulti && searchContext.effectiveCollectionIds) {
      const collectionsConfig: Record<string, any> = {};
      for (const id of searchContext.effectiveCollectionIds) {
        const config = SYSTEM_COLLECTIONS[id];
        if (config) collectionsConfig[id] = config;
      }
      sourcesByCollection = groupSourcesByCollection(
        citations,
        searchContext.sortedResults,
        collectionsConfig
      );
    }

    const t5 = Date.now();
    log.debug(`⏱ Citation processing: ${t5 - t4}ms, ${citations.length} citations`);

    sse.send('completion', {
      answer: cleanDraft,
      citations,
      sources,
      allSources,
      ...(sourcesByCollection && { sourcesByCollection }),
      metadata: {
        isMulti: searchContext.isMulti,
        collectionName: searchContext.collectionName,
        effectiveCollectionIds: searchContext.effectiveCollectionIds,
        totalResults: searchContext.sortedResults.length,
        citationsCount: citations.length,
      },
    });

    const t6 = Date.now();
    log.debug(
      `⏱ Total: ${t6 - t0}ms [${isFast ? 'fast' : 'deep'}] (search=${t1 - t0}, setup=${t2 - t1}, ttft=${(firstChunkTime || t2) - t2}, stream=${t4 - (firstChunkTime || t2)}, cite=${t5 - t4})`
    );
    sse.end();

    return { answer: cleanDraft, citations, sources, question };
  } catch (error: any) {
    log.error('Notebook stream error:', error);
    sse.send('error', { error: 'Internal server error' });
    sse.end();
    return null;
  }
}
