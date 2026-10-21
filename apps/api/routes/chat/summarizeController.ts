/**
 * Chat Summarize Controller
 * Handles context compaction/summarization for long conversations
 */

import { z } from 'zod';

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { requireAiConsent } from '../../middleware/requireAiConsent.js';
import { validateBody, type TypedRequest } from '../../middleware/validateBody.js';
import { createAuthenticatedRouter } from '../../utils/keycloak/index.js';
import { createLogger } from '../../utils/logger.js';

import {
  getCompactionState,
  getCompactionTokenThreshold,
  getMessageCount,
  getTailTokenBudget,
} from './services/compactionService.js';
import { getUser } from './services/threadPersistenceService.js';

const log = createLogger('SummarizeController');
const router = createAuthenticatedRouter();

/**
 * GET /api/chat-service/summarize?threadId=xxx
 * Returns the current compaction state for a thread
 */
router.get('/', async (req, res) => {
  try {
    const user = getUser(req);
    if (!user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const threadId = req.query.threadId as string;
    if (!threadId) {
      return res.status(400).json({ error: 'Thread ID is required' });
    }

    // Verify thread ownership
    const postgres = getPostgresInstance();
    const threads = await postgres.query(
      `SELECT user_id FROM chat_threads WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
      [threadId]
    );

    if (threads.length === 0) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    if ((threads[0].user_id as string) !== user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Get compaction state and message count - handle gracefully if columns don't exist
    let compactionState = {
      summary: null as string | null,
      compactedUpToMessageId: null as string | null,
      compactionUpdatedAt: null as Date | null,
    };
    let messageCount = 0;

    try {
      [compactionState, messageCount] = await Promise.all([
        getCompactionState(threadId),
        getMessageCount(threadId),
      ]);
    } catch (dbError) {
      log.warn('Could not fetch compaction state (columns may not exist yet):', dbError);
      // Continue with defaults - compaction is a non-critical feature
    }

    res.json({
      threadId,
      messageCount,
      compactionState: {
        summary: compactionState.summary,
        compactedUpToMessageId: compactionState.compactedUpToMessageId,
        compactionUpdatedAt: compactionState.compactionUpdatedAt,
      },
      // F0 shape for shipped clients; both are token figures now, and the
      // chat stream decides on its own — no client needs to ask for it.
      config: {
        threshold: getCompactionTokenThreshold(),
        keepRecent: getTailTokenBudget(),
      },
      needsCompaction: false,
    });
  } catch (error) {
    log.error('Error fetching compaction state:', error);
    res.status(500).json({ error: 'Failed to fetch compaction state' });
  }
});

const summarizeSchema = z.object({
  threadId: z.string().min(1),
});

/**
 * POST /api/chat-service/summarize
 * Triggers compaction for a thread (generates summary of older messages)
 *
 * Body: { threadId: string }
 */
router.post(
  '/',
  requireAiConsent,
  validateBody(summarizeSchema),
  async (req: TypedRequest<z.infer<typeof summarizeSchema>>, res) => {
    try {
      const user = getUser(req);
      if (!user?.id) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { threadId } = req.body;

      // Verify thread ownership
      const postgres = getPostgresInstance();
      const threads = await postgres.query(
        `SELECT user_id FROM chat_threads WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
        [threadId]
      );

      if (threads.length === 0) {
        return res.status(404).json({ error: 'Thread not found' });
      }

      if ((threads[0].user_id as string) !== user.id) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      // Compaction runs inside the chat stream, against the turn's own window.
      // Shipped clients still call this after 50 messages; they get the state.
      const [existingState, messageCount] = await Promise.all([
        getCompactionState(threadId),
        getMessageCount(threadId),
      ]);

      res.json({
        success: true,
        skipped: true,
        reason: 'Compaction runs with the chat stream',
        messageCount,
        threshold: getCompactionTokenThreshold(),
        compactionState: {
          summary: existingState.summary,
          compactedUpToMessageId: existingState.compactedUpToMessageId,
          compactionUpdatedAt: existingState.compactionUpdatedAt,
        },
      });
    } catch (error) {
      log.error('Error during compaction:', error);
      res.status(500).json({ error: 'Failed to compact conversation' });
    }
  }
);

export default router;
