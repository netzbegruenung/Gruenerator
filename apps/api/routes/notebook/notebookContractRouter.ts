/**
 * ts-rest contract router for /api/auth/notebook (interaction routes).
 *
 * Wraps the same NotebookQAService calls as interactionController.ts using
 * a contract-driven router from @ts-rest/express.
 *
 * Mount BEFORE the legacy interactionController router in routes.ts so
 * ts-rest matches its own routes first; unmatched paths fall through to
 * the legacy router.
 *
 * ## Mixed authentication
 * This contract has 5 routes with mixed auth: 2 require auth (`askMulti`,
 * `askSingle` — both read `req.user`), 3 are public (`getFilters`, public
 * token routes). Applying `requireAuth` at the prefix would break the
 * public routes, so auth is checked per-handler here via the
 * `requireAuthUser` helper, which throws a typed 401 contract response.
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
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAIWorkerPool } from '../../utils/getAIWorkerPool.js';
import { createLogger } from '../../utils/logger.js';
import { fromParam, type NotebookId } from '../../utils/types/branded.js';
import { highlightSnippet, truncateSnippet } from '../research/researchController.js';

import type { PublicAccessRecord } from './types.js';
import type { UserProfile } from '../../services/user/types.js';
import type { Application, Request } from 'express';

const log = createLogger('notebookContractRouter');
const notebookHelper = new NotebookQdrantHelper();

const MODE_WEIGHTS: Record<'hybrid' | 'vector' | 'text', readonly [number, number]> = {
  hybrid: [0.7, 0.3],
  vector: [1.0, 0.0],
  text: [0.0, 1.0],
};

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
  | { ok: true; userId: string }
  | { ok: false; response: { status: 401; body: { error: string } } } {
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

      const filterableFields = getCollectionFilterableFields(collectionId);
      if (!filterableFields || filterableFields.length === 0) {
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
        aiWorkerPool: getAIWorkerPool(args.req),
        fastMode,
      });

      return { status: 200 as const, body: result };
    } catch (error) {
      log.error('[notebookContract.askMulti] Error:', error);
      const err = error as Error;
      return {
        status: 500 as const,
        body: { error: err.message || 'Internal server error' },
      };
    }
  },

  askSingle: async (args) => {
    const startTime = Date.now();
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
        aiWorkerPool: getAIWorkerPool(args.req),
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

      try {
        await notebookHelper.logNotebookUsage(
          collectionId,
          userId,
          question.trim(),
          (result.answer || '').length,
          Date.now() - startTime
        );
      } catch (logError) {
        log.error('[notebookContract.askSingle] Error logging usage:', logError);
      }

      return { status: 200 as const, body: result };
    } catch (error) {
      log.error('[notebookContract.askSingle] Error:', error);
      const err = error as Error;
      return {
        status: 500 as const,
        body: { error: err.message || 'Internal server error' },
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
      if (collection.user_id !== userId && collection.user_id !== 'SYSTEM') {
        return { status: 403 as const, body: { error: 'Forbidden' } };
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
          additionalFilter: {
            must: [{ key: 'collection_id', match: { value: collectionId } }],
          },
        },
      });

      const tagged = (resp.results ?? []).map((doc) => ({
        ...doc,
        collection_id: collectionId,
        collection_name: collection.name,
        published_at: doc.published_at ?? null,
      }));

      const dedupMap = new Map<string, (typeof tagged)[number]>();
      for (const r of tagged) {
        const key = r.source_url || r.document_id;
        const existing = dedupMap.get(key);
        if (!existing || r.similarity_score > existing.similarity_score) {
          dedupMap.set(key, r);
        }
      }

      let deduped = Array.from(dedupMap.values()).filter((r) => r.similarity_score >= 0.3);

      if (effectiveSort === 'date_desc') {
        deduped.sort((a, b) => {
          const dateA = a.published_at || '';
          const dateB = b.published_at || '';
          if (dateB !== dateA) return dateB.localeCompare(dateA);
          return b.similarity_score - a.similarity_score;
        });
      } else if (effectiveSort === 'date_asc') {
        deduped.sort((a, b) => {
          const dateA = a.published_at || '';
          const dateB = b.published_at || '';
          if (dateA !== dateB) return dateA.localeCompare(dateB);
          return b.similarity_score - a.similarity_score;
        });
      } else {
        deduped.sort((a, b) => b.similarity_score - a.similarity_score);
      }
      deduped = deduped.slice(0, effectiveLimit);

      const truncated = deduped.map((r) => ({
        document_id: r.document_id,
        title: r.title ?? 'Unbekanntes Dokument',
        source_url: r.source_url ?? null,
        relevant_content: highlightSnippet(r.relevant_content, trimmed),
        similarity_score: r.similarity_score,
        chunk_count: r.chunk_count,
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
    const startTime = Date.now();
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
        aiWorkerPool: getAIWorkerPool(args.req),
        getCollectionFn: async () => collection,
        getDocumentIdsFn: async (id: string) => {
          const docs = await notebookHelper.getCollectionDocuments(id);
          return docs.map((d) => d.document_id);
        },
        fastMode,
      });

      try {
        await notebookHelper.logNotebookUsage(
          collection.id,
          null,
          question.trim(),
          (result.answer || '').length,
          Date.now() - startTime
        );
      } catch (logError) {
        log.error('[notebookContract.askPublic] Error logging usage:', logError);
      }

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
        body: { error: err.message || 'Internal server error' },
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
