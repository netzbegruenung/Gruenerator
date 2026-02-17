/**
 * Thread Title Service
 *
 * Shared service for generating and updating chat thread titles.
 * Consolidates the identical updateThreadTitle + first-sentence heuristic
 * that was duplicated across chatGraphController, chatStreamController, and chatDeepController.
 *
 * Generates AI-powered German titles using Mistral-small via aiWorkerPool.
 */

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('ThreadTitle');

/**
 * Update a thread's title in the database.
 */
export async function updateThreadTitleInDB(threadId: string, title: string): Promise<void> {
  const postgres = getPostgresInstance();
  await postgres.query(
    `UPDATE chat_threads SET title = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
    [title, threadId]
  );
}

/**
 * Extract a fallback title from text using the first-sentence heuristic.
 */
export function extractFallbackTitle(text: string, hasImage?: boolean): string | null {
  if (text && text.length > 10) {
    const firstSentence = text.split(/[.!?]/)[0];
    return firstSentence.length > 50 ? firstSentence.slice(0, 50) + '...' : firstSentence;
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
  aiWorkerPool: any,
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
    provider: 'mistral',
    systemPrompt: TITLE_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Nutzerfrage: ${userSnippet}\nAntwort: ${assistantSnippet}`,
      },
    ],
    options: {
      model: 'mistral-small-latest',
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
    .then(async (response: any) => {
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
