/**
 * Pushes the lead agent back to work when it stops without a report.
 *
 * In a ReAct loop, an AI message without tool calls means "done" — and Mistral
 * Medium occasionally says done on its very first turn: it answers the research
 * question directly (or refuses it) instead of planning, so the run ends after
 * one model call with no `/bericht.md` and the user gets the fallback path.
 * Observed 11.08.2026: a run over in three seconds, `abgebrochen=false`.
 *
 * The repair: the run's outer loop sees the model end its turn, finds no
 * report, appends a user message saying what is missing and calls the model
 * again. The nudge limit is counted from the message history, not from module
 * state: a model that answers the nudge with another bare reply twice is
 * refusing, and pushing it further only spends budget on the same answer.
 */

import { type ModelMessage } from 'ai';

import { createLogger } from '../../../utils/logger.js';

import { REPORT_PATH, isUsableReport } from './report.js';

const log = createLogger('DeepAgentNudge');

/** How often one run gets pushed back to work before we accept its ending. */
export const NUDGE_LIMIT = 2;

/** Verbatim marker in the history — counting it is how the limit is enforced. */
export const NUDGE_TEXT =
  'Es liegt noch kein Bericht unter /bericht.md. Beantworte die Frage nicht direkt im Chat, ' +
  'sondern arbeite weiter: plane die Teilfragen mit write_todos, recherchiere sie über task, ' +
  'und schreibe den fertigen Bericht mit write_file nach /bericht.md.';

/** The last thing the model said, as plain text — for the log line. */
export function lastAssistantText(messages: ModelMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (msg?.role !== 'assistant') continue;
    if (typeof msg.content === 'string') return msg.content;
    return msg.content
      .map((part) => (part.type === 'text' ? part.text : ''))
      .join('')
      .trim();
  }
  return '';
}

function countNudges(messages: ModelMessage[]): number {
  return messages.filter((m) => m.role === 'user' && m.content === NUDGE_TEXT).length;
}

/**
 * The nudge to append after a turn that ended without a report, or null when
 * the run should end as it is — because a report exists, or because the model
 * has already been pushed `NUDGE_LIMIT` times.
 */
export function nudgeForMissingReport(
  messages: ModelMessage[],
  files: Record<string, string>
): ModelMessage | null {
  if (isUsableReport(files[REPORT_PATH] ?? null)) return null;

  // Truncated but logged: the WHY of a silent ending (refusal? direct
  // answer? empty content?) is otherwise invisible from the outside.
  const said = lastAssistantText(messages).slice(0, 300);
  const nudges = countNudges(messages);
  if (nudges >= NUDGE_LIMIT) {
    log.warn(
      `[nudge] Lauf endet nach ${nudges} Anstößen weiter ohne Bericht — letzte Antwort: "${said}"`
    );
    return null;
  }
  log.warn(
    `[nudge] Turn ohne Tool-Aufruf und ohne Bericht (Anstoß ${nudges + 1}/${NUDGE_LIMIT}) — letzte Antwort: "${said}"`
  );
  return { role: 'user', content: NUDGE_TEXT };
}
