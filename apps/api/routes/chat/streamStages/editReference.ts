/**
 * Reference material for a doc/board edit trigger.
 *
 * Lands in the docs-AI route's *system prompt* as labeled instructional
 * context, never concatenated into the user prompt — an earlier attempt did
 * that and the model inserted the wrapper text verbatim into the document.
 */

import { extractTextContent } from '../services/messageHelpers.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { ModelMessage } from 'ai';

/** Cap on how much gathered reference material rides in a doc/board edit — keeps
 *  the docs-AI system prompt bounded. Matches the single-pass edit ref cap. */
const EDIT_REFERENCE_CHAR_CAP = 8000;

/** A prior assistant turn must be at least this long to count as the edit's
 *  reference material — skips the brief "Ich passe das Dokument an…" confirmation
 *  and lands on the earlier turn that actually holds the content. */
const EDIT_REFERENCE_SUBSTANTIVE_THRESHOLD = 200;

/** Render the loop's gathered sources into a reference block for a compound-edit
 *  turn — the material the docs/boards AI composes the insert from (title +
 *  content per source). Empty-content sources are dropped (they'd otherwise leak
 *  a bare title placeholder and waste the budget). */
function renderReferenceFromResults(results: ChatGraphState['searchResults']): string {
  const block = results
    .filter((r) => (r.content ?? '').trim())
    .map((r) => `${r.title ?? 'Quelle'}\n${(r.content ?? '').trim()}`)
    .join('\n\n---\n\n');
  return block.length > EDIT_REFERENCE_CHAR_CAP ? block.slice(0, EDIT_REFERENCE_CHAR_CAP) : block;
}

/** Reference material for a doc/board edit trigger (shared by the doc + board
 *  branches). compoundEdit uses this turn's freshly-gathered sources; a plain
 *  single-pass edit uses the prior substantive assistant turn. */
export function buildEditReferenceContent(
  compoundEdit: boolean,
  searchResults: ChatGraphState['searchResults'],
  validMessages: ModelMessage[],
  lastUserMessage: ModelMessage | undefined
): string {
  if (compoundEdit) return renderReferenceFromResults(searchResults);
  const lastUserIdx = lastUserMessage ? validMessages.indexOf(lastUserMessage) : -1;
  const priorMessages = lastUserIdx > 0 ? validMessages.slice(0, lastUserIdx) : [];
  const prev =
    [...priorMessages]
      .reverse()
      .map((m) => (m.role === 'assistant' ? extractTextContent(m.content) : ''))
      .find((t) => t.trim().length >= EDIT_REFERENCE_SUBSTANTIVE_THRESHOLD) ?? '';
  return prev.length > EDIT_REFERENCE_CHAR_CAP ? prev.slice(0, EDIT_REFERENCE_CHAR_CAP) : prev;
}
