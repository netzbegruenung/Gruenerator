/**
 * Thread Title Service
 *
 * Shared service for generating and updating chat thread titles.
 * Consolidates the identical updateThreadTitle + first-sentence heuristic
 * that was duplicated across chat controllers.
 *
 * Generates AI-powered German titles using Mistral-small via aiClient.
 */

import { eq } from 'drizzle-orm';

import { chatThreads } from '../../database/schema/chat.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { createLogger } from '../../utils/logger.js';
import { intermediateLane } from '../ai/intermediateLanes.js';

import type { AiClient } from '../ai/types.js';

/** @see services/ai/intermediateLanes.ts */
const LANE = intermediateLane('trivial');

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

/**
 * German month names, spelled out or abbreviated. Used to tell a date apart
 * from markdown syntax: "30. Juni …" is a date, "30. Punkt der Tagesordnung"
 * is a numbered list item.
 */
const MONTH = '(?:jan|feb|mär|maer|mar|apr|mai|jun|jul|aug|sep|okt|nov|dez)';

/** `. ` that ends a sentence — not the dot of an ordinal ("30. Juni"). */
const SENTENCE_END = new RegExp(`(?<=[^\\d][.!?])\\s|(?<=\\d[.!?])\\s(?!${MONTH})`, 'i');

