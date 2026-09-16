/**
 * Thread Title Service
 *
 * Shared service for generating and updating chat thread titles.
 * Consolidates the identical updateThreadTitle + first-sentence heuristic
 * that was duplicated across chat controllers.
 *
 * Generates AI-powered German titles using Mistral-small via `aiText`.
 */

import { and, eq, isNull, or } from 'drizzle-orm';

import { chatThreads } from '../../database/schema/chat.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { createLogger } from '../../utils/logger.js';
import { aiText } from '../ai/generate.js';

const log = createLogger('ThreadTitle');

/**
 * Titles that mean "not named yet". A thread created up front by the client's
 * `initialize()` carries NULL; `buildStreamContext` writes the placeholder when
 * the first message has no text of its own (e.g. only a pasted attachment).
 */
const PLACEHOLDER_TITLES = ['Neue Unterhaltung', 'Neuer Chat'];

/** Match a row that nobody has deliberately named. */
function unnamedCondition() {
  return or(
    isNull(chatThreads.title),
    eq(chatThreads.title, ''),
    ...PLACEHOLDER_TITLES.map((t) => eq(chatThreads.title, t))
  );
}

/**
 * Does this thread still need a generated title?
 *
 * The gate for the server-side title pass. Reading the row is what makes that
 * pass safe to run on EVERY turn instead of only the first one.
 */
export async function threadNeedsTitle(threadId: string): Promise<boolean> {
  const db = getDrizzleInstance();
  const rows = await db
    .select({ title: chatThreads.title })
    .from(chatThreads)
    .where(and(eq(chatThreads.id, threadId), unnamedCondition()))
    .limit(1);
  return rows.length > 0;
}

/**
 * Write a generated title — but only while nobody has named the thread by hand.
 *
 * Two writers race here: this service and the user's own rename (`PATCH
 * /api/chat-service/threads`). An unconditional UPDATE let a late AI title
 * overwrite a rename the user had just typed. `replacing` is the escape hatch
 * for the one legitimate overwrite: the AI title replacing the fallback that
 * the same run wrote seconds earlier.
 *
 * Returns the title if it landed, null if another writer had won.
 */
