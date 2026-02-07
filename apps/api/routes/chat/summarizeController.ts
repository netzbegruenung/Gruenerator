/**
 * Chat Summarize Controller
 * Handles context compaction/summarization for long conversations
 */

import express from 'express';
import { createAuthenticatedRouter } from '../../utils/keycloak/index.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { createLogger } from '../../utils/logger.js';
import type { UserProfile } from '../../services/user/types.js';
import {
  getCompactionState,
  getMessageCount,
  getThreadMessages,
  generateCompactionSummary,
  needsCompaction,
  COMPACTION_THRESHOLD,
  KEEP_RECENT,
} from './services/compactionService.js';

const log = createLogger('SummarizeController');
const router = createAuthenticatedRouter();

const getUser = (req: express.Request): UserProfile | undefined =>
  (req as any).user as UserProfile | undefined;

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
      `SELECT user_id FROM chat_threads WHERE id = $1 LIMIT 1`,
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
      config: {
        threshold: COMPACTION_THRESHOLD,
        keepRecent: KEEP_RECENT,
      },
      needsCompaction: needsCompaction(messageCount, compactionState.summary),
    });
  } catch (error) {
    log.error('Error fetching compaction state:', error);
    res.status(500).json({ error: 'Failed to fetch compaction state' });
  }
});

/**
 * POST /api/chat-service/summarize
 * Triggers compaction for a thread (generates summary of older messages)
 *
 * Body: { threadId: string }
 */
router.post('/', async (req, res) => {
  try {
    const user = getUser(req);
    if (!user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { threadId } = req.body;
    if (!threadId) {
      return res.status(400).json({ error: 'Thread ID is required' });
    }

    // Verify thread ownership
    const postgres = getPostgresInstance();
    const threads = await postgres.query(
      `SELECT user_id FROM chat_threads WHERE id = $1 LIMIT 1`,
      [threadId]
    );

    if (threads.length === 0) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    if ((threads[0].user_id as string) !== user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Check if compaction is needed
    const [existingState, messageCount] = await Promise.all([
      getCompactionState(threadId),
      getMessageCount(threadId),
    ]);

    if (!needsCompaction(messageCount, existingState.summary)) {
      return res.json({
        success: true,
        skipped: true,
        reason: 'Compaction not needed yet',
        messageCount,
        threshold: COMPACTION_THRESHOLD,
        compactionState: {
          summary: existingState.summary,
          compactedUpToMessageId: existingState.compactedUpToMessageId,
          compactionUpdatedAt: existingState.compactionUpdatedAt,
        },
      });
    }

    log.info(`[Summarize] Starting compaction for thread ${threadId} (${messageCount} messages)`);

    // Get all messages and generate summary
    const messages = await getThreadMessages(threadId);
    const summary = await generateCompactionSummary(threadId, messages);

    // Get updated state
    const newState = await getCompactionState(threadId);

    log.info(`[Summarize] Compaction complete for thread ${threadId}`);

    res.json({
      success: true,
      skipped: false,
      messageCount,
      summarizedCount: messages.length - KEEP_RECENT,
      compactionState: {
        summary: newState.summary,
        compactedUpToMessageId: newState.compactedUpToMessageId,
        compactionUpdatedAt: newState.compactionUpdatedAt,
      },
    });
  } catch (error) {
    log.error('Error during compaction:', error);
    res.status(500).json({ error: 'Failed to compact conversation' });
  }
});

export default router;
