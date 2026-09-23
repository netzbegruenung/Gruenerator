/**
 * Reference material for a doc edit: the previous substantive assistant turn.
 *
 * The docs AI sees only the DOCUMENT, never the chat history — so a referential
 * ask ("übernimm deine letzte Antwort", "füge das ein") has to carry the text
 * with it. It lands in the docs-AI route's *system prompt* as labeled
 * instructional context, never concatenated into the user prompt — an earlier
 * attempt did that and the model inserted the wrapper text verbatim into the
 * document.
 *
 * The turn's own gathered sources are the OTHER channel and do not come from
 * here: inside the loop they are `sourceRegistry.renderReference()`, which the
 * `edit_document` tool merges with this block under its own headings.
 */

import { extractTextContent } from '../services/messageHelpers.js';

import type { ModelMessage } from 'ai';

/** Cap on how much gathered reference material rides in a doc edit — keeps the
 *  docs-AI system prompt bounded. Matches the single-pass edit ref cap, and is
 *  the cap the tool applies to BOTH channels together. */
export const EDIT_REFERENCE_CHAR_CAP = 8000;

/** A prior assistant turn must be at least this long to count as the edit's
 *  reference material — skips the brief "Ich passe das Dokument an…" confirmation
 *  and lands on the earlier turn that actually holds the content. */
const EDIT_REFERENCE_SUBSTANTIVE_THRESHOLD = 200;

/**
 * The last substantive assistant turn BEFORE this turn's user message, or ''.
 *
 * The cut is at the last user message on purpose: everything after it belongs
 * to the turn being answered right now (the loop's own narration, a held-back
 * opening), and quoting that back into the document would insert the
 * confirmation instead of the content.
 */
export function buildPriorTurnReference(messages: ModelMessage[]): string {
  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'user') {
      lastUserIdx = i;
      break;
    }
  }
  const priorMessages = lastUserIdx > 0 ? messages.slice(0, lastUserIdx) : [];
  const prev =
    [...priorMessages]
      .reverse()
      .map((m) => (m.role === 'assistant' ? extractTextContent(m.content) : ''))
      .find((t) => t.trim().length >= EDIT_REFERENCE_SUBSTANTIVE_THRESHOLD) ?? '';
  return prev.length > EDIT_REFERENCE_CHAR_CAP ? prev.slice(0, EDIT_REFERENCE_CHAR_CAP) : prev;
}
