/**
 * Context Pruning Service
 *
 * Manages conversation context window:
 * - Token-based pruning to keep conversations within model limits
 * - Compaction integration for very long threads (summary injection)
 */

import {
  trimMessagesToTokenLimit,
  getTokenStats,
} from '../../../services/counters/TokenCounter.js';
import { createLogger } from '../../../utils/logger.js';

import {
  getCompactionState,
  prepareMessagesWithCompaction,
  needsCompaction,
  generateCompactionSummary,
  getMessageCount,
  getThreadMessages,
} from './compactionService.js';
import { toTokenCounterMessage, CONTEXT_CONFIG } from './messageHelpers.js';

const log = createLogger('ContextPruning');

export interface PruningResult {
  prunedMessages: any[];
  systemMessage: string;
}

/**
 * Prune conversation messages to fit within token budget and apply compaction if available.
 */
export function pruneMessages(validMessages: any[]): any[] {
  const messagesForTokenCount = validMessages.map(toTokenCounterMessage);
  const preStats = getTokenStats(messagesForTokenCount);

  const prunedMessages = trimMessagesToTokenLimit(
    messagesForTokenCount,
    CONTEXT_CONFIG.MAX_CONTEXT_TOKENS
  );

  const keepCount = prunedMessages.filter((m) => m.role !== 'system').length;
  const conversationMessages = validMessages.filter((m: any) => m.role !== 'system');
  const prunedValidMessages = conversationMessages.slice(-keepCount);

  if (prunedValidMessages.length < conversationMessages.length) {
    log.info(
      `[Context] Pruned ${conversationMessages.length} → ${prunedValidMessages.length} messages (${preStats.totalTokens} → ~${getTokenStats(prunedMessages).totalTokens} tokens)`
    );
  }

  return prunedValidMessages;
}

/**
 * Apply compaction summary to system message for long threads.
 * Also triggers background compaction if needed.
 */
export async function applyCompaction(
  threadId: string,
  prunedValidMessages: any[],
  systemMessage: string
): Promise<string> {
  try {
    const messageCount = await getMessageCount(threadId);
    const compactionState = await getCompactionState(threadId);

    if (needsCompaction(messageCount, compactionState.summary)) {
      log.info(
        `[Context] Thread ${threadId} has ${messageCount} messages, triggering background compaction`
      );
      const threadMessages = await getThreadMessages(threadId);
      generateCompactionSummary(threadId, threadMessages).catch((err) =>
        log.error('[Compaction] Background compaction failed:', err)
      );
    }

    if (compactionState.summary) {
      const messagesForTokenCount = prunedValidMessages.map(toTokenCounterMessage);
      const compacted = prepareMessagesWithCompaction(
        messagesForTokenCount,
        compactionState,
        systemMessage
      );
      log.info(
        `[Context] Applied compaction summary (${compactionState.summary.length} chars) to system message`
      );
      return compacted.systemMessage;
    }
  } catch (compactionError) {
    log.warn('[Context] Failed to apply compaction, using pruned messages:', compactionError);
  }

  return systemMessage;
}
