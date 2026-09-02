import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { requireApiKey } from '../../middleware/apiKeyMiddleware.js';
import { apiKeyRateLimit } from '../../middleware/apiKeyRateLimitMiddleware.js';
import { validateBody, type TypedRequest } from '../../middleware/validateBody.js';
import { notebookQAService } from '../../services/notebook/index.js';
import { createLogger } from '../../utils/logger.js';

import {
  listAllowedLandesverbaende,
  loadLandesverbandFilters,
  resolveLandesverband,
  searchLandesverbandChunks,
} from './landesverbandNotebooks.js';

const log = createLogger('v1.notebooks');

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
  res.json({ landesverbaende: listAllowedLandesverbaende(ctx.scopes.landesverbaende) });
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
  const resolved = resolveLandesverband(ctx.scopes.landesverbaende, lv);
  if (!resolved.ok) {
    res.status(resolved.status).json({ error: resolved.reason });
    return;
  }

  try {
    const filters = await loadLandesverbandFilters(resolved.collectionId);
    res.json({ landesverband: lv, collectionId: resolved.collectionId, filters });
  } catch (err) {
    log.error('[v1.notebooks.filters] Error:', err);
    res.status(500).json({ error: 'Failed to load filters' });
  }
});

/**
 * POST /api/v1/notebooks/ask
 */
const askRequestSchema = z.object({
  question: z.string().trim().min(1, 'question is required'),
  landesverband: z.string().trim().min(1, 'landesverband is required'),
  filters: z.record(z.string(), z.unknown()).optional(),
  fastMode: z.boolean().default(false),
});
type AskRequestBody = z.infer<typeof askRequestSchema>;

router.post(
  '/ask',
  validateBody(askRequestSchema),
  async (req: TypedRequest<AskRequestBody>, res: Response) => {
    const ctx = req.apiKey;
    if (!ctx) {
      res.status(401).json({ error: 'API key context missing' });
      return;
    }

    const { question, landesverband: lv, fastMode, filters } = req.body;

    const resolved = resolveLandesverband(ctx.scopes.landesverbaende, lv);
    if (!resolved.ok) {
      res.status(resolved.status).json({ error: resolved.reason });
      return;
    }
    const { collectionId } = resolved;

    try {
      const result = await notebookQAService.askSingleCollection({
        collectionId,
        question,
        userId: ctx.userId,
        requestFilters: filters,
        fastMode,
      });

      res.json(result);
    } catch (err) {
      log.error('[v1.notebooks.ask] Error:', err);
      const message = err instanceof Error ? err.message : 'Internal server error';
      res.status(500).json({ error: message });
    }
  }
);

/**
 * POST /api/v1/notebooks/search
 * Raw chunks without synthesis.
 */
const searchRequestSchema = z.object({
  query: z.string().trim().min(1, 'query is required'),
  landesverband: z.string().trim().min(1, 'landesverband is required'),
  filters: z.record(z.string(), z.unknown()).optional(),
});
type SearchRequestBody = z.infer<typeof searchRequestSchema>;

router.post(
  '/search',
  validateBody(searchRequestSchema),
  async (req: TypedRequest<SearchRequestBody>, res: Response) => {
    const ctx = req.apiKey;
    if (!ctx) {
      res.status(401).json({ error: 'API key context missing' });
      return;
    }

    const { query, landesverband: lv, filters } = req.body;

    const resolved = resolveLandesverband(ctx.scopes.landesverbaende, lv);
    if (!resolved.ok) {
      res.status(resolved.status).json({ error: resolved.reason });
      return;
    }
    const { collectionId } = resolved;

    try {
      // Nur die Abrufhälfte der QA-Pipeline — dieselben Chunks, aus denen /ask
      // seine Antwort baut, ohne den Modellaufruf.
      //
      // Vorher lief hier `askSingleCollection({ fastMode: true })`, und dessen
      // Zweig verlässt die Funktion mit `citations: []` und `sources: []` („Fast
      // mode: skip citation processing entirely"). Genau die beiden Felder sind
      // die ganze Antwort dieser Route — sie war also seit ihrer Einführung
      // leer, und bezahlt wurde trotzdem ein verworfener Entwurf.
      const chunks = await searchLandesverbandChunks({
        collectionId,
        query,
        userId: ctx.userId,
        ...(filters ? { filters } : {}),
      });

      res.json({
        query,
        landesverband: lv,
        sources: chunks,
        // Zitate entstehen erst bei der Synthese, die diese Route bewusst nicht
        // macht. Das Feld bleibt für Bestandsclients erhalten.
        citations: [],
      });
    } catch (err) {
      log.error('[v1.notebooks.search] Error:', err);
      const message = err instanceof Error ? err.message : 'Internal server error';
      res.status(500).json({ error: message });
    }
  }
);

export default router;
