/**
 * Chat Compaction Service
 *
 * Handles context window compaction for long conversations.
 * When conversations exceed a threshold, older messages are summarized
 * and only the summary + recent messages are sent to the LLM.
 */

import { generateText, type ModelMessage } from 'ai';

import { getPostgresInstance } from '../../../database/services/PostgresService.js';
import { createLogger } from '../../../utils/logger.js';
import { getModel } from '../agents/providers.js';

const log = createLogger('CompactionService');

// Configuration constants (defaults for 128K+ context models)
export const COMPACTION_THRESHOLD = 50;
export const COMPACTION_TOKEN_THRESHOLD = 24000;
export const KEEP_RECENT = 20;
export const RE_COMPACTION_THRESHOLD = 50;
export const SUMMARY_MAX_TOKENS = 800;

/**
 * Model-aware message count limit (lobe-chat pattern).
 * Returns how many recent messages to keep based on context window size.
 * Smaller models need fewer messages to leave room for system prompt + response.
 */
export function getKeepRecent(contextWindowTokens?: number): number {
  if (!contextWindowTokens) return KEEP_RECENT;
  if (contextWindowTokens < 16000) return 6;
  if (contextWindowTokens < 32000) return 10;
  if (contextWindowTokens < 64000) return 15;
  return KEEP_RECENT;
}

/**
 * Model-aware compaction threshold.
 * Returns when to trigger compaction based on context window size.
 */
export function getCompactionThreshold(contextWindowTokens?: number): number {
  if (!contextWindowTokens) return COMPACTION_THRESHOLD;
  if (contextWindowTokens < 16000) return 15;
  if (contextWindowTokens < 32000) return 25;
  if (contextWindowTokens < 64000) return 35;
  return COMPACTION_THRESHOLD;
}

/**
 * Model-aware token threshold for compaction.
 */
export function getCompactionTokenThreshold(contextWindowTokens?: number): number {
  if (!contextWindowTokens) return COMPACTION_TOKEN_THRESHOLD;
  // Use ~40% of context window as token threshold
  return Math.min(Math.floor(contextWindowTokens * 0.4), COMPACTION_TOKEN_THRESHOLD);
}

/**
 * Model configuration for compaction.
 * Summarization is a straightforward task - use a small, fast model.
 * Large models are overkill and waste resources on simple summarization.
 */
const COMPACTION_MODEL = {
  provider: 'mistral' as const,
  model: 'mistral-small-latest', // Small model is sufficient for summarization
};

export interface CompactionState {
  summary: string | null;
  compactedUpToMessageId: string | null;
  compactionUpdatedAt: Date | null;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | null;
  created_at: Date;
}

/**
 * Check if a thread needs compaction based on message count or estimated token usage.
 * Token-based threshold catches conversations with few but very large messages
 * (e.g., pasted articles) that would otherwise lose context before hitting the message count.
 * When contextWindowTokens is provided, uses model-aware thresholds.
 */
export function needsCompaction(
  messageCount: number,
  existingSummary: string | null,
  estimatedTokens?: number,
  contextWindowTokens?: number
): boolean {
  const threshold = getCompactionThreshold(contextWindowTokens);
  const tokenThreshold = getCompactionTokenThreshold(contextWindowTokens);

  if (estimatedTokens && estimatedTokens >= tokenThreshold && !existingSummary) {
    return true;
  }
  if (!existingSummary) {
    return messageCount >= threshold;
  }
  return messageCount >= threshold + RE_COMPACTION_THRESHOLD;
}

/**
 * Get the current compaction state for a thread
 */
export async function getCompactionState(threadId: string): Promise<CompactionState> {
  const postgres = getPostgresInstance();

  const result = await postgres.query(
    `SELECT compaction_summary, compacted_up_to_message_id, compaction_updated_at
     FROM chat_threads WHERE id = $1`,
    [threadId]
  );

  if (result.length === 0) {
    return {
      summary: null,
      compactedUpToMessageId: null,
      compactionUpdatedAt: null,
    };
  }

  const row = result[0];
  return {
    summary: row.compaction_summary as string | null,
    compactedUpToMessageId: row.compacted_up_to_message_id as string | null,
    compactionUpdatedAt: row.compaction_updated_at as Date | null,
  };
}

/**
 * Save compaction state to the database
 */
export async function saveCompactionState(
  threadId: string,
  summary: string,
  lastCompactedMessageId: string
): Promise<void> {
  const postgres = getPostgresInstance();

  await postgres.query(
    `UPDATE chat_threads
     SET compaction_summary = $1,
         compacted_up_to_message_id = $2,
         compaction_updated_at = CURRENT_TIMESTAMP
     WHERE id = $3`,
    [summary, lastCompactedMessageId, threadId]
  );

  log.info(`[Compaction] Saved compaction state for thread ${threadId}`);
}