function stripMarkdown(input: string): string {
  return (
    input
      .replace(/\*\*/g, '')
      .replace(/__/g, '')
      .replace(/(^|\s)[*_]([^*_\s][^*_]*)[*_](?=\s|$|[.,;:!?])/g, '$1$2')
      .replace(/`/g, '')
      .replace(/^\s*#+\s+/, '')
      .replace(/^\s*>\s+/, '')
      .replace(/^\s*[-*+]\s+/, '')
      // Numbered list marker — but a leading date ("30. Juni …") is not one.
      .replace(new RegExp(`^\\s*\\d+\\.\\s+(?!${MONTH})`, 'i'), '')
      .trim()
  );
}

// Politeness lead-ins that push the actual topic out of the visible part of
// the title ("Kannst du mir bitte den Antrag …" → "Antrag …").
const LEAD_IN_PATTERNS = [
  /^(kannst|könntest|würdest)\s+du\s+(mir\s+)?(bitte\s+)?/i,
  /^ich\s+(möchte|brauche|hätte\s+gerne)\s+/i,
  /^bitte\s+/i,
];

/** Sidebar width fits ~26 characters; anything past this is never read. */
const MAX_TITLE_CHARS = 32;
/** An AI title longer than this is a sentence, not a title — reject it. */
const MAX_AI_TITLE_CHARS = 40;
const MAX_AI_TITLE_WORDS = 6;

/** Cut at a word boundary, never mid-word. No ellipsis — the sidebar adds its own. */
function clampToWords(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = text.slice(0, max);
  const lastSpace = head.lastIndexOf(' ');
  // A single word longer than the cap is the only case we cut mid-word.
  return (lastSpace > 0 ? head.slice(0, lastSpace) : head).replace(/[\s,;:–-]+$/, '');
}

/**
 * Extract a fallback title from the user's message using the first-sentence
 * heuristic.
 *
 * Reads the *question*, not the answer: the answer's first sentence is prose
 * about the topic, the question is the topic. Sanitises markdown, salutations
 * (`Liebe Freundinnen…`), politeness lead-ins and literal newlines.
 */
export function extractFallbackTitle(text: string, hasImage?: boolean): string | null {
  if (text && text.length > 5) {
    const collapsed = text.replace(/\s+/g, ' ').trim();
    const sentences = collapsed.split(SENTENCE_END).filter((s) => s && s.length > 0);

    for (const raw of sentences) {
      let cleaned = stripMarkdown(raw).trim();
      if (SALUTATION_PATTERNS.some((re) => re.test(cleaned))) continue;
      for (const re of LEAD_IN_PATTERNS) cleaned = cleaned.replace(re, '');
      cleaned = cleaned.trim();
      if (cleaned.length < 6) continue;
      const trimmed = cleaned.replace(/[.!?]+$/, '');
      return clampToWords(trimmed, MAX_TITLE_CHARS);
    }
  }
  if (hasImage) {
    return 'Generiertes Bild';
  }
  return null;
}

/**
 * Normalise an AI title, or reject it (null) so the fallback stays.
 *
 * Rejects anything sentence-shaped: too long, too many words, or carrying
 * sentence punctuation. A rejected title is better than a bad one — the
 * fallback below is already a valid title.
 */
export function normalizeAiTitle(raw: string | null | undefined): string | null {
  const firstLine = (raw || '').split('\n')[0] ?? '';
  const title = firstLine
    .trim()
    .replace(/^["'„»]|["'“«]$/g, '')
    .replace(/[.!?:;,]+$/, '')
    .trim();

  if (title.length < 3 || title.length > MAX_AI_TITLE_CHARS) return null;
  if (title.split(/\s+/).length > MAX_AI_TITLE_WORDS) return null;
  if (SENTENCE_END.test(title)) return null;
  return title;
}

const TITLE_PROMPT = `Du benennst einen Chat-Thread für eine schmale Seitenleiste.
Gib eine deutsche Nominalphrase aus 2-4 Wörtern aus, die das Thema benennt — wie eine Überschrift, kein Satz.
Regeln:
- Kein Verb im Imperativ ("Recherchiere …" → "Recherche …"), keine Anrede, keine Füllwörter.
- Höchstens 32 Zeichen, kein Punkt am Ende, keine Anführungszeichen.
Antworte NUR mit dem Titel.

Beispiele:
Nutzerfrage: "Kannst du mir bitte den Stand der E-Auto-Förderung recherchieren?" → E-Auto-Förderung Stand
Nutzerfrage: "Fasse die Protokolle vom 30. Juni und 1. Juli zusammen" → Protokolle Juni/Juli
Nutzerfrage: "Setz mir einen Timer auf 10 Minuten" → Timer setzen`;

/**
 * Generate a thread title: writes fallback immediately, then fires off an AI call
 * to generate a better title asynchronously.
 */
export async function generateThreadTitle(
  threadId: string,
  userMessage: string,
  assistantResponse: string,
  aiClient: AiClient,
  options?: { imageGenerated?: boolean }
): Promise<void> {
  log.info(`[ThreadTitle] generateThreadTitle called`, {
    threadId,
    userMessageLen: userMessage?.length ?? 0,
    assistantResponseLen: assistantResponse?.length ?? 0,
    imageGenerated: options?.imageGenerated,
  });

  const fallback =
    extractFallbackTitle(userMessage, options?.imageGenerated) ??
    extractFallbackTitle(assistantResponse, options?.imageGenerated);
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
    provider: LANE.provider,
    systemPrompt: TITLE_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Nutzerfrage: ${userSnippet}\nAntwort: ${assistantSnippet}`,
      },
    ],
    options: {
      model: LANE.model,
      // 80 chars of German title tokenize well past 30 — that cap cut answers
      // off mid-title (finish_reason=length), which the provider chain then
      // read as an empty response and failed over for nothing.
      max_tokens: 64,
      temperature: 0.3,
    },
  };
  log.info(`[ThreadTitle] Sending AI worker request for ${threadId}`, {
    userSnippetLen: userSnippet.length,
    assistantSnippetLen: assistantSnippet.length,
  });

  aiClient
    .processRequest(aiRequest, null)
    .then(async (response: { content?: string | null }) => {
      log.info(`[ThreadTitle] AI worker response for ${threadId}:`, {
        rawContent: response?.content,
        type: typeof response?.content,
      });
      const aiTitle = normalizeAiTitle(response.content);

      if (aiTitle) {
        await updateThreadTitleInDB(threadId, aiTitle);
        log.info(`[ThreadTitle] AI title written to DB for ${threadId}: "${aiTitle}"`);
      } else {
        log.warn(
          `[ThreadTitle] AI title rejected (value=${JSON.stringify(response.content)}), keeping fallback`
        );
      }
    })
    .catch((err: unknown) => {
      log.warn(`[ThreadTitle] AI worker FAILED for ${threadId}, keeping fallback:`, err);
    });
}
