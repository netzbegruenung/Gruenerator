/**
 * Pushes the lead agent back to work when it stops without a report.
 *
 * In a ReAct loop, an AI message without tool calls means "done" — and Mistral
 * Medium occasionally says done on its very first turn: it answers the research
 * question directly (or refuses it) instead of planning, so the run ends after
 * one model call with no `/bericht.md` and the user gets the fallback path.
 * Observed 11.08.2026: a run over in three seconds, `abgebrochen=false`.
 *
 * The repair is the same shape as `sanitizeToolCalls`: append a user message
 * telling the model what is missing and jump back to the model node. Two
 * details are load-bearing:
 *
 * - `jumpTo: 'model'` plus `canJumpTo` on the hook. Without the declared jump,
 *   the agent's router ends the run anyway — an appended message alone changes
 *   nothing about the routing.
 * - A nudge limit counted from the message history, not from module state: a
 *   model that answers the nudge with another bare reply twice is refusing, and
 *   pushing it further only spends budget on the same answer.
 */

import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { createMiddleware } from 'langchain';

import { createLogger } from '../../../utils/logger.js';

import { REPORT_PATH, isUsableReport, readFile } from './report.js';

const log = createLogger('DeepAgentNudge');

/** How often one run gets pushed back to work before we accept its ending. */
export const NUDGE_LIMIT = 2;

/** Verbatim marker in the history — counting it is how the limit is enforced. */
export const NUDGE_TEXT =
  'Es liegt noch kein Bericht unter /bericht.md. Beantworte die Frage nicht direkt im Chat, ' +
  'sondern arbeite weiter: plane die Teilfragen mit write_todos, recherchiere sie über task, ' +
  'und schreibe den fertigen Bericht mit write_file nach /bericht.md.';

function contentToString(content: unknown): string {
  if (typeof content === 'string') return content;
  try {
    return JSON.stringify(content) ?? '';
  } catch {
    return String(content);
  }
}

function countNudges(messages: unknown[]): number {
  return messages.filter((m) => m instanceof HumanMessage && m.content === NUDGE_TEXT).length;
}

export const nudgeMissingReportMiddleware = createMiddleware({
  name: 'nudgeMissingReport',
  afterModel: {
    canJumpTo: ['model'],
    hook: (state: { messages?: unknown[]; files?: unknown }) => {
      const messages = state.messages ?? [];
      const last = messages[messages.length - 1];
      if (!(last instanceof AIMessage)) return undefined;
      if ((last.tool_calls ?? []).length > 0) return undefined;
      if (isUsableReport(readFile(state.files, REPORT_PATH))) return undefined;

      // Truncated but logged: the WHY of a silent ending (refusal? direct
      // answer? empty content?) is otherwise invisible from the outside.
      const said = contentToString(last.content).slice(0, 300);
      const nudges = countNudges(messages);
      if (nudges >= NUDGE_LIMIT) {
        log.warn(
          `[nudge] Lauf endet nach ${nudges} Anstößen weiter ohne Bericht — letzte Antwort: "${said}"`
        );
        return undefined;
      }

      log.warn(
        `[nudge] Turn ohne Tool-Aufruf und ohne Bericht (Anstoß ${nudges + 1}/${NUDGE_LIMIT}) — letzte Antwort: "${said}"`
      );
      return {
        messages: [new HumanMessage(NUDGE_TEXT)],
        jumpTo: 'model',
      } as never;
    },
  },
});
