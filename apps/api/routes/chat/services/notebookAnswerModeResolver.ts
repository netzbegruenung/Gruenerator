/**
 * Welcher Antwortmodus ein Turn der Notebook-Seite fährt: `chat` (die
 * Notebook-RAG-Pipeline) oder `praezision` (der agentische Loop mit
 * `notebook_quellen`, gesperrt auf die Notebooks der Seite).
 *
 * Reihenfolge:
 * 1. Kein Feld → chat (`default`) — alte Mobile-Binaries, Eval, Grün-O-Mat.
 *    `chat` → chat (`explicit`).
 * 2. Kein Notebook der Seite, das `notebook_quellen` lesen kann → chat
 *    (`ineligible`); bei ausdrücklicher Präzision mit Warnung.
 * 3. `praezision` → praezision (`explicit`).
 * 4. `auto` → HIER folgt der Vorfilter und der LLM-Wächter. Bis dahin: chat
 *    (`default`), damit ein Client, der `auto` schon sendet, nichts Teures
 *    auslöst.
 */
import { toolReadsSystemNotebook } from '../../../agents/langgraph/ChatGraph/nodes/classifierNode.js';
import { isUserNotebookId } from '../../../config/notebookCollectionMap.js';

import type {
  ChatWarningCode,
  NotebookAnswerMode,
  NotebookAnswerModeEvent,
} from '@gruenerator/contracts';

export interface NotebookAnswerModeInput {
  /** `answerMode` aus dem Request; null, wenn er keines trug. */
  requested: NotebookAnswerMode | null;
  /** Die Notebooks der Seite (`collectionIds`, sonst `[collectionId]`). */
  collectionIds: readonly string[];
  userLocale: string | null;
}

export interface NotebookAnswerModeResolution {
  decision: NotebookAnswerModeEvent;
  warning: Extract<ChatWarningCode, 'notebook_praezision_unavailable'> | null;
}

/**
 * Kann der Loop mindestens ein Notebook der Seite lesen? Dieselbe Regel wie
 * der Werkzeug-Handoff im Klassifikator: ein eigenes Notebook, oder ein
 * System-Notebook aus EINER Sammlung, die der Locale zusteht.
 */
export function isPraezisionEligible(
  collectionIds: readonly string[],
  userLocale: string | null
): boolean {
  return collectionIds.some(
    (id) => isUserNotebookId(id) || toolReadsSystemNotebook(id, userLocale)
  );
}

export async function resolveNotebookAnswerMode(
  input: NotebookAnswerModeInput
): Promise<NotebookAnswerModeResolution> {
  const { requested } = input;
  const decide = (
    resolved: NotebookAnswerModeEvent['resolved'],
    reason: NotebookAnswerModeEvent['reason'],
    warning: NotebookAnswerModeResolution['warning'] = null
  ): NotebookAnswerModeResolution => ({ decision: { requested, resolved, reason }, warning });

  if (requested == null) return decide('chat', 'default');
  if (requested === 'chat') return decide('chat', 'explicit');

  if (!isPraezisionEligible(input.collectionIds, input.userLocale)) {
    return decide(
      'chat',
      'ineligible',
      requested === 'praezision' ? 'notebook_praezision_unavailable' : null
    );
  }
  if (requested === 'praezision') return decide('praezision', 'explicit');

  // `auto`: Vorfilter + LLM-Wächter kommen hier hin (eigener PR).
  return decide('chat', 'default');
}
