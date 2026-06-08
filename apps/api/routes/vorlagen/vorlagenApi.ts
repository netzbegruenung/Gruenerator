/**
 * Vorlagen (template) search API for the chat @vorlagen mention.
 *
 *   GET /api/vorlagen/search?query=...&limit=...  → vector search over
 *       published, public Vorlagen (best semantic matches first).
 *
 * Backs the dev-only @vorlagen picker in the chat composer. Always returns a
 * `vorlagen` array (empty on no query / Qdrant down) so the picker degrades
 * gracefully.
 */

import { Router, type Request, type Response } from 'express';

import { requireAuth } from '../../middleware/authMiddleware.js';
import { searchTemplates } from '../../services/templates/templateEnrichment.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('vorlagenApi');
const router: Router = Router();

router.get('/search', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const query = typeof req.query.query === 'string' ? req.query.query : '';
    const limitRaw = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : NaN;
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 15;

    const vorlagen = await searchTemplates(query, limit);
    res.json({ vorlagen });
  } catch (error) {
    log.error('Vorlagen search failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Vorlagen konnten nicht geladen werden', vorlagen: [] });
  }
});

export default router;
