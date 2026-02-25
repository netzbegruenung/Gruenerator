/**
 * Notebook Streaming Controller
 * Handles AI chat streaming for notebook Q&A via Vercel AI SDK
 *
 * Uses Server-Sent Events (SSE) for streaming text chunks and data annotations.
 * Data format:
 * - event: text_delta, data: {"text": "chunk"} - streaming text chunks
 * - event: completion, data: {...} - final completion with sources/citations
 * - event: error, data: {"error": "message"} - error messages
 */

import { streamText, type ModelMessage } from 'ai';

import {
  SYSTEM_COLLECTIONS,
  getSystemCollectionConfig,
} from '../../config/systemCollectionsConfig.js';
import { NotebookQdrantHelper } from '../../database/services/NotebookQdrantHelper.js';
import { notebookQAService } from '../../services/notebook/index.js';
import {
  renumberCitationsInOrder,
  validateAndInjectCitations,
  groupSourcesByCollection,
} from '../../services/search/index.js';
import { createAuthenticatedRouter } from '../../utils/keycloak/index.js';
import { createLogger } from '../../utils/logger.js';

import { getModel, isProviderConfigured } from './agents/providers.js';

import type { SearchContext } from '../../services/notebook/types.js';
import type { UserProfile } from '../../services/user/types.js';
import type express from 'express';

const log = createLogger('NotebookStreamController');
const router = createAuthenticatedRouter();
const notebookHelper = new NotebookQdrantHelper();

const getUser = (req: express.Request): UserProfile | undefined =>
  (req as any).user as UserProfile | undefined;

const DEFAULT_PROVIDER = 'mistral';
const DEFAULT_MODEL = 'mistral-large-latest';

interface NotebookStreamRequest {
  messages: ModelMessage[];
  collectionId?: string;
  collectionIds?: string[];
  filters?: Record<string, any>;
  provider?: string;
  model?: string;
}

/**
 * Send SSE event helper
 */
