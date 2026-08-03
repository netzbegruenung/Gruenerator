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
import { reportBackgroundError } from '../../../utils/reportBackgroundError.js';

import {
  getCompactionState,
  prepareMessagesWithCompaction,
  needsCompaction,
  generateCompactionSummary,
  getMessageCount,
  getThreadMessages,
} from './compactionService.js';
import { toTokenCounterMessage, getPruningBudget } from './messageHelpers.js';

import type { ModelMessage } from 'ai';

const log = createLogger('ContextPruning');

// In-memory guards to prevent re-triggering compaction on every message after threshold
const compactionInProgress = new Set<string>();
const lastCompactionTime = new Map<string, number>();
// Env-overridable outside production so the long-thread eval harness can
// trigger back-to-back compactions without waiting out the cooldown.
const COMPACTION_COOLDOWN_MS = (() => {
  if (process.env.NODE_ENV !== 'production') {
    const n = Number.parseInt(process.env.CHAT_COMPACTION_COOLDOWN_MS ?? '', 10);
    if (Number.isInteger(n) && n >= 0) return n;
  }
  return 60_000; // 1 minute
})();

export interface PruningResult {
  prunedMessages: ModelMessage[];
  systemMessage: string;
}

/**
 * Prune conversation messages to fit within token budget and apply compaction if available.
 */
export function pruneMessages(
  validMessages: ModelMessage[],
  contextWindowTokens?: number
): ModelMessage[] {
  const messagesForTokenCount = validMessages.map(toTokenCounterMessage);
  const preStats = getTokenStats(messagesForTokenCount);

  const prunedMessages = trimMessagesToTokenLimit(
    messagesForTokenCount,
    getPruningBudget(contextWindowTokens)
  );

  const keepCount = prunedMessages.filter((m) => m.role !== 'system').length;
  const conversationMessages = validMessages.filter((m: { role: string }) => m.role !== 'system');
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
 *
 * Returns the messages alongside the system message: once a summary exists it
 * replaces the turns it covers, so the caller must send the returned (shorter)
 * list. Passing the summary on top of the full history would only add tokens.
 */
export async function applyCompaction<T extends { role: string; content: string | unknown[] }>(
  threadId: string,
  prunedValidMessages: T[],
  systemMessage: string,
  contextWindowTokens?: number
): Promise<{ systemMessage: string; messages: T[] }> {
  try {
    const messageCount = await getMessageCount(threadId);
    const compactionState = await getCompactionState(threadId);

    const messagesForEstimate = (prunedValidMessages as ModelMessage[]).map(toTokenCounterMessage);
    const estimatedTokens = getTokenStats(messagesForEstimate).totalTokens;

    const now = Date.now();
    const cooldownActive = now - (lastCompactionTime.get(threadId) ?? 0) < COMPACTION_COOLDOWN_MS;

    if (
      needsCompaction(
        messageCount,
        compactionState.summary,
        estimatedTokens,
        contextWindowTokens
      ) &&
      !compactionInProgress.has(threadId) &&
      !cooldownActive
    ) {
      compactionInProgress.add(threadId);
      log.info(
        `[Context] Thread ${threadId}: ${messageCount} messages, ~${estimatedTokens} tokens, triggering background compaction`
      );
      const threadMessages = await getThreadMessages(threadId);
      generateCompactionSummary(threadId, threadMessages, contextWindowTokens)
        .then(() => lastCompactionTime.set(threadId, Date.now()))
        .catch((err) => reportBackgroundError(err, { job: 'context-compaction', threadId }))
        .finally(() => compactionInProgress.delete(threadId));
    }

    if (compactionState.summary) {
      // Slice the ORIGINAL messages, not the flattened TokenCounter copies —
      // those drop images and tool parts and must never reach the model.
      const compacted = prepareMessagesWithCompaction(
        prunedValidMessages,
        compactionState,
        systemMessage,
        contextWindowTokens
      );
      log.info(
        `[Context] Applied compaction summary (${compactionState.summary.length} chars); ` +
          `${prunedValidMessages.length} → ${compacted.messages.length} messages`
      );
      return { systemMessage: compacted.systemMessage, messages: compacted.messages };
    }
  } catch (compactionError) {
    log.warn('[Context] Failed to apply compaction, using pruned messages:', compactionError);
  }

  return { systemMessage, messages: prunedValidMessages };
}
