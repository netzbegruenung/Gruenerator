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

// In-memory guards to prevent re-triggering compaction on every message after threshold
const compactionInProgress = new Set<string>();
const lastCompactionTime = new Map<string, number>();
const COMPACTION_COOLDOWN_MS = 60_000; // 1 minute

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

    const messagesForEstimate = prunedValidMessages.map(toTokenCounterMessage);
    const estimatedTokens = getTokenStats(messagesForEstimate).totalTokens;

    const now = Date.now();
    const cooldownActive = now - (lastCompactionTime.get(threadId) ?? 0) < COMPACTION_COOLDOWN_MS;

    if (
      needsCompaction(messageCount, compactionState.summary, estimatedTokens) &&
      !compactionInProgress.has(threadId) &&
      !cooldownActive
    ) {
      compactionInProgress.add(threadId);
      log.info(
        `[Context] Thread ${threadId}: ${messageCount} messages, ~${estimatedTokens} tokens, triggering background compaction`
      );
      const threadMessages = await getThreadMessages(threadId);
      generateCompactionSummary(threadId, threadMessages)
        .then(() => lastCompactionTime.set(threadId, Date.now()))
        .catch((err) => log.error('[Compaction] Background compaction failed:', err))
        .finally(() => compactionInProgress.delete(threadId));
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
