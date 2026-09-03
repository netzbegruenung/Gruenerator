/**
 * ts-rest contract router for /api/auth/notebook (interaction routes).
 *
 * Contract-driven router from @ts-rest/express wrapping NotebookQAService
 * plus the recent-documents and statistics services. Sole handler for these
 * routes (the legacy interactionController, recentDocumentsController and
 * statisticsController have been removed).
 *
 * ## Mixed authentication
 * Routes have mixed auth: `askMulti`/`askSingle` require auth (both read
 * `req.user`); `getFilters`, recent/stats and the public token routes do
 * not. Applying `requireAuth` at the prefix would break the public routes,
 * so auth is checked per-handler here via the `requireAuthUser` helper,
 * which returns a typed 401 contract response.
 */

import { notebookContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import {
  getSystemCollectionConfig,
  getCollectionFilterableFields,
  getCollectionDefaultFilter,
  getDefaultMultiCollectionIds,
} from '../../config/systemCollectionsConfig.js';
import { NotebookQdrantHelper } from '../../database/services/NotebookQdrantHelper.js';
import { getQdrantInstance } from '../../database/services/QdrantService/index.js';
import { getQdrantDocumentService } from '../../services/document-services/index.js';
import { notebookQAService } from '../../services/notebook/index.js';
import {
  byPublishedAtDesc,
  dedupeByUrlOrTitle,
  fetchRecentForCollection,
  normalizeRecentLimit,
} from '../../services/notebook/notebookRecentService.js';
import { getNotebookStats } from '../../services/notebook/notebookStatsService.js';
import { rankManualSearchResults } from '../../services/search/manualSearchRanking.js';
import { recordItemUsageSafe } from '../../services/usage/ItemUsageService.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { toUserFacingMessage } from '../../utils/errors/index.js';
import { createLogger } from '../../utils/logger.js';
import { fromParam, type NotebookId } from '../../utils/types/branded.js';
import { highlightSnippet, truncateSnippet } from '../research/researchController.js';

import { requireNotebookRead } from './notebookAccess.js';

import type { PublicAccessRecord } from './types.js';
import type { UserProfile } from '../../services/user/types.js';
import type { Application, Request } from 'express';

const log = createLogger('notebookContractRouter');
const notebookHelper = new NotebookQdrantHelper();

// Initialize system collections on startup (relocated from the deleted
// legacy interactionController — this is the only call site).
void (async () => {
  try {
    await notebookHelper.ensureSystemGrundsatzCollection();
    log.debug('System collections initialized');
  } catch (error) {
    log.error('Failed to initialize system collections:', error);
  }
})();

const MODE_WEIGHTS: Record<'hybrid' | 'vector' | 'text', readonly [number, number]> = {
  hybrid: [0.7, 0.3],
  vector: [1.0, 0.0],
  text: [0.0, 1.0],
};

/** Documents below this aggregated score never reach the result list. */
const USER_NOTEBOOK_MIN_SCORE = 0.3;

/**
 * Extract the authenticated user id or return a 401 contract response.
 * Used by `askMulti` / `askSingle` where req.user is required.
 *
 * Returns either `{ ok: true, userId }` or `{ ok: false, response }`.
 * Callers should early-return the response on failure.
 */
function requireAuthUser(
  req: Request
):
  { ok: true; userId: string } | { ok: false; response: { status: 401; body: { error: string } } } {
  const user = req.user as UserProfile | undefined;
  if (!user?.id) {
    return {
      ok: false,
      response: { status: 401, body: { error: 'Authentication required' } },
    };
  }
  return { ok: true, userId: user.id };
}

const s = initServer();

export const notebookContractRouter = s.router(notebookContract, {
  getFilters: async (args) => {
    try {
      const collectionId = args.params.id;
      const systemConfig = getSystemCollectionConfig(collectionId);

      if (!systemConfig) {
        return {
          status: 200 as const,
          body: { collectionId, collectionName: null, filters: {} },
        };
      }

      // `researchOnly` facets (persons) belong to the manual research surface,
      // which reads them from `research.filters`. This endpoint only feeds the
      // notebook chat.
      const filterableFields = getCollectionFilterableFields(collectionId).filter(
        (field) => !field.researchOnly
      );
      if (filterableFields.length === 0) {
        return {
          status: 200 as const,
          body: { collectionId, collectionName: systemConfig.name, filters: {} },
        };
      }

      const qdrant = getQdrantInstance();
      await qdrant.init();

      const defaultFilter = getCollectionDefaultFilter(collectionId);
      const baseFilter = defaultFilter
        ? {
            must: [
              {
                key: defaultFilter.field,
                match: Array.isArray(defaultFilter.value)
                  ? { any: defaultFilter.value }
                  : { value: defaultFilter.value },
              },
            ],
          }
        : null;

      const filters: Record<
        string,
        {
          label: string;
          type: string;
          values?: Array<{ value: string; count: number }>;
          valueLabels?: Record<string, string>;
          min?: string;
          max?: string;
        }
      > = {};

      for (const field of filterableFields) {
        try {
          const fieldType = field.type as string;
          if (fieldType === 'date_range') {
            const { min, max } = await qdrant.getDateRange(
              systemConfig.qdrantCollection,
              field.field,
              baseFilter
            );
            filters[field.field] = {
              label: field.label,
              type: fieldType,
              ...(min != null && { min }),
              ...(max != null && { max }),
            };
          } else {
            const valuesWithCounts = await qdrant.getFieldValueCounts(
              systemConfig.qdrantCollection,
              field.field,
              50,
              baseFilter
            );
            filters[field.field] = {
              label: field.label,
              type: fieldType,
              values: valuesWithCounts,
              ...(field.valueLabels ? { valueLabels: field.valueLabels } : {}),
            };
          }
        } catch (fieldError) {
          const err = fieldError as Error;
          log.warn(`[notebookContract.getFilters] Failed for ${field.field}:`, err.message);
          filters[field.field] = { label: field.label, type: field.type, values: [] };
        }
      }

      return {
        status: 200 as const,
        body: { collectionId, collectionName: systemConfig.name, filters },
      };
    } catch (error) {
      log.error('[notebookContract.getFilters] Error:', error);
      return {
        status: 500 as const,
        body: { error: 'Failed to get collection filters' },
      };
    }
  },

  askMulti: async (args) => {
    try {
      const auth = requireAuthUser(args.req);
      if (!auth.ok) return auth.response;

      const question = args.body.question;
      const collectionIds = args.body.collectionIds ?? undefined;
      const filters = args.body.filters ?? undefined;
      const fastMode = args.body.fastMode ?? false;

      if (!question.trim()) {
        return { status: 400 as const, body: { error: 'Question is required' } };
      }

      const result = await notebookQAService.askMultiCollection({
        question,
        collectionIds: collectionIds || getDefaultMultiCollectionIds(),
        requestFilters: filters,
        fastMode,
      });

      // Track usage only for explicitly-selected collections (fire-and-forget);
      // recording the default set would pollute every user's ordering.
      if (collectionIds) {
        for (const id of collectionIds) {
          recordItemUsageSafe(auth.userId, 'notebook', id as string);
        }
      }

      return { status: 200 as const, body: result };
    } catch (error) {
      log.error('[notebookContract.askMulti] Error:', error);
      const err = error as Error;
      return {
        status: 500 as const,
        body: { error: toUserFacingMessage(err) || 'Internal server error' },
      };
    }
  },

  askSingle: async (args) => {
    try {
      const auth = requireAuthUser(args.req);
      if (!auth.ok) return auth.response;
      const userId = auth.userId;

      const collectionId = fromParam<NotebookId>(args.params.id);
      const question = args.body.question;
      const filters = args.body.filters ?? undefined;
      const fastMode = args.body.fastMode ?? false;

      if (!question.trim()) {
        return { status: 400 as const, body: { error: 'Question is required' } };
      }

      const result = await notebookQAService.askSingleCollection({
        collectionId,
        question,
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
        fastMode,
      });

      // Track usage for "favourites first" ordering (fire-and-forget).
      recordItemUsageSafe(userId, 'notebook', collectionId as string);

      return { status: 200 as const, body: result };
    } catch (error) {
      log.error('[notebookContract.askSingle] Error:', error);
      const err = error as Error;
      return {
        status: 500 as const,
        body: { error: toUserFacingMessage(err) || 'Internal server error' },
      };
    }
  },

  researchSearch: async (args) => {
    const startTime = Date.now();
    try {
      const auth = requireAuthUser(args.req);
      if (!auth.ok) return auth.response;
      const userId = auth.userId;

      const collectionId = fromParam<NotebookId>(args.params.id);
      const { query, limit, mode, sortBy } = args.body;
      const trimmed = (query || '').trim();
      if (trimmed.length < 2) {
        return { status: 400 as const, body: { error: 'Query must be at least 2 characters.' } };
      }

      if (getSystemCollectionConfig(collectionId)) {
        return {
          status: 400 as const,
          body: { error: 'Use /research/search for system collections.' },
        };
      }

      const collection = await notebookHelper.getNotebookCollection(collectionId);
      if (!collection) {
        return { status: 404 as const, body: { error: 'Notebook not found' } };
      }
      if (collection.user_id !== 'SYSTEM') {
        const guard = await requireNotebookRead(collectionId, userId);
        if (guard) return guard;
      }

      // Resolve notebook → document IDs via the n:m join collection. Chunks
      // in the `documents` Qdrant collection are NOT tagged with collection_id
      // (membership lives in `notebook_collection_documents`), so filtering on
      // a `collection_id` payload field on chunks returns zero results.
      const collectionDocs = await notebookHelper.getCollectionDocuments(collectionId);
      const documentIds = collectionDocs.map((d) => d.document_id);

      if (documentIds.length === 0) {
        return {
          status: 200 as const,
          body: {
            results: [],
            metadata: {
              totalResults: 0,
              collections: [collectionId as string],
              timeMs: Date.now() - startTime,
            },
          },
        };
      }

      const effectiveLimit = Math.min(Math.max(limit ?? 30, 1), 100);
      const effectiveMode = mode ?? 'hybrid';
      const effectiveSort = sortBy ?? 'relevance';
      const [vectorWeight, textWeight] = MODE_WEIGHTS[effectiveMode];

      const documentSearchService = getQdrantDocumentService();
      const resp = await documentSearchService.search({
        query: trimmed,
        userId,
        options: {
          limit: 60,
          mode: effectiveMode === 'text' ? 'text' : 'hybrid',
          vectorWeight,
          textWeight,
          threshold: 0.2,
          searchCollection: 'documents',
        },
        filters: { documentIds },
      });

      const tagged = (resp.results ?? []).map((doc) => ({
        ...doc,
        collection_id: collectionId,
        collection_name: collection.name,
        published_at: doc.published_at ?? null,
      }));

      const deduped = rankManualSearchResults({
        results: tagged,
        sortBy: effectiveSort,
        limit: effectiveLimit,
        minScore: USER_NOTEBOOK_MIN_SCORE,
      });

      const truncated = deduped.map((r) => ({
        document_id: r.document_id,
        title: r.title ?? 'Unbekanntes Dokument',
        source_url: r.source_url ?? null,
        relevant_content: highlightSnippet(r.relevant_content, trimmed),
        similarity_score: r.similarity_score,
        chunk_count: r.chunk_count,
        term_chunk_count: r.term_chunk_count,
        top_chunks: (r.top_chunks ?? []).map((c) => ({
          preview: truncateSnippet(c.preview, 200),
          chunk_index: c.chunk_index,
          page_number: c.page_number ?? null,
        })),
        collection_id: r.collection_id,
        collection_name: r.collection_name,
        published_at: r.published_at ?? null,
      }));

      return {
        status: 200 as const,
        body: {
          results: truncated,
          metadata: {
            totalResults: truncated.length,
            collections: [collectionId as string],
            timeMs: Date.now() - startTime,
          },
        },
      };
    } catch (error) {
      log.error('[notebookContract.researchSearch] Error:', error);
      return { status: 500 as const, body: { error: 'Search failed. Please try again.' } };
    }
  },

  getCollectionRecent: async (args) => {
    const collectionId = args.params.id;
    const limit = normalizeRecentLimit(args.query.limit);

    const cards = await fetchRecentForCollection(collectionId, limit);
    return { status: 200 as const, body: { collectionId, items: cards } };
  },

  getRecent: async (args) => {
    const collectionIds = args.query.collections
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (collectionIds.length === 0) {
      return { status: 200 as const, body: { items: [] } };
    }

    const limit = normalizeRecentLimit(args.query.limit);
    const perCollection = Math.max(Math.ceil((limit * 2) / collectionIds.length), 4);

    const results = await Promise.all(
      collectionIds.map((id) => fetchRecentForCollection(id, perCollection))
    );

    const merged = results.flat().sort(byPublishedAtDesc);
    const unique = dedupeByUrlOrTitle(merged).slice(0, limit);
    return { status: 200 as const, body: { items: unique } };
  },

  getCollectionStats: async (args) => {
    const collectionId = args.params.id;
    const refresh = args.query.refresh === '1' || args.query.refresh === 'true';
    try {
      const stats = await getNotebookStats([collectionId], { refresh });
      return { status: 200 as const, body: stats };
    } catch (error) {
      log.error(`[notebookContract.getCollectionStats] stats failed for ${collectionId}:`, error);
      return { status: 500 as const, body: { error: 'stats_failed' } };
    }
  },

  getStats: async (args) => {
    const collectionIds = args.query.collections
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const refresh = args.query.refresh === '1' || args.query.refresh === 'true';

    try {
      // getNotebookStats returns the empty-stats shape for an empty id list.
      const stats = await getNotebookStats(collectionIds, { refresh });
      return { status: 200 as const, body: stats };
    } catch (error) {
      log.error(`[notebookContract.getStats] stats failed for ${collectionIds.join(',')}:`, error);
      return { status: 500 as const, body: { error: 'stats_failed' } };
    }
  },

  getPublic: async (args) => {
    try {
      const accessToken = args.params.token;
      const publicAccess = (await notebookHelper.getPublicAccess(
        accessToken
      )) as PublicAccessRecord | null;

      if (!publicAccess) {
        return {
          status: 404 as const,
          body: { error: 'Public Notebook not found or access token invalid' },
        };
      }
      if (publicAccess.expires_at && new Date(publicAccess.expires_at) < new Date()) {
        return { status: 403 as const, body: { error: 'Public access has expired' } };
      }
      if (!publicAccess.is_active) {
        return {
          status: 403 as const,
          body: { error: 'This Notebook collection is no longer public' },
        };
      }

      const collection = await notebookHelper.getNotebookCollection(publicAccess.collection_id);
      if (!collection) {
        return { status: 404 as const, body: { error: 'Notebook collection not found' } };
      }

      return {
        status: 200 as const,
        body: {
          collection: {
            id: collection.id,
            name: collection.name,
            description: collection.description ?? null,
          },
          message: 'Public Notebook collection found',
        },
      };
    } catch (error) {
      log.error('[notebookContract.getPublic] Error:', error);
      return { status: 500 as const, body: { error: 'Internal server error' } };
    }
  },

  askPublic: async (args) => {
    try {
      const accessToken = args.params.token;
      const question = args.body.question;
      const filters = args.body.filters ?? undefined;
      const fastMode = args.body.fastMode ?? false;

      if (!question.trim()) {
        return { status: 400 as const, body: { error: 'Question is required' } };
      }

      const publicAccess = (await notebookHelper.getPublicAccess(
        accessToken
      )) as PublicAccessRecord | null;
      if (!publicAccess) {
        return {
          status: 404 as const,
          body: { error: 'Public Notebook not found or access token invalid' },
        };
      }
      if (publicAccess.expires_at && new Date(publicAccess.expires_at) < new Date()) {
        return { status: 403 as const, body: { error: 'Public access has expired' } };
      }
      if (!publicAccess.is_active) {
        return {
          status: 403 as const,
          body: { error: 'This Notebook collection is no longer public' },
        };
      }

      const collection = await notebookHelper.getNotebookCollection(publicAccess.collection_id);
      if (!collection) {
        return { status: 404 as const, body: { error: 'Notebook collection not found' } };
      }

      const result = await notebookQAService.askSingleCollection({
        collectionId: collection.id,
        question,
        userId: collection.user_id,
        requestFilters: filters,
        getCollectionFn: async () => collection,
        getDocumentIdsFn: async (id: string) => {
          const docs = await notebookHelper.getCollectionDocuments(id);
          return docs.map((d) => d.document_id);
        },
        fastMode,
      });

      return {
        status: 200 as const,
        body: {
          ...result,
          metadata: { ...result.metadata, is_public: true },
        },
      };
    } catch (error) {
      log.error('[notebookContract.askPublic] Error:', error);
      const err = error as Error;
      return {
        status: 500 as const,
        body: { error: toUserFacingMessage(err) || 'Internal server error' },
      };
    }
  },
});

/**
 * Mount the ts-rest notebook contract router onto an Express app.
 * Call this from routes.ts BEFORE mounting the legacy interaction router.
 *
 * NO `requireAuth` middleware at the prefix — this contract mixes auth'd
 * and public routes, and each handler enforces auth individually via
 * `requireAuthUser()`.
 */
export function mountNotebookContractRouter(app: Application): void {
  createExpressEndpoints(notebookContract, notebookContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'notebookContract'),
  });
}