function sendSSE(res: express.Response, event: string, data: any): void {
  if (res.writableEnded || res.destroyed) return;
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/**
 * POST /api/chat-service/notebook/stream
 * Stream answers to notebook questions with sources/citations
 */
router.post('/', async (req, res) => {
  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const abortController = new AbortController();
  req.on('close', () => {
    abortController.abort();
  });

  try {
    const { messages, collectionId, collectionIds, filters, provider, model } =
      req.body as NotebookStreamRequest;

    const user = getUser(req);
    if (!user?.id) {
      sendSSE(res, 'error', { error: 'Unauthorized' });
      res.end();
      return;
    }
    const userId = user.id;

    if (!messages || messages.length === 0) {
      sendSSE(res, 'error', { error: 'Messages are required' });
      res.end();
      return;
    }

    if (!collectionId && (!collectionIds || collectionIds.length === 0)) {
      sendSSE(res, 'error', { error: 'collectionId or collectionIds is required' });
      res.end();
      return;
    }

    const lastUserMessage = messages.filter((m) => m.role === 'user').pop();
    if (!lastUserMessage || typeof lastUserMessage.content !== 'string') {
      sendSSE(res, 'error', { error: 'No user message found' });
      res.end();
      return;
    }

    const question = lastUserMessage.content;
    const t0 = Date.now();

    // Get search context (vector search + context building)
    sendSSE(res, 'search_start', { message: 'Suche in Dokumenten...' });

    let searchContext: SearchContext | null;
    try {
      searchContext = await notebookQAService.getSearchContext({
        question,
        collectionId,
        collectionIds,
        userId,
        requestFilters: filters,
        getCollectionFn: async (id: string) => {
          const systemConfig = getSystemCollectionConfig(id);
          if (systemConfig) return null;
          return await notebookHelper.getNotebookCollection(id);
        },
        getDocumentIdsFn: async (id: string) => {
          const docs = await notebookHelper.getCollectionDocuments(id);
          return docs.map((d) => d.document_id);
        },
      });
    } catch (error: any) {
      log.error('Search context error:', error);
      log.debug(`⏱ Search context failed: ${Date.now() - t0}ms`);
      sendSSE(res, 'error', { error: error.message || 'Failed to get search context' });
      res.end();
      return;
    }

    const t1 = Date.now();
    log.debug(
      `⏱ Search context: ${t1 - t0}ms, ${searchContext?.sortedResults.length ?? 0} results`
    );

    sendSSE(res, 'search_complete', {
      message: searchContext
        ? `${searchContext.sortedResults.length} relevante Stellen gefunden`
        : '0 relevante Stellen gefunden',
      resultCount: searchContext?.sortedResults.length ?? 0,
    });

    // Handle no results case
    if (!searchContext) {
      const noResultsMessage = collectionId
        ? 'Leider konnte ich in dieser Sammlung keine passenden Stellen zu Ihrer Frage finden.'
        : 'Leider konnte ich in den verfügbaren Quellen keine passenden Informationen zu Ihrer Frage finden.';

      sendSSE(res, 'text_delta', { text: noResultsMessage });
      sendSSE(res, 'completion', {
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
      res.end();
      return;
    }

    // Determine AI provider and model
    const effectiveProvider = provider || DEFAULT_PROVIDER;
    const effectiveModel = model || DEFAULT_MODEL;

    if (!isProviderConfigured(effectiveProvider as any)) {
      sendSSE(res, 'error', { error: `Provider "${effectiveProvider}" is not configured` });
      res.end();
      return;
    }

    const aiModel = getModel(effectiveProvider as any, effectiveModel);

    // Build the AI messages
    const aiMessages: ModelMessage[] = [
      { role: 'system', content: searchContext.systemPrompt },
      ...messages.slice(0, -1), // Include conversation history except last user message
      {
        role: 'user',
        content: `Frage: ${question}\n\nVerfügbare Quellen:\n${searchContext.contextSummary}`,
      },
    ];

    const t2 = Date.now();
    log.debug(`⏱ Model setup: ${t2 - t1}ms`);

    // Stream the response
    const result = streamText({
      model: aiModel,
      messages: aiMessages,
      maxOutputTokens: 16000,
      temperature: 0.2,
      abortSignal: abortController.signal,
    });

    sendSSE(res, 'response_start', { message: 'Generiere Antwort...' });

    // Process the text stream
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
        sendSSE(res, 'text_delta', { text: chunk });
      }
    } catch (streamError: any) {
      if (abortController.signal.aborted) {
        log.debug('Notebook stream aborted by client disconnect');
        log.debug(`⏱ Total (aborted): ${Date.now() - t0}ms, ${fullText.length} chars`);
        res.end();
        return;
      }
      const t4err = Date.now();
      log.warn('Stream error (accumulated %d chars): %s', fullText.length, streamError.message);
      log.debug(
        `⏱ Streaming (error): ${t4err - (firstChunkTime || t2)}ms, ${fullText.length} chars`
      );

      // Send partial completion if we have accumulated text
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

          sendSSE(res, 'completion', {
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
          sendSSE(res, 'error', { error: streamError.message || 'Stream interrupted' });
        }
      } else {
        sendSSE(res, 'error', { error: streamError.message || 'Stream interrupted' });
      }
      log.debug(`⏱ Total (error path): ${Date.now() - t0}ms`);
      res.end();
      return;
    }

    const t4 = Date.now();
    log.debug(`⏱ Streaming: ${t4 - (firstChunkTime || t2)}ms, ${fullText.length} chars`);

    // After streaming completes, process citations and send sources
    const { renumberedDraft, newReferencesMap } = renumberCitationsInOrder(
      fullText,
      searchContext.referencesMap
    );
    const { cleanDraft, citations, sources } = validateAndInjectCitations(
      renumberedDraft,
      newReferencesMap
    );

    // Build additional sources (not cited but relevant)
    const allSources = searchContext.sortedResults
      .filter((_, i) => !citations.some((c) => c.index === String(i + 1)))
      .slice(0, 10);

    // Group sources by collection for multi-collection queries
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

    // Send the final processed data
    sendSSE(res, 'completion', {
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
      `⏱ Total: ${t6 - t0}ms (search=${t1 - t0}, setup=${t2 - t1}, ttft=${(firstChunkTime || t2) - t2}, stream=${t4 - (firstChunkTime || t2)}, cite=${t5 - t4})`
    );
    res.end();
  } catch (error: any) {
    log.error('Notebook stream error:', error);
    sendSSE(res, 'error', { error: 'Internal server error' });
    res.end();
  }
});

export default router;