export async function updateThreadTitleInDB(
  threadId: string,
  title: string,
  replacing?: string | null
): Promise<string | null> {
  const db = getDrizzleInstance();
  const claim = replacing
    ? or(unnamedCondition(), eq(chatThreads.title, replacing))
    : unnamedCondition();
  const rows = await db
    .update(chatThreads)
    .set({ title, updated_at: new Date() })
    .where(and(eq(chatThreads.id, threadId), claim))
    .returning({ id: chatThreads.id });
  return rows.length > 0 ? title : null;
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

const ARTICLE = '(?:einen|eine|ein|den|die|das)?\\s*';

// Openers that push the actual topic out of the visible part of the title
// ("Kannst du mir bitte den Antrag …" → "Antrag …").
//
// The imperative comes last on purpose: "Bitte erstelle eine Stellenanzeige"
// only reaches it after `^bitte\s+` has run. Listed are only forms that are
// not also a German noun in the same spelling — "Suche", "Plane" and "Frage"
// stay, because stripping them would eat the topic itself.
const LEAD_IN_PATTERNS = [
  new RegExp(`^(?:kannst|könntest|würdest)\\s+du\\s+(?:mir\\s+)?(?:bitte\\s+)?${ARTICLE}`, 'i'),
  new RegExp(`^ich\\s+(?:möchte|brauche|hätte\\s+gerne)\\s+${ARTICLE}`, 'i'),
  new RegExp(`^bitte\\s+${ARTICLE}`, 'i'),
  new RegExp(
    '^(?:erstelle|schreibe?|verfasse|formuliere|entwirf|generiere|erzeuge|analysiere|' +
      'recherchiere|erkläre|übersetze|beschreibe|überarbeite|optimiere|korrigiere|ergänze|fasse)' +
      `\\s+(?:mir\\s+|uns\\s+)?(?:bitte\\s+)?${ARTICLE}`,
    'i'
  ),
];

/**
 * The title budget, in characters — one number, shared by the prompt, the
 * heuristic fallback and the AI title, so the three cannot drift apart.
 *
 * Measured, not guessed: the sidebar row leaves the title ~188px (260px panel
 * − 16px `px-2` − 24px `px-3` − 8px gap − 24px more-button), and PT Sans at
 * 14px fits ~26–28 German characters in that (~20 in the 220px desktop-app
 * panel). 32 is that plus a little slack — CSS truncates whatever overflows.
 */
const MAX_TITLE_CHARS = 32;
/** More words than this is a sentence, not a title — reject it. */
const MAX_AI_TITLE_WORDS = 6;

/** German function words — never a title on their own, never the last word. */
const FUNCTION_WORDS =
  'der|die|das|den|dem|des|ein|eine|einen|einem|eines|einer|und|oder|für|von|vom|' +
  'mit|im|in|am|an|auf|zu|zum|zur|bei|über|unter|als|aus|nach|vor|durch|um';
/**
 * A run of them left standing at the end. Cutting on a word boundary strands
 * articles and prepositions ("… Budget und Standortfragen" → "… Budget und");
 * the `+` takes the whole run, so "Suche nach dem Windkraft-Beschluss" ends at
 * "Suche" rather than at "Suche nach".
 */
const DANGLING_WORDS = new RegExp(`(?:\\s+(?:${FUNCTION_WORDS}))+$`, 'i');
const ONLY_A_FUNCTION_WORD = new RegExp(`^(?:${FUNCTION_WORDS})$`, 'i');

/** Cut at a word boundary, never mid-word. No ellipsis — the sidebar adds its own. */
function clampToWords(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = text.slice(0, max);
  const lastSpace = head.lastIndexOf(' ');
  // A single word longer than the cap is the only case we cut mid-word.
  const cut = (lastSpace > 0 ? head.slice(0, lastSpace) : head).replace(/[\s,;:–-]+$/, '');
  const trimmed = cut.replace(DANGLING_WORDS, '');
  // An article in front of one long compound ("Die Verwaltungsvorschriften-
  // änderung") has its only word boundary after the article, so a clean cut
  // leaves a bare "Die". A mid-word cut the sidebar can ellipsize beats that.
  if (ONLY_A_FUNCTION_WORD.test(trimmed)) return head.replace(/[\s,;:–-]+$/, '');
  return trimmed;
}

/**
 * German titles start with a capital; the user messages the fallback reads
 * often do not ("erstelle eine stellenanzeige" → "Stellenanzeige").
 */
function capitalizeFirst(text: string): string {
  const [firstWord = ''] = text.split(/\s/);
  // A word that already carries a capital is spelled that way on purpose —
  // "iPhone-Vergleich" must not become "IPhone-Vergleich".
  if (/[A-ZÄÖÜ]/.test(firstWord)) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
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
      return capitalizeFirst(clampToWords(trimmed, MAX_TITLE_CHARS));
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
 * Two questions, deliberately answered differently. *Is this a title at all?*
 * — too few characters, more than `MAX_AI_TITLE_WORDS` words, or sentence
 * punctuation inside: reject, the fallback is the better name. *Is it too
 * long?* — clamp it, the way the fallback is clamped.
 *
 * Length used to reject too, and that was wrong for German: the prompt asks
 * for a 2-4 word nominal phrase, and two compound nouns spend the whole budget
 * ("Sharepic Stellenanzeige Wahlkampfmanagement" is 43 characters in 3 words).
 * A well-formed title was thrown away for a lowercase imperative fallback that
 * the same prompt forbids. See #3400.
 */
export function normalizeAiTitle(raw: string | null | undefined): string | null {
  const firstLine = (raw || '').split('\n')[0] ?? '';
  const title = firstLine
    .trim()
    .replace(/^["'„»]|["'“«]$/g, '')
    .replace(/[.!?:;,]+$/, '')
    .trim();

  if (title.length < 3) return null;
  if (title.split(/\s+/).length > MAX_AI_TITLE_WORDS) return null;
  if (SENTENCE_END.test(title)) return null;
  return clampToWords(title, MAX_TITLE_CHARS);
}

const TITLE_PROMPT = `Du benennst einen Chat-Thread für eine schmale Seitenleiste.
Gib eine deutsche Nominalphrase aus 2-4 Wörtern aus, die das Thema benennt — wie eine Überschrift, kein Satz.
Regeln:
- Kein Verb im Imperativ ("Recherchiere …" → "Recherche …"), keine Anrede, keine Füllwörter.
- Höchstens ${MAX_TITLE_CHARS} Zeichen, kein Punkt am Ende, keine Anführungszeichen.
- Deutsche Komposita sind lang: lieber ein Wort weniger als über das Limit.
Antworte NUR mit dem Titel.

Beispiele:
Nutzerfrage: "Kannst du mir bitte den Stand der E-Auto-Förderung recherchieren?" → E-Auto-Förderung Stand
Nutzerfrage: "Fasse die Protokolle vom 30. Juni und 1. Juli zusammen" → Protokolle Juni/Juli
Nutzerfrage: "Setz mir einen Timer auf 10 Minuten" → Timer setzen
Nutzerfrage: "erstelle eine stellenanzeige als sharepic. stellenanzeige ist wahlkampfmanagement" → Sharepic Stellenanzeige`;

/**
 * Generate a thread title: writes fallback immediately, then fires off an AI call
 * to generate a better title asynchronously.
 *
 * Returns the fallback that reached the database, so a caller answering a
 * request can hand the client the title the sidebar will actually show. Null
 * means no title was written — no usable text, or the thread was renamed.
 */
export async function generateThreadTitle(
  threadId: string,
  userMessage: string,
  assistantResponse: string,
  options?: { imageGenerated?: boolean }
): Promise<string | null> {
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
    return null;
  }

  // Write fallback title immediately so sidebar has a name right away
  const written = await updateThreadTitleInDB(threadId, fallback);
  if (!written) {
    log.info(`[ThreadTitle] Thread ${threadId} was already named — leaving it alone`);
    return null;
  }
  log.info(`[ThreadTitle] Fallback title written to DB for ${threadId}: "${fallback}"`);

  // Fire-and-forget AI title generation
  const userSnippet = userMessage.slice(0, 300);
  const assistantSnippet = assistantResponse.slice(0, 500);

  log.info(`[ThreadTitle] Sending AI worker request for ${threadId}`, {
    userSnippetLen: userSnippet.length,
    assistantSnippetLen: assistantSnippet.length,
  });

  aiText({
    lane: 'chat_thread_title',
    pinned: 'trivial',
    system: TITLE_PROMPT,
    prompt: `Nutzerfrage: ${userSnippet}\nAntwort: ${assistantSnippet}`,
    // 80 chars of German title tokenize well past 30 — that cap cut answers
    // off mid-title (finish_reason=length), which the provider chain then
    // read as an empty response and failed over for nothing.
    maxOutputTokens: 64,
    temperature: 0.3,
  })
    .then(async (content: string) => {
      log.info(`[ThreadTitle] AI worker response for ${threadId}:`, {
        rawContent: content,
        type: typeof content,
      });
      const aiTitle = normalizeAiTitle(content);

      if (aiTitle) {
        // `fallback` as `replacing`: this is the one overwrite that is allowed
        // — our own fallback from a moment ago, never a manual rename.
        await updateThreadTitleInDB(threadId, aiTitle, fallback);
        log.info(`[ThreadTitle] AI title written to DB for ${threadId}: "${aiTitle}"`);
      } else {
        log.warn(
          `[ThreadTitle] AI title rejected (value=${JSON.stringify(content)}), keeping fallback`
        );
      }
    })
    .catch((err: unknown) => {
      log.warn(`[ThreadTitle] AI worker FAILED for ${threadId}, keeping fallback:`, err);
    });

  return fallback;
}
