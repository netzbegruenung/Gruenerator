/**
 * Notebook QA Interaction Controller
 *
 * Thin route handlers that delegate to NotebookQAService.
 * Handles authentication, request validation, and response formatting.
 */

import express, { type Response, type Request } from 'express';

import {
  getSystemCollectionConfig,
  getCollectionFilterableFields,
  getCollectionDefaultFilter,
  getDefaultMultiCollectionIds,
} from '../../config/systemCollectionsConfig.js';
import { NotebookQdrantHelper } from '../../database/services/NotebookQdrantHelper.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { getQdrantInstance } from '../../database/services/QdrantService/index.js';
import authMiddleware from '../../middleware/authMiddleware.js';
import { notebookQAService } from '../../services/notebook/index.js';
import { createLogger } from '../../utils/logger.js';

import type { NotebookRequest, AskQuestionBody, PublicAccessRecord } from './types.js';
import type { AuthenticatedRequest } from '../../middleware/types.js';

const log = createLogger('notebookInteraction');
const { requireAuth } = authMiddleware;

const router = express.Router();
const postgres = getPostgresInstance();
const notebookHelper = new NotebookQdrantHelper();

// Initialize system collections on startup
(async () => {
  try {
    await notebookHelper.ensureSystemGrundsatzCollection();
    log.debug('[QA Interaction] System collections initialized');
  } catch (error) {
    log.error('[QA Interaction] Failed to initialize system collections:', error);
  }
})();

// =============================================================================
// Filter Routes
// =============================================================================

/**
 * GET /api/qa/collections/:id/filters
 * Get available filter values for a system collection
 */
router.get('/collections/:id/filters', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const collectionId = req.params.id;
    const systemConfig = getSystemCollectionConfig(collectionId);

    if (!systemConfig) {
      // User collections don't have filterable fields — return empty filters
      // instead of 404 to avoid noisy errors in the frontend
      return res.json({
        collectionId,
        collectionName: null,
        filters: {},
      });
    }

    const filterableFields = getCollectionFilterableFields(collectionId);

    if (!filterableFields || filterableFields.length === 0) {
      return res.json({
        collectionId,
        collectionName: systemConfig.name,
        filters: {},
      });
    }

    const qdrant = getQdrantInstance();
    await qdrant.init();

    // Build a base filter from the collection's defaultFilter (e.g., landesverband: 'HH' for Hamburg)
    // This ensures filter dropdowns only show values relevant to this specific collection,
    // not values from other collections sharing the same Qdrant collection.
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
            min: min ?? undefined,
            max: max ?? undefined,
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
          };
        }
      } catch (fieldError) {
        const err = fieldError as Error;
        log.warn(`[QA Filters] Failed to get values for ${field.field}:`, err.message);
        filters[field.field] = {
          label: field.label,
          type: field.type,
          values: [],
        };
      }
    }

    return res.json({
      collectionId,
      collectionName: systemConfig.name,
      filters,
    });
  } catch (error) {
    log.error('[QA Filters] Error getting collection filters:', error);
    return res.status(500).json({ error: 'Failed to get collection filters' });
  }
});

// =============================================================================
// Multi-Collection QA Routes
// =============================================================================

/**
 * POST /api/qa/multi/ask
 * Submit question to multiple collections
 */
