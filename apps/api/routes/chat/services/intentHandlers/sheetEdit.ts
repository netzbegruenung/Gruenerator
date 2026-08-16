/**
 * edit_sheet — the Tier-2.7 follow-up on a chat-created sheet.
 */

import {
  formatSheetAsContext,
  loadSheetState,
} from '../../../../services/sheets/SheetGenerationService.js';
import { createLogger } from '../../../../utils/logger.js';
import { checkDocumentWriteAccess } from '../../../docs/documentAccess.js';
import { generateSheetOperations } from '../../../sheets/sheetAiService.js';
import { rememberArtifact, streamTextInChunks } from '../createTurnHelpers.js';
import { emitEditorOperations, planEditorOps } from '../editorOpsCore.js';
import { finishEditTurn } from '../editTurnCompletion.js';

import type { ChatGraphState } from '../../../../agents/langgraph/ChatGraph/types.js';
import type { SSEWriter } from '../sseHelpers.js';

const log = createLogger('ChatGraphController');

/**
 * edit_sheet — Tier-2.7 follow-up on a chat-created sheet ("mach die erste
 * Zeile fett"). Plans typed ops with the same planner the in-editor AI
 * assistant uses (generateSheetOperations) and hands them to the client as an
 * `editor_operations` SSE event, same shape as the agentic loop's edit tool
 * (editorTools.ts). No server-side op execution here — only the client's live
 * Univer instance computes styles/formulas correctly; ArtifactPanel relays
 * the event into the docked sheet-editor iframe via postMessage, which
 * applies it through the same applySheetOperations() the in-editor assistant
 * uses. If the sheet isn't open anywhere, the client's existing "no handler
 * registered" fallback tells the user to open it — there is deliberately no
 * second, less-correct execution path for that case.
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

  if (!(await checkDocumentWriteAccess(sheetId, userId))) {
    return fail('Du hast keine Bearbeitungsrechte für diese Tabelle.');
  }

  const state = await loadSheetState(sheetId, userId);
  if (!state) {
    return fail('Ich konnte die Tabelle nicht finden — vielleicht wurde sie gelöscht.');
  }

  const planned = await planEditorOps({
    log,
    logLabel: '[SheetEdit]',
    plan: () =>
      generateSheetOperations({
        userPrompt: userContent,
        sheetContext: formatSheetAsContext(state),
        referenceContent: null,
      }),
  });

  if (!planned.ok) {
    return fail(
      planned.reason === 'planning_failed'
        ? 'Die Änderung an der Tabelle konnte nicht geplant werden. Versuch es bitte noch einmal.'
        : 'Ich konnte daraus keine konkrete Tabellen-Änderung ableiten. Beschreib bitte genauer, was sich ändern soll.'
    );
  }

  const { operations, summary } = planned;
  const responseText = `Ich habe die Änderung an **"${state.title}"** vorbereitet (${summary}).`;
  streamTextInChunks(sse, responseText);

  emitEditorOperations(sse, 'sheet', sheetId, operations, summary);
  log.info(`[SheetEdit] planned ${operations.length} op(s) for sheet ${sheetId}`);

  if (actualThreadId) {
    await rememberArtifact(actualThreadId, 'sheet', sheetId, state.title);
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
