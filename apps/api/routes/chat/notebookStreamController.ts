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

import express from 'express';
import { streamText, ModelMessage } from 'ai';
import { createAuthenticatedRouter } from '../../utils/keycloak/index.js';
import { getModel, isProviderConfigured } from './agents/providers.js';
import { notebookQAService } from '../../services/notebook/index.js';
import { createLogger } from '../../utils/logger.js';
import {
  renumberCitationsInOrder,
  validateAndInjectCitations,
  groupSourcesByCollection,
} from '../../services/search/index.js';
import { SYSTEM_COLLECTIONS, getSystemCollectionConfig } from '../../config/systemCollectionsConfig.js';
import { NotebookQdrantHelper } from '../../database/services/NotebookQdrantHelper.js';
import type { UserProfile } from '../../services/user/types.js';
import type { SearchContext } from '../../services/notebook/types.js';

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

    // Get search context (vector search + context building)
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
      sendSSE(res, 'error', { error: error.message || 'Failed to get search context' });
      res.end();
      return;
    }

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

    // Stream the response
    const result = streamText({
      model: aiModel,
      messages: aiMessages,
      maxOutputTokens: 2500,
      temperature: 0.2,
    });

    // Process the text stream
    let fullText = '';

    try {
      for await (const chunk of result.textStream) {
        fullText += chunk;
        sendSSE(res, 'text_delta', { text: chunk });
      }
    } catch (streamError: any) {
      log.error('Stream error:', streamError);
      sendSSE(res, 'error', { error: 'Stream interrupted' });
      res.end();
      return;
    }

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

    log.debug(`Notebook stream finished, text length: ${cleanDraft.length}`);
    res.end();
  } catch (error: any) {
    log.error('Notebook stream error:', error);
    sendSSE(res, 'error', { error: 'Internal server error' });
    res.end();
  }
});

export default router;