/**
 * Format messages for summarization prompt
 */
function formatMessagesForSummary(messages: Message[]): string {
  return messages
    .filter((m) => m.content && m.role !== 'system')
    .map((m) => {
      const role = m.role === 'user' ? 'Benutzer' : 'Assistent';
      return `${role}: ${m.content}`;
    })
    .join('\n\n');
}

/**
 * Generate a summary of older messages using the LLM
 */
export async function generateCompactionSummary(
  threadId: string,
  messages: Message[],
  contextWindowTokens?: number
): Promise<string> {
  const keepRecent = getKeepRecent(contextWindowTokens);
  if (messages.length <= keepRecent) {
    log.warn(`[Compaction] Not enough messages to compact for thread ${threadId}`);
    throw new Error('Not enough messages to compact');
  }

  const toSummarize = messages.slice(0, -keepRecent);
  const lastSummarizedMessage = toSummarize[toSummarize.length - 1];

  log.info(
    `[Compaction] Generating summary for thread ${threadId}: ` +
      `${toSummarize.length} messages to summarize, ${KEEP_RECENT} kept recent`
  );

  const formattedMessages = formatMessagesForSummary(toSummarize);

  const systemPrompt = `Du bist ein Assistent, der Gespräche zusammenfasst. Erstelle eine prägnante deutsche Zusammenfassung des folgenden Gesprächsverlaufs.

Fokussiere dich auf:
- Die wichtigsten besprochenen Themen
- Getroffene Entscheidungen oder Schlussfolgerungen
- Relevante Fakten und Informationen die genannt wurden
- Offene Fragen oder Aufgaben

Halte die Zusammenfassung kompakt aber informativ (max. 400 Wörter). Schreibe in der dritten Person.`;

  try {
    const result = await generateText({
      model: getModel(COMPACTION_MODEL.provider, COMPACTION_MODEL.model),
      system: systemPrompt,
      prompt: formattedMessages,
      maxOutputTokens: SUMMARY_MAX_TOKENS,
      temperature: 0.3,
    });

    const summary = result.text;

    // Save to database
    await saveCompactionState(threadId, summary, lastSummarizedMessage.id);

    log.info(
      `[Compaction] Successfully generated summary for thread ${threadId}: ` +
        `${summary.length} chars`
    );

    return summary;
  } catch (error) {
    log.error(`[Compaction] Failed to generate summary for thread ${threadId}:`, error);
    throw error;
  }
}

/**
 * Prepare messages for the LLM by applying compaction if available
 *
 * This prepends the compaction summary to the system message and returns
 * only recent messages, reducing context window usage for long conversations.
 */
export function prepareMessagesWithCompaction(
  messages: ModelMessage[],
  compactionState: CompactionState,
  baseSystemMessage: string,
  contextWindowTokens?: number
): { messages: ModelMessage[]; systemMessage: string } {
  if (!compactionState.summary) {
    return {
      messages,
      systemMessage: baseSystemMessage,
    };
  }

  // Enhance system message with summary
  const enhancedSystemMessage = `${baseSystemMessage}

## GESPRÄCHSZUSAMMENFASSUNG

Das folgende ist eine Zusammenfassung des bisherigen Gesprächsverlaufs. Nutze diese Informationen als Kontext für deine Antworten:

${compactionState.summary}

---
Die folgenden Nachrichten sind die aktuellsten im Gespräch.`;

  // Filter to only keep recent messages (excluding system messages which are handled separately)
  const keepRecent = getKeepRecent(contextWindowTokens);
  const nonSystemMessages = messages.filter((m) => m.role !== 'system');
  const recentMessages = nonSystemMessages.slice(-keepRecent);

  log.debug(
    `[Compaction] Prepared messages: ${nonSystemMessages.length} original -> ${recentMessages.length} recent ` +
      `(summary: ${compactionState.summary.length} chars)`
  );

  return {
    messages: recentMessages,
    systemMessage: enhancedSystemMessage,
  };
}

/**
 * Get message count for a thread
 */
export async function getMessageCount(threadId: string): Promise<number> {
  const postgres = getPostgresInstance();

  const result = await postgres.query(
    `SELECT COUNT(*) as count FROM chat_messages WHERE thread_id = $1`,
    [threadId]
  );

  return parseInt(String(result[0].count), 10);
}

/**
 * Get all messages for a thread (for compaction)
 */
export async function getThreadMessages(threadId: string): Promise<Message[]> {
  const postgres = getPostgresInstance();

  const result = await postgres.query(
    `SELECT id, role, content, created_at
     FROM chat_messages
     WHERE thread_id = $1
     ORDER BY created_at ASC`,
    [threadId]
  );

  return result.map((row) => ({
    id: row.id as string,
    role: row.role as 'user' | 'assistant' | 'system' | 'tool',
    content: row.content as string | null,
    created_at: row.created_at as Date,
  }));
}
