/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument -- TODO(follow-up): pre-existing strict-mode violations exposed by log-noise codemod */
import { Router, type Request, type Response } from 'express';

import {
  getCollectionFilterableFields,
  getCollectionDefaultFilter,
  getSystemCollectionConfig,
} from '../../config/systemCollectionsConfig.js';
import { NotebookQdrantHelper } from '../../database/services/NotebookQdrantHelper.js';
import { getQdrantInstance } from '../../database/services/QdrantService/index.js';
import { requireApiKey, assertLandesverbandAllowed } from '../../middleware/apiKeyMiddleware.js';
import { apiKeyRateLimit } from '../../middleware/apiKeyRateLimitMiddleware.js';
import { notebookQAService } from '../../services/notebook/index.js';
import { getAIWorkerPool } from '../../utils/getAIWorkerPool.js';
import { createLogger } from '../../utils/logger.js';

import {
  getSystemCollectionIdForLandesverband,
  listSupportedLandesverbaende,
} from './landesverbandMap.js';

const log = createLogger('v1.notebooks');
const notebookHelper = new NotebookQdrantHelper();

const router: Router = Router();

router.use(requireApiKey);
router.use(apiKeyRateLimit('notebooks'));

/**
 * GET /api/v1/notebooks
 * List Landesverbände this key may query.
 */
router.get('/', (req: Request, res: Response) => {
  const ctx = req.apiKey;
  if (!ctx) {
    res.status(401).json({ error: 'API key context missing' });
    return;
  }
  const all = listSupportedLandesverbaende();
  const filtered =
    ctx.scopes.landesverbaende === '*'
      ? all
      : all.filter((lv) => (ctx.scopes.landesverbaende ?? []).includes(lv.code));
  res.json({ landesverbaende: filtered });
});

/**
 * GET /api/v1/notebooks/filters?landesverband=HH
 * Facet values restricted to allowed LVs.
 */
router.get('/filters', async (req: Request, res: Response) => {
  const ctx = req.apiKey;
  if (!ctx) {
    res.status(401).json({ error: 'API key context missing' });
    return;
  }
  const lv = (req.query.landesverband as string | undefined)?.trim();
  if (!lv) {
    res.status(400).json({ error: 'landesverband query parameter required' });
    return;
  }
  const auth = assertLandesverbandAllowed(ctx, lv);
  if (!auth.ok) {
    res.status(403).json({ error: auth.reason });
    return;
  }
  const collectionId = getSystemCollectionIdForLandesverband(lv);
  if (!collectionId) {
    res.status(404).json({ error: `Unknown Landesverband: ${lv}` });
    return;
  }
  const systemConfig = getSystemCollectionConfig(collectionId);
  if (!systemConfig) {
    res.status(404).json({ error: 'System collection missing' });
    return;
  }
  const filterableFields = getCollectionFilterableFields(collectionId);
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

  try {
    const qdrant = getQdrantInstance();
    await qdrant.init();
    const filters: Record<string, unknown> = {};
    for (const field of filterableFields) {
      try {
        if (field.type === 'date_range') {
          const { min, max } = await qdrant.getDateRange(
            systemConfig.qdrantCollection,
            field.field,
            baseFilter
          );
          filters[field.field] = { label: field.label, type: field.type, min, max };
        } else {
          const values = await qdrant.getFieldValueCounts(
            systemConfig.qdrantCollection,
            field.field,
            50,
            baseFilter
          );
          filters[field.field] = { label: field.label, type: field.type, values };
        }
      } catch (e) {
        log.warn(`[v1.notebooks.filters] Failed for ${field.field}:`, e);
      }
    }
    res.json({ landesverband: lv, collectionId, filters });
  } catch (err) {
    log.error('[v1.notebooks.filters] Error:', { error: err });
    res.status(500).json({ error: 'Failed to load filters' });
  }
});

/**
 * POST /api/v1/notebooks/ask
 * body: { question, landesverband, filters?, fastMode? }
 */
router.post('/ask', async (req: Request, res: Response) => {
  const startTime = Date.now();
  const ctx = req.apiKey;
  if (!ctx) {
    res.status(401).json({ error: 'API key context missing' });
    return;
  }

  const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
  const lv = typeof req.body?.landesverband === 'string' ? req.body.landesverband.trim() : '';
  const fastMode = req.body?.fastMode === true;
  const filters = (req.body?.filters as Record<string, unknown> | undefined) ?? undefined;

  if (!question) {
    res.status(400).json({ error: 'question is required' });
    return;
  }
  if (!lv) {
    res.status(400).json({ error: 'landesverband is required' });
    return;
  }
  const auth = assertLandesverbandAllowed(ctx, lv);
  if (!auth.ok) {
    res.status(403).json({ error: auth.reason });
    return;
  }
  const collectionId = getSystemCollectionIdForLandesverband(lv);
  if (!collectionId) {
    res.status(404).json({ error: `Unknown Landesverband: ${lv}` });
    return;
  }

  try {
    const result = await notebookQAService.askSingleCollection({
      collectionId,
      question,
      userId: ctx.userId,
      requestFilters: filters,
      aiWorkerPool: getAIWorkerPool(req),
      fastMode,
    });

    notebookHelper
      .logNotebookUsage(
        collectionId,
        ctx.userId,
        question,
        (result.answer || '').length,
        Date.now() - startTime,
        { apiKeyId: ctx.id, landesverband: lv }
      )
      .catch((e) => log.warn('[v1.notebooks.ask] usage log failed:', e));

    res.json(result);
  } catch (err) {
    log.error('[v1.notebooks.ask] Error:', { error: err });
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
});

/**
 * POST /api/v1/notebooks/search
 * Raw chunks without synthesis. Body: { query, landesverband, filters? }
 */
router.post('/search', async (req: Request, res: Response) => {
  const ctx = req.apiKey;
  if (!ctx) {
    res.status(401).json({ error: 'API key context missing' });
    return;
  }

  const query = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
  const lv = typeof req.body?.landesverband === 'string' ? req.body.landesverband.trim() : '';
  const filters = (req.body?.filters as Record<string, unknown> | undefined) ?? undefined;

  if (!query) {
    res.status(400).json({ error: 'query is required' });
    return;
  }
  if (!lv) {
    res.status(400).json({ error: 'landesverband is required' });
    return;
  }
  const auth = assertLandesverbandAllowed(ctx, lv);
  if (!auth.ok) {
    res.status(403).json({ error: auth.reason });
    return;
  }
  const collectionId = getSystemCollectionIdForLandesverband(lv);
  if (!collectionId) {
    res.status(404).json({ error: `Unknown Landesverband: ${lv}` });
    return;
  }

  try {
    // Reuse the QA pipeline in fast mode and return only sources/citations.
    // Keeps a single code path for retrieval — partner-side re-synthesis works
    // off the same chunks that /ask would synthesize from.
    const result = await notebookQAService.askSingleCollection({
      collectionId,
      question: query,
      userId: ctx.userId,
      requestFilters: filters,
      aiWorkerPool: getAIWorkerPool(req),
      fastMode: true,
    });

    res.json({
      query,
      landesverband: lv,
      sources: result.sources ?? [],
      citations: result.citations ?? [],
    });
  } catch (err) {
    log.error('[v1.notebooks.search] Error:', { error: err });
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
});

export default router;
