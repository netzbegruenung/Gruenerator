/**
 * edit_sheet — the Tier-2.7 follow-up on a chat-created sheet.
 */

import { rememberArtifact, streamTextInChunks } from '../createTurnHelpers.js';
import { finishEditTurn } from '../editTurnCompletion.js';
import { planAndQueueSheetEdit, queuedSheetEditText } from '../sheetEditCore.js';

import type { ChatGraphState } from '../../../../agents/langgraph/ChatGraph/types.js';
import type { SSEWriter } from '../sseHelpers.js';

/**
 * edit_sheet — Tier-2.7 follow-up on a chat-created sheet ("mach die erste
 * Zeile fett"). Plans typed ops with the same planner the in-editor AI
 * assistant uses (generateSheetOperations) and queues them on the sheet's Y.Doc
 * (sheetOpsQueueService). The server never executes them — only a live Univer
 * instance computes styles/formulas correctly — so the open editor applies
 * them within a second, or the next one to open the sheet does. Streaming the
 * ops to the browser instead dropped them whenever the sheet wasn't open
 * (#4457), while the answer had already said "vorbereitet".
 */
export async function handleSheetEdit(opts: {
  sse: SSEWriter;
  classifiedState: ChatGraphState;
  actualThreadId?: string;
  userId: string;
  userContent: string;
}): Promise<boolean> {
  const { sse, classifiedState, actualThreadId, userId, userContent } = opts;
  const sheetId = classifiedState.sheetEditId;

  sse.send('response_start', { message: 'Bearbeite Tabelle...' });

  const fail = async (text: string): Promise<boolean> => {
    sse.send('text_delta', { text });
    await finishEditTurn({
      sse,
      threadId: actualThreadId ?? null,
      text,
      intent: 'edit_sheet',
      persistLabel: 'editSheet:persist',
      logPrefix: '[SheetEdit]',
      startTime: classifiedState.startTime,
      classificationTimeMs: classifiedState.classificationTimeMs,
      streamed: true,
    });
    return true;
  };

  if (!sheetId) {
    return fail(
      'Ich konnte die Tabelle nicht zuordnen. Öffne sie kurz, dann kann ich sie bearbeiten.'
    );
  }

  const outcome = await planAndQueueSheetEdit({
    sheetId,
    userId,
    instruction: userContent,
    destructiveAllowed: false,
  });
  if (outcome.status === 'failed') return fail(outcome.message);

  // Wie beim MCP: was Inhalt entfernt, läuft erst nach Zustimmung — das „ja"
  // landet beim Loop-Werkzeug edit_sheet, das dann mit confirm=true einreiht.
  const responseText =
    outcome.status === 'needs_confirmation'
      ? `Dabei würde in **"${outcome.title}"** Inhalt gelöscht (${outcome.summary}). Soll ich das so machen?`
      : queuedSheetEditText(outcome);
  streamTextInChunks(sse, responseText);

  if (actualThreadId) {
    await rememberArtifact(actualThreadId, 'sheet', sheetId, outcome.title);
  }

  await finishEditTurn({
    sse,
    threadId: actualThreadId ?? null,
    text: responseText,
    intent: 'edit_sheet',
    persistLabel: 'editSheet:persist',
    logPrefix: '[SheetEdit]',
    startTime: classifiedState.startTime,
    classificationTimeMs: classifiedState.classificationTimeMs,
    streamed: true,
  });
  return true;
}
