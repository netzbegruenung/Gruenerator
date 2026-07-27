/**
 * Resolve the SUBJECT of a referential creation follow-up.
 *
 * Single-pass generation handlers (sharepic, image, board, sheet/presentation,
 * pdf, document)
 * read ONLY the last user message for their topic. So a referential follow-up
 * like "visualisiere in einem sharepic" or "mach eine Präsentation dazu" — which
 * names no subject of its own — produced a generic artifact about the literal
 * instruction instead of the prior turn's subject (e.g. an Artenschutz research
 * turn). The full conversation is available at every one of those sites via
 * `state.messages`; this lifts the actual subject from the prior turn when the
 * current message has none.
 *
 * Pure, so it unit-tests in isolation (referentialTopic.vitest.ts).
 */
import { extractTextContent } from './messageHelpers.js';

import type { ModelMessage } from 'ai';

// Create/visualize verbs and artifact/filler words. Stripping them from the
// message leaves the actual subject; if nothing substantive remains, the
// message is referential (it points back at the conversation, names no topic).
const CREATE_VERB =
  /\b(visualisier\w*|erstell\w*|mach\w*|generier\w*|bau\w*|entwirf|entwerfe|gestalt\w*|zeichne|produzier\w*|leg\w*\s+an)\b/giu;
const ARTIFACT_FILLER =
  /\b(ein|eine|einen|einem|einer|das|es|dazu|davon|dies\w*|hierzu|daf(?:ü|ue)r|daraus|bitte|mir|mal|noch|jetzt|in|als|zu|von|dem|der|die|und|einfach|kurz|schnell|also|aus|hier|sch(?:ö|oe)n\w*|sharepic|share-pic|bild|bilder|grafik|foto|pr(?:ä|ae)sentation|presentation|folien|slides?|tabelle|spreadsheet|kalkulation|dokument|pdf|datei\w*|board|reel|video|post|newsletter)\b/giu;

/** The message with create verbs + artifact/filler words removed. */
function residualSubject(text: string): string {
  return text
    .replace(CREATE_VERB, ' ')
    .replace(ARTIFACT_FILLER, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when the message names no subject of its own (pure instruction). */
export function isReferentialCreation(text: string): boolean {
  return text.trim().length > 0 && residualSubject(text).length < 3;
}

// Our own create_* handlers persist templated confirmations ("PDF **"…"**
// wurde erstellt …"). They carry no subject — a retry like "also aus der
// tabelle" must inherit the content turn BEFORE them, not the confirmation.
const CREATION_CONFIRMATION_RE = /\bwurde erstellt\b|\beingerichtet —/;

/** Most recent substantive prior turn (the subject a referential follow-up
 *  refers back to). Skips the current (last) message; prefers the newest turn
 *  with real content, which for a "create X, then visualise it" flow is the
 *  assistant's summary of X. */
function findPriorSubject(messages: ModelMessage[]): string | null {
  for (let i = messages.length - 2; i >= 0; i--) {
    const text = extractTextContent(messages[i]?.content ?? '').trim();
    if (text.length >= 40 && !CREATION_CONFIRMATION_RE.test(text)) return text.slice(0, 2000);
  }
  return null;
}

/**
 * Returns the topic text a single-pass generator should use. When the current
 * message is referential AND a prior subject exists, the subject is prepended so
 * the generator visualises/creates about THAT, with the instruction preserved as
 * a trailing task line. Otherwise the message is returned unchanged.
 */
export function resolveReferentialTopic(
  rawText: string,
  messages: ModelMessage[]
): { text: string; inherited: boolean } {
  if (!isReferentialCreation(rawText)) return { text: rawText, inherited: false };
  const prior = findPriorSubject(messages);
  if (!prior) return { text: rawText, inherited: false };
  return { text: `${prior}\n\nAufgabe: ${rawText.trim()}`, inherited: true };
}

// ── Referential RESEARCH follow-ups ───────────────────────────────────────────

/**
 * Research/lookup verbs plus the affirmations that carry a research request
 * ("ja bitte", "mach das"). Sibling of CREATE_VERB for the search path.
 */
const RESEARCH_VERB =
  /\b(recherchier\w*|such\w*|google\w*|nachschlag\w*|nachschau\w*|schau\w*\s+nach|find\w*\s+heraus|pr(?:ü|ue)f\w*|check\w*|verifizier\w*|belege?|beleg\w*)\b/giu;
/** Filler specific to research asks — the medium, not the subject. */
const RESEARCH_FILLER =
  /\b(ja|nein|ok|okay|gerne|gern|unbedingt|web|internet|netz|online|quelle\w*|beleg\w*|studie\w*|aktuell\w*|genau\w*|nochmal|nochmals|weiter|dar(?:ü|ue)ber|dazu|danach|dann|mit|f(?:ü|ue)r|(?:ü|ue)ber|auf|an|am|im|ins|beim?|nach|zum|zur|des|den|doch|du|dir|dich|uns|unser\w*)\b/giu;

/**
 * True when the message asks for research but names no subject of its own —
 * "Ja, bitte recherchiere das jetzt im Web".
 */
export function isReferentialResearch(text: string): boolean {
  if (text.trim().length === 0) return false;
  if (!RESEARCH_VERB.test(text)) {
    RESEARCH_VERB.lastIndex = 0;
    return false;
  }
  RESEARCH_VERB.lastIndex = 0;
  const residual = text
    .replace(RESEARCH_VERB, ' ')
    .replace(RESEARCH_FILLER, ' ')
    .replace(ARTIFACT_FILLER, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return residual.length < 3;
}

/**
 * The most recent prior USER message that states a subject.
 *
 * Deliberately the USER's wording, not the assistant's prose: this feeds a
 * SEARCH QUERY, and the user's own phrasing of the question is a far better
 * query than 2000 characters of answer text.
 */
function findPriorQuerySubject(messages: ModelMessage[]): string | null {
  for (let i = messages.length - 2; i >= 0; i--) {
    const message = messages[i];
    if (message?.role !== 'user') continue;
    const text = extractTextContent(message.content ?? '').trim();
    if (text.length < 8) continue;
    if (isReferentialResearch(text) || isReferentialCreation(text)) continue;
    return text.slice(0, 300);
  }
  return null;
}

/**
 * Query a search/research turn should actually run.
 *
 * The bug this fixes: "Ja, bitte recherchiere das jetzt im Web" was passed to
 * Linkup verbatim, so a deep research run about renewables and CO2 came back
 * with "Die Grünen in Österreich" — and still carried the label "Hohe Konfidenz,
 * 20 Quellen". `resolveReferentialTopic` existed but was wired only into the
 * create_* paths, never into search.
 */
export function resolveReferentialQuery(
  rawText: string,
  messages: ModelMessage[]
): { query: string; inherited: boolean } {
  if (!isReferentialResearch(rawText)) return { query: rawText, inherited: false };
  const prior = findPriorQuerySubject(messages);
  if (!prior) return { query: rawText, inherited: false };
  return { query: prior, inherited: true };
}
