/**
 * Resolve the SUBJECT of a referential creation follow-up.
 *
 * Single-pass generation handlers (sharepic, image, board, sheet/presentation)
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
  /\b(ein|eine|einen|einem|einer|das|es|dazu|davon|dies\w*|hierzu|daf(?:ü|ue)r|daraus|bitte|mir|mal|noch|jetzt|in|als|zu|von|dem|der|die|und|einfach|kurz|schnell|sharepic|share-pic|bild|bilder|grafik|foto|pr(?:ä|ae)sentation|presentation|folien|slides?|tabelle|spreadsheet|kalkulation|dokument|board|reel|video|post|newsletter)\b/giu;

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

/** Most recent substantive prior turn (the subject a referential follow-up
 *  refers back to). Skips the current (last) message; prefers the newest turn
 *  with real content, which for a "create X, then visualise it" flow is the
 *  assistant's summary of X. */
function findPriorSubject(messages: ModelMessage[]): string | null {
  for (let i = messages.length - 2; i >= 0; i--) {
    const text = extractTextContent(messages[i]?.content ?? '').trim();
    if (text.length >= 40) return text.slice(0, 2000);
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