router.post('/multi/ask', requireAuth, async (req: NotebookRequest, res: Response) => {
  try {
    const { question, collectionIds, filters, fastMode } = req.body as AskQuestionBody;

    if (!question || !question.trim()) {
      return res.status(400).json({ error: 'Question is required' });
    }

    const result = await notebookQAService.askMultiCollection({
      question,
      collectionIds: collectionIds || getDefaultMultiCollectionIds(),
      requestFilters: filters,
      aiWorkerPool: req.app.locals.aiWorkerPool,
      fastMode: fastMode || false,
    });

    return res.json(result);
  } catch (error) {
    log.error('[QA Multi] Error:', error);
    const err = error as Error;
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// =============================================================================
// Single Collection QA Routes
// =============================================================================

/**
 * POST /api/qa/:id/ask
 * Submit question to single collection
 */
router.post(
  '/:id/ask',
  requireAuth,
  async (req: NotebookRequest<{ id: string }>, res: Response) => {
    const startTime = Date.now();

    try {
      const userId = req.user!.id;
      const collectionId = req.params.id;
      const { question, filters, fastMode } = req.body as AskQuestionBody;

      if (!question || !question.trim()) {
        return res.status(400).json({ error: 'Question is required' });
      }

      const result = await notebookQAService.askSingleCollection({
        collectionId,
        question,
        userId,
        requestFilters: filters,
        aiWorkerPool: req.app.locals.aiWorkerPool,
        getCollectionFn: async (id: string) => {
          const systemConfig = getSystemCollectionConfig(id);
          if (systemConfig) return null;
          return await notebookHelper.getNotebookCollection(id);
        },
        getDocumentIdsFn: async (id: string) => {
          const docs = await notebookHelper.getCollectionDocuments(id);
          return docs.map((d) => d.document_id);
        },
        fastMode: fastMode || false,
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
        log.error('[QA Interaction] Error logging usage:', logError);
      }

      return res.json(result);
    } catch (error) {
      log.error('[QA Interaction] Error in POST /:id/ask:', error);
      const err = error as Error;
      return res.status(500).json({ error: err.message || 'Internal server error' });
    }
  }
);

// =============================================================================
// Public Access Routes
// =============================================================================

/**
 * GET /api/qa/public/:token
 * Public Notebook access (no auth)
 */
router.get('/public/:token', async (req: Request<{ token: string }>, res: Response) => {
  try {
    const accessToken = req.params.token;
    const publicAccess = (await notebookHelper.getPublicAccess(
      accessToken
    )) as PublicAccessRecord | null;

    if (!publicAccess) {
      return res.status(404).json({ error: 'Public Notebook not found or access token invalid' });
    }

    if (publicAccess.expires_at && new Date(publicAccess.expires_at) < new Date()) {
      return res.status(403).json({ error: 'Public access has expired' });
    }

    if (!publicAccess.is_active) {
      return res.status(403).json({ error: 'This Notebook collection is no longer public' });
    }

    const collection = await notebookHelper.getNotebookCollection(publicAccess.collection_id);
    if (!collection) {
      return res.status(404).json({ error: 'Notebook collection not found' });
    }

    return res.json({
      collection: {
        id: collection.id,
        name: collection.name,
        description: collection.description,
      },
      message: 'Public Notebook collection found',
    });
  } catch (error) {
    log.error('[QA Public] Error in GET /public/:token:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/qa/public/:token/ask
 * Ask question to public Notebook (no auth)
 */
router.post('/public/:token/ask', async (req: Request<{ token: string }>, res: Response) => {
  const startTime = Date.now();

  try {
    const accessToken = req.params.token;
    const { question, filters, fastMode } = req.body as AskQuestionBody;

    if (!question || !question.trim()) {
      return res.status(400).json({ error: 'Question is required' });
    }

    const publicAccess = (await notebookHelper.getPublicAccess(
      accessToken
    )) as PublicAccessRecord | null;

    if (!publicAccess) {
      return res.status(404).json({ error: 'Public Notebook not found or access token invalid' });
    }

    if (publicAccess.expires_at && new Date(publicAccess.expires_at) < new Date()) {
      return res.status(403).json({ error: 'Public access has expired' });
    }

    if (!publicAccess.is_active) {
      return res.status(403).json({ error: 'This Notebook collection is no longer public' });
    }

    const collection = await notebookHelper.getNotebookCollection(publicAccess.collection_id);
    if (!collection) {
      return res.status(404).json({ error: 'Notebook collection not found' });
    }

    const notebookReq = req as unknown as NotebookRequest;
    const result = await notebookQAService.askSingleCollection({
      collectionId: collection.id,
      question,
      userId: collection.user_id,
      requestFilters: filters,
      aiWorkerPool: notebookReq.app.locals.aiWorkerPool,
      getCollectionFn: async () => collection,
      getDocumentIdsFn: async (id: string) => {
        const docs = await notebookHelper.getCollectionDocuments(id);
        return docs.map((d) => d.document_id);
      },
      fastMode: fastMode || false,
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
      log.error('[QA Public] Error logging usage:', logError);
    }

    return res.json({
      ...result,
      metadata: {
        ...result.metadata,
        is_public: true,
      },
    });
  } catch (error) {
    log.error('[QA Public] Error in POST /public/:token/ask:', error);
    const err = error as Error;
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

export default router;
