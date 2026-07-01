/**
 * Chat Search Controller
 *
 * REST endpoint for searching past chat conversations.
 * Used by the frontend for thread search UI.
 */

import { createAuthenticatedRouter } from '../../utils/keycloak/index.js';
import { createLogger } from '../../utils/logger.js';

import { searchChatHistory } from './services/chatSearchService.js';
import { getUser } from './services/threadPersistenceService.js';

const log = createLogger('ChatSearchController');
const router = createAuthenticatedRouter();

/**
 * GET /api/chat/search?q=...&threadType=...&limit=5&excludeThreadId=...
 *
 * Search past conversations by message content and thread title.
 */
router.get('/', async (req, res) => {
  try {
    const user = getUser(req);
    if (!user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const userId = user.id;

    // tags query param: repeated (?tags=a&tags=b) or comma-separated (?tags=a,b)
    const rawTags = req.query.tags;
    const tags = (Array.isArray(rawTags) ? rawTags : rawTags ? [rawTags] : [])
      .flatMap((t) => String(t).split(','))
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0);

    const query = req.query.q as string | undefined;
    // A text query OR at least one tag is required. Tag-only search passes an
    // empty pattern (matches all) and narrows by tag.
    if ((!query || query.trim().length < 2) && tags.length === 0) {
      return res
        .status(400)
        .json({ error: 'Provide "q" (min 2 chars) or at least one "tags" value' });
    }

    const threadType = req.query.threadType as 'chat' | 'search' | 'notebook' | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 5, 20);
    const excludeThreadId = req.query.excludeThreadId as string | undefined;

    const results = await searchChatHistory(userId, (query ?? '').trim(), {
      ...(threadType && { threadType }),
      limit,
      ...(excludeThreadId && { excludeThreadId }),
      ...(tags.length > 0 && { tags }),
    });

    return res.json({ results, total: results.length });
  } catch (err) {
    log.error('Chat search failed:', err);
    return res.status(500).json({ error: 'Search failed' });
  }
});

export default router;
