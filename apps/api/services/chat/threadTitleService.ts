/**
 * Thread Title Service
 *
 * Shared service for generating and updating chat thread titles.
 * Consolidates the identical updateThreadTitle + first-sentence heuristic
 * that was duplicated across chat controllers.
 *
 * Generates AI-powered German titles using Mistral-small via aiWorkerPool.
 */

import { eq } from 'drizzle-orm';

import { chatThreads } from '../../database/schema/chat.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { INTERMEDIATE_MODEL } from '../../routes/chat/agents/providers.js';
import { createLogger } from '../../utils/logger.js';

import type { AIWorkerPool } from '../../workers/types.js';

const log = createLogger('ThreadTitle');

/**
 * Update a thread's title in the database.
 */
export async function updateThreadTitleInDB(threadId: string, title: string): Promise<void> {
  const db = getDrizzleInstance();
  await db
    .update(chatThreads)
    .set({ title, updated_at: new Date() })
    .where(eq(chatThreads.id, threadId));
}

// Salutations that often start a German letter/email/post and make a poor
// thread title. When matched at the start of a sentence we skip it and try
// the next sentence.
const SALUTATION_PATTERNS = [
  /^liebe[*r]?\s/i,
  /^liebes\s/i,
  /^sehr\s+geehrte[r]?\s/i,
  /^hallo\b/i,
  /^guten\s+(tag|morgen|abend)\b/i,
  /^moin\b/i,
];

function stripMarkdown(input: string): string {
  return input
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .replace(/(^|\s)[*_]([^*_\s][^*_]*)[*_](?=\s|$|[.,;:!?])/g, '$1$2')
    .replace(/`/g, '')
    .replace(/^\s*#+\s+/, '')
    .replace(/^\s*>\s+/, '')
    .replace(/^\s*[-*+]\s+/, '')
    .replace(/^\s*\d+\.\s+/, '')
    .trim();
}

/**
 * Extract a fallback title from text using the first-sentence heuristic.
 *
 * Sanitises the assistant response so that titles do not contain raw
 * markdown (`**Visuelle Idee:**`), salutations (`Liebe Freundinnen…`),
 * or literal newlines.
 */
export function extractFallbackTitle(text: string, hasImage?: boolean): string | null {
  if (text && text.length > 10) {
    const collapsed = text.replace(/\s+/g, ' ').trim();
    const sentences = collapsed.split(/(?<=[.!?])\s+/).filter((s) => s.length > 0);

    for (const raw of sentences) {
      const cleaned = stripMarkdown(raw).trim();
      if (cleaned.length < 10) continue;
      if (SALUTATION_PATTERNS.some((re) => re.test(cleaned))) continue;
      const trimmed = cleaned.replace(/[.!?]+$/, '');
      return trimmed.length > 50 ? trimmed.slice(0, 50) + '...' : trimmed;
    }
  }
  if (hasImage) {
    return 'Generiertes Bild';
  }
  return null;
}

const TITLE_PROMPT = `Erstelle einen kurzen, prägnanten deutschen Titel (3-6 Wörter) für diese Chat-Konversation.
Antworte NUR mit dem Titel, nichts anderes.`;

/**
 * Generate a thread title: writes fallback immediately, then fires off an AI call
 * to generate a better title asynchronously.
 */
export async function generateThreadTitle(
  threadId: string,
  userMessage: string,
  assistantResponse: string,
  aiWorkerPool: AIWorkerPool,
  options?: { imageGenerated?: boolean }
): Promise<void> {
  log.info(`[ThreadTitle] generateThreadTitle called`, {
    threadId,
    userMessageLen: userMessage?.length ?? 0,
    assistantResponseLen: assistantResponse?.length ?? 0,
    imageGenerated: options?.imageGenerated,
  });

  const fallback = extractFallbackTitle(assistantResponse, options?.imageGenerated);
  log.info(`[ThreadTitle] extractFallbackTitle result: ${JSON.stringify(fallback)}`);

  if (!fallback || fallback.length <= 3) {
    log.warn(`[ThreadTitle] Skipping — fallback is null/too short (${JSON.stringify(fallback)})`);
    return;
  }

  // Write fallback title immediately so sidebar has a name right away
  await updateThreadTitleInDB(threadId, fallback);
  log.info(`[ThreadTitle] Fallback title written to DB for ${threadId}: "${fallback}"`);

  // Fire-and-forget AI title generation
  const userSnippet = userMessage.slice(0, 300);
  const assistantSnippet = assistantResponse.slice(0, 500);

  const aiRequest = {
    type: 'chat_thread_title',
    provider: INTERMEDIATE_MODEL.provider,
    systemPrompt: TITLE_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Nutzerfrage: ${userSnippet}\nAntwort: ${assistantSnippet}`,
      },
    ],
    options: {
      model: INTERMEDIATE_MODEL.model,
      max_tokens: 30,
      temperature: 0.3,
    },
  };
  log.info(`[ThreadTitle] Sending AI worker request for ${threadId}`, {
    userSnippetLen: userSnippet.length,
    assistantSnippetLen: assistantSnippet.length,
  });

  aiWorkerPool
    .processRequest(aiRequest, null)
    .then(async (response: { content?: string | null }) => {
      log.info(`[ThreadTitle] AI worker response for ${threadId}:`, {
        rawContent: response?.content,
        type: typeof response?.content,
      });
      const aiTitle = (response.content || '').trim().replace(/^["']|["']$/g, '');

      if (aiTitle && aiTitle.length >= 3 && aiTitle.length <= 80) {
        await updateThreadTitleInDB(threadId, aiTitle);
        log.info(`[ThreadTitle] AI title written to DB for ${threadId}: "${aiTitle}"`);
      } else {
        log.warn(
          `[ThreadTitle] AI title rejected (length=${aiTitle?.length}, value=${JSON.stringify(aiTitle)}), keeping fallback`
        );
      }
    })
    .catch((err: unknown) => {
      log.warn(`[ThreadTitle] AI worker FAILED for ${threadId}, keeping fallback:`, err);
    });
}
