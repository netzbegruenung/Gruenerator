/**
 * Thread Tag Service
 *
 * Generates 2–4 short German topic tags for a chat thread from the first
 * exchange, mirroring threadTitleService's fire-and-forget pattern. Tags power
 * the sidebar tag filter and tag-scoped chat search.
 *
 * Uses the intermediate model (regolo/mistral-small) via generateText directly
 * — same approach as compactionService — so no aiWorkerPool plumbing is needed.
 */

import { generateText } from 'ai';
import { eq } from 'drizzle-orm';

import { chatThreads } from '../../database/schema/chat.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { getIntermediateModel } from '../../routes/chat/agents/providers.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('ThreadTag');

const MAX_TAGS = 4;
const MAX_TAG_LENGTH = 24;

const TAG_PROMPT = `Extrahiere 2 bis 4 kurze deutsche Schlagwörter (Themen), die diese Chat-Konversation beschreiben.
Regeln:
- Nur einzelne Wörter oder sehr kurze Begriffe (max. 2 Wörter), kleingeschrieben.
- Keine Satzzeichen, keine Erklärungen.
- Antworte AUSSCHLIESSLICH mit einem JSON-Array von Strings, z. B. ["klimaschutz","antrag","verkehr"].`;

/**
 * Parse the model output into a clean, deduplicated tag list.
 * Accepts a raw JSON array or a comma/newline separated fallback; returns []
 * on anything unparseable so a bad completion never throws.
 */
export function parseTags(raw: string): string[] {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();

  let candidates: unknown[] = [];
  const match = cleaned.match(/\[[\s\S]*\]/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]) as unknown;
      if (Array.isArray(parsed)) candidates = parsed;
    } catch {
      /* fall through to separator parsing */
    }
  }
  if (candidates.length === 0) {
    candidates = cleaned.split(/[,\n]/);
  }

  const seen = new Set<string>();
  const tags: string[] = [];
  for (const c of candidates) {
    if (typeof c !== 'string') continue;
    const tag = c
      .trim()
      .replace(/^["'\-*]+|["']+$/g, '')
      .toLowerCase()
      .slice(0, MAX_TAG_LENGTH)
      .trim();
    if (tag.length < 2 || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
    if (tags.length >= MAX_TAGS) break;
  }
  return tags;
}

/**
 * Persist tags on a thread, but only if the user hasn't already set their own.
 * Auto-tagging must never clobber manual edits.
 */
async function saveTagsIfEmpty(threadId: string, tags: string[]): Promise<void> {
  const db = getDrizzleInstance();
  const existing = await db
    .select({ tags: chatThreads.tags })
    .from(chatThreads)
    .where(eq(chatThreads.id, threadId))
    .limit(1);

  if (existing[0]?.tags && existing[0].tags.length > 0) {
    log.info(`[ThreadTag] Thread ${threadId} already tagged, skipping auto-tags`);
    return;
  }

  await db
    .update(chatThreads)
    .set({ tags, updated_at: new Date() })
    .where(eq(chatThreads.id, threadId));
  log.info(`[ThreadTag] Saved auto-tags for ${threadId}: ${JSON.stringify(tags)}`);
}

/**
 * Generate and persist auto-tags for a thread. Fire-and-forget: callers should
 * not await the result on the request path.
 */
export async function generateThreadTags(
  threadId: string,
  userMessage: string,
  assistantResponse: string
): Promise<void> {
  const userSnippet = userMessage.slice(0, 300);
  const assistantSnippet = assistantResponse.slice(0, 500);

  try {
    const result = await generateText({
      model: getIntermediateModel(),
      system: TAG_PROMPT,
      prompt: `Nutzerfrage: ${userSnippet}\nAntwort: ${assistantSnippet}`,
      maxOutputTokens: 40,
      temperature: 0.2,
    });

    const tags = parseTags(result.text);
    if (tags.length === 0) {
      log.warn(
        `[ThreadTag] No usable tags parsed for ${threadId} from: ${result.text.slice(0, 80)}`
      );
      return;
    }

    await saveTagsIfEmpty(threadId, tags);
  } catch (err) {
    log.warn(`[ThreadTag] Failed to generate tags for ${threadId}:`, err);
  }
}
