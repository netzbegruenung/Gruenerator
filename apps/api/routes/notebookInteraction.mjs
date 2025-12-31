/**
 * Notebook QA Interaction Routes
 *
 * Thin route handlers that delegate to NotebookQAService.
 * Handles authentication, request validation, and response formatting.
 */

import express from 'express';
import { getPostgresInstance } from '../database/services/PostgresService.js';
import { NotebookQdrantHelper } from '../database/services/NotebookQdrantHelper.js';
import authMiddleware from '../middleware/authMiddleware.js';
const { requireAuth } = authMiddleware;
import { notebookQAService } from '../services/NotebookQAService.js';
import { createLogger } from '../utils/logger.js';
import {
    getSystemCollectionConfig,
    getCollectionFilterableFields,
    getDefaultMultiCollectionIds
} from '../config/systemCollectionsConfig.js';
import { getQdrantInstance } from '../database/services/QdrantService.js';

const log = createLogger('notebookInteraction');
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

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/qa/collections/:id/filters - Get available filter values for a system collection
// ─────────────────────────────────────────────────────────────────────────────
router.get('/collections/:id/filters', async (req, res) => {
    try {
        const collectionId = req.params.id;
        const systemConfig = getSystemCollectionConfig(collectionId);

        if (!systemConfig) {
            return res.status(404).json({ error: 'System collection not found' });
        }

        const filterableFields = getCollectionFilterableFields(collectionId);

        if (!filterableFields || filterableFields.length === 0) {
            return res.json({
                collectionId,
                collectionName: systemConfig.name,
                filters: {}
            });
        }

        const qdrant = getQdrantInstance();
        await qdrant.init();

        const filters = {};

        for (const field of filterableFields) {
            try {
                if (field.type === 'date_range') {
                    const { min, max } = await qdrant.getDateRange(
                        systemConfig.qdrantCollection,
                        field.field
                    );
                    filters[field.field] = {
                        label: field.label,
                        type: field.type,
                        min,
                        max
                    };
                } else {
                    const valuesWithCounts = await qdrant.getFieldValueCounts(
                        systemConfig.qdrantCollection,
                        field.field,
                        50
                    );
                    filters[field.field] = {
                        label: field.label,
                        type: field.type,
                        values: valuesWithCounts
                    };
                }
            } catch (fieldError) {
                log.warn(`[QA Filters] Failed to get values for ${field.field}:`, fieldError.message);
                filters[field.field] = {
                    label: field.label,
                    type: field.type,
                    values: []
                };
            }
        }

        res.json({
            collectionId,
            collectionName: systemConfig.name,
            filters
        });

    } catch (error) {
        log.error('[QA Filters] Error getting collection filters:', error);
        res.status(500).json({ error: 'Failed to get collection filters' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/qa/multi/ask - Submit question to multiple collections
// ─────────────────────────────────────────────────────────────────────────────
router.post('/multi/ask', requireAuth, async (req, res) => {
    try {
        const { question, collectionIds, filters } = req.body;

        if (!question || !question.trim()) {
            return res.status(400).json({ error: 'Question is required' });
        }

        const result = await notebookQAService.askMultiCollection({
            question,
            collectionIds: collectionIds || getDefaultMultiCollectionIds(),
            requestFilters: filters,
            aiWorkerPool: req.app.locals.aiWorkerPool
        });

        res.json(result);

    } catch (error) {
        log.error('[QA Multi] Error:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/qa/:id/ask - Submit question to single collection
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:id/ask', requireAuth, async (req, res) => {
    const startTime = Date.now();

    try {
        const userId = req.user.id;
        const collectionId = req.params.id;
        const { question, filters } = req.body;

        if (!question || !question.trim()) {
            return res.status(400).json({ error: 'Question is required' });
        }

        const result = await notebookQAService.askSingleCollection({
            collectionId,
            question,
            userId,
            requestFilters: filters,
            aiWorkerPool: req.app.locals.aiWorkerPool,
            // Provide functions for user collection lookup
            getCollectionFn: async (id) => {
                const systemConfig = getSystemCollectionConfig(id);
                if (systemConfig) return null; // Handled by service
                return await notebookHelper.getNotebookCollection(id);
            },
            getDocumentIdsFn: async (id) => {
                const docs = await notebookHelper.getCollectionDocuments(id);
                return docs.map(d => d.document_id);
            }
        });

        // Log the interaction
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

        res.json(result);

    } catch (error) {
        log.error('[QA Interaction] Error in POST /:id/ask:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/qa/public/:token - Public Notebook access (no auth)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/public/:token', async (req, res) => {
    try {
        const accessToken = req.params.token;
        const publicAccess = await notebookHelper.getPublicAccess(accessToken);

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

        res.json({
            collection: {
                id: collection.id,
                name: collection.name,
                description: collection.description
            },
            message: 'Public Notebook collection found'
        });

    } catch (error) {
        log.error('[QA Public] Error in GET /public/:token:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/qa/public/:token/ask - Ask question to public Notebook (no auth)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/public/:token/ask', async (req, res) => {
    const startTime = Date.now();

    try {
        const accessToken = req.params.token;
        const { question, filters } = req.body;

        if (!question || !question.trim()) {
            return res.status(400).json({ error: 'Question is required' });
        }

        // Verify public access
        const publicAccess = await notebookHelper.getPublicAccess(accessToken);

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

        const result = await notebookQAService.askSingleCollection({
            collectionId: collection.id,
            question,
            userId: collection.user_id,
            requestFilters: filters,
            aiWorkerPool: req.app.locals.aiWorkerPool,
            getCollectionFn: async () => collection,
            getDocumentIdsFn: async (id) => {
                const docs = await notebookHelper.getCollectionDocuments(id);
                return docs.map(d => d.document_id);
            }
        });

        // Log the public interaction
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

        res.json({
            ...result,
            metadata: {
                ...result.metadata,
                is_public: true
            }
        });

    } catch (error) {
        log.error('[QA Public] Error in POST /public/:token/ask:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});

export default router;
