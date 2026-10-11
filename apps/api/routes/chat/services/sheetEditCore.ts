/**
 * Planen und Einreihen einer Tabellen-Änderung — der eine Weg, den der
 * Schnellweg (`edit_sheet`-Intent) und das Loop-Werkzeug `edit_sheet` teilen.
 */
import {
  formatSheetAsContext,
  loadSheetState,
} from '../../../services/sheets/SheetGenerationService.js';
import { queueSheetOps } from '../../../services/sheets/sheetOpsQueueService.js';
import { createLogger } from '../../../utils/logger.js';
import { checkDocumentWriteAccess } from '../../docs/documentAccess.js';
import { generateSheetOperations } from '../../sheets/sheetAiService.js';

import { planEditorOps } from './editorOpsCore.js';

const log = createLogger('SheetEditCore');

/** Ops, die Inhalt entfernen — sie laufen erst nach Zustimmung (confirmGate). */
const DESTRUCTIVE_SHEET_OPS = new Set([
  'delete_rows',
  'delete_columns',
  'clear_range',
  'delete_sheet',
]);

export type SheetEditOutcome =
  | { status: 'queued'; title: string; summary: string; live: boolean; operationCount: number }
  | { status: 'needs_confirmation'; title: string; summary: string }
  | { status: 'failed'; message: string };

export async function planAndQueueSheetEdit(opts: {
  sheetId: string;
  userId: string;
  instruction: string;
  /** false: Löschungen werden geplant, aber nicht eingereiht. */
  destructiveAllowed: boolean;
}): Promise<SheetEditOutcome> {
  const { sheetId, userId, instruction } = opts;
  if (!(await checkDocumentWriteAccess(sheetId, userId))) {
    return { status: 'failed', message: 'Du hast keine Bearbeitungsrechte für diese Tabelle.' };
  }
  const state = await loadSheetState(sheetId, userId);
  if (!state) {
    return {
      status: 'failed',
      message: 'Ich konnte die Tabelle nicht finden — vielleicht wurde sie gelöscht.',
    };
  }

  const planned = await planEditorOps({
    log,
    logLabel: '[SheetEdit]',
    plan: () =>
      generateSheetOperations({
        userPrompt: instruction,
        sheetContext: formatSheetAsContext(state),
        referenceContent: null,
      }),
  });
  if (!planned.ok) {
    return {
      status: 'failed',
      message:
        planned.reason === 'planning_failed'
          ? 'Die Änderung an der Tabelle konnte nicht geplant werden. Versuch es bitte noch einmal.'
          : 'Ich konnte daraus keine konkrete Tabellen-Änderung ableiten. Beschreib bitte genauer, was sich ändern soll.',
    };
  }

  const { operations, summary } = planned;
  if (!opts.destructiveAllowed && operations.some((op) => DESTRUCTIVE_SHEET_OPS.has(op.type))) {
    return { status: 'needs_confirmation', title: state.title, summary };
  }

  try {
    const { live } = await queueSheetOps(sheetId, operations, summary);
    return {
      status: 'queued',
      title: state.title,
      summary,
      live,
      operationCount: operations.length,
    };
  } catch (err) {
    log.error(`[SheetEdit] queueing ${operations.length} op(s) for ${sheetId} failed: ${err}`);
    return {
      status: 'failed',
      message:
        'Die Änderung konnte nicht an die Tabelle übergeben werden. Versuch es bitte gleich noch einmal.',
    };
  }
}

export function queuedSheetEditText(outcome: {
  title: string;
  summary: string;
  live: boolean;
}): string {
  return outcome.live
    ? `Die Änderung an **"${outcome.title}"** ist eingetragen (${outcome.summary}) und erscheint gleich in der geöffneten Tabelle.`
    : `Die Änderung an **"${outcome.title}"** ist eingetragen (${outcome.summary}). Sie wird angewendet, sobald du die Tabelle öffnest.`;
}
