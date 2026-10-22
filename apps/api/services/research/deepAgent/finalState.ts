/**
 * One line of forensics for a run that ended without a report.
 *
 * Kept to a single log line rather than a dump: the failure mode this serves is
 * "the model ended its turn on purpose", and for that the last assistant
 * utterance is the whole story.
 */

import { type ModelMessage } from 'ai';

import { lastAssistantText } from './nudgeMissingReport.js';

export function describeFinalState(messages: ModelMessage[]): string {
  const said = lastAssistantText(messages).slice(0, 300) || '<leer>';
  return `${messages.length} Nachricht(en), letzte KI-Antwort: "${said}"`;
}
