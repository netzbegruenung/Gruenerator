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

// Configuration constants
export const COMPACTION_THRESHOLD = 50;
export const KEEP_RECENT = 20;
export const RE_COMPACTION_THRESHOLD = 50;
export const SUMMARY_MAX_TOKENS = 800;

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
 * Check if a thread needs compaction based on message count
 */
export function needsCompaction(messageCount: number, existingSummary: string | null): boolean {
  if (!existingSummary) {
    return messageCount >= COMPACTION_THRESHOLD;
  }
  return messageCount >= COMPACTION_THRESHOLD + RE_COMPACTION_THRESHOLD;
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
  messages: Message[]
): Promise<string> {
  if (messages.length <= KEEP_RECENT) {
    log.warn(`[Compaction] Not enough messages to compact for thread ${threadId}`);
    throw new Error('Not enough messages to compact');
  }

  const toSummarize = messages.slice(0, -KEEP_RECENT);
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
  baseSystemMessage: string
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
  const nonSystemMessages = messages.filter((m) => m.role !== 'system');
  const recentMessages = nonSystemMessages.slice(-KEEP_RECENT);

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
