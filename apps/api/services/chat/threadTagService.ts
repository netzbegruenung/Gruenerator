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
import { and, eq, sql } from 'drizzle-orm';

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

/** Normalize + dedup a list of raw tag strings, capped at MAX_TAGS. */
function normalizeTagList(items: unknown[]): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const c of items) {
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
 * Parse the model output into a clean, deduplicated tag list.
 * Only accepts a genuine JSON array of strings (the format the prompt mandates);
 * returns [] on anything else. We deliberately do NOT split arbitrary prose into
 * tags — a chatty completion should yield no tags rather than garbage ones.
 */
export function parseTags(raw: string): string[] {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();

  // Scan each flat [...] segment (tags never nest) and take the first that
  // parses to a string array — avoids a greedy match spanning an example array
  // plus the real one, which would fail to parse entirely.
  for (const m of cleaned.matchAll(/\[[^[\]]*\]/g)) {
    try {
      const parsed = JSON.parse(m[0]) as unknown;
      if (Array.isArray(parsed)) {
        const tags = normalizeTagList(parsed);
        if (tags.length > 0) return tags;
      }
    } catch {
      /* try the next bracketed segment */
    }
  }
  return [];
}

/**
 * Persist tags on a thread, but only if the user hasn't already set their own.
 * Single conditional UPDATE (no read-then-write) so a concurrent manual edit
 * can't be clobbered in a TOCTOU window — auto-tagging must never overwrite
 * user tags.
 */
async function saveTagsIfEmpty(threadId: string, tags: string[]): Promise<void> {
  const db = getDrizzleInstance();
  const updated = await db
    .update(chatThreads)
    .set({ tags, updated_at: new Date() })
    .where(
      and(
        eq(chatThreads.id, threadId),
        sql`(${chatThreads.tags} IS NULL OR jsonb_array_length(${chatThreads.tags}) = 0)`
      )
    )
    .returning({ id: chatThreads.id });

  if (updated.length > 0) {
    log.info(`[ThreadTag] Saved auto-tags for ${threadId}: ${JSON.stringify(tags)}`);
  } else {
    log.info(`[ThreadTag] Thread ${threadId} already tagged, skipping auto-tags`);
  }
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
