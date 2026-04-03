/**
 * Chat Search Controller
 *
 * REST endpoint for searching past chat conversations.
 * Used by the frontend for thread search UI.
 */

import { createAuthenticatedRouter } from '../../utils/keycloak/index.js';
import { createLogger } from '../../utils/logger.js';

import { searchChatHistory } from './services/chatSearchService.js';

const log = createLogger('ChatSearchController');
const router = createAuthenticatedRouter();

/**
 * GET /api/chat/search?q=...&threadType=...&limit=5&excludeThreadId=...
 *
 * Search past conversations by message content and thread title.
 */
router.get('/', async (req, res) => {
  try {
    const userId = (req as any).user?.id as string | undefined;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const query = req.query.q as string | undefined;
    if (!query || query.trim().length < 2) {
      return res.status(400).json({ error: 'Query parameter "q" is required (min 2 chars)' });
    }

    const threadType = req.query.threadType as 'chat' | 'search' | 'notebook' | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 5, 20);
    const excludeThreadId = req.query.excludeThreadId as string | undefined;

    const results = await searchChatHistory(userId, query.trim(), {
      threadType,
      limit,
      excludeThreadId,
    });

    return res.json({ results, total: results.length });
  } catch (err) {
    log.error('Chat search failed:', err);
    return res.status(500).json({ error: 'Search failed' });
  }
});

export default router;
