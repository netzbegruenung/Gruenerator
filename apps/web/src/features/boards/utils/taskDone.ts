/**
 * "Erledigt" for a whole card. Done is not a separate flag: a card is done when its
 * status is the board's done column, so the done toggle and the kanban column can never
 * disagree (planka's `closed` list type). Pure helpers — useBoardState applies them.
 */
import { FIELD_IDS } from '../types';

import { DONE_STATUS_ID, TODO_STATUS_ID } from './boardDefaults';
import { computeNextDueDate, isRecurrencePattern } from './recurrence';

import type { Field, Row, SelectOption } from '../types';

// Boards created before `isDone` existed: the default board, the templates and the
// chat-built boards (status-1/status-2 named "Erledigt").
const LEGACY_DONE_IDS = new Set([DONE_STATUS_ID, 'status-erledigt']);
const LEGACY_DONE_NAMES = new Set(['erledigt', 'done', 'fertig', 'abgeschlossen']);

function statusOptions(fields: Field[]): SelectOption[] {
  const field = fields.find((f) => f.id === FIELD_IDS.STATUS);
  return (field?.typeOptions.options ?? []) as SelectOption[];
}

export function getDoneStatusId(fields: Field[]): string | null {
  const options = statusOptions(fields);
  const explicit = options.find((o) => o.isDone === true);
  if (explicit) return explicit.id;
  const legacy = options.find(
    (o) =>
      o.isDone !== false &&
      (LEGACY_DONE_IDS.has(o.id) || LEGACY_DONE_NAMES.has(o.name.trim().toLowerCase()))
  );
  return legacy?.id ?? null;
}

/** Make `doneId` the only done column; `null` unmarks all (and blocks the fallback). */
export function setDoneOption(options: SelectOption[], doneId: string | null): SelectOption[] {
  return options.map((o) => ({ ...o, isDone: o.id === doneId }));
}

/** Write the status cell, remembering where a card came from when it enters done. */
export function withStatus(row: Row, statusId: string, doneId: string | null): Row {
  const prev = row.cells[FIELD_IDS.STATUS];
  if (prev === statusId) return row;
  const next: Row = { ...row, cells: { ...row.cells, [FIELD_IDS.STATUS]: statusId } };
  if (doneId && statusId === doneId) {
    if (typeof prev === 'string' && prev) next.statusBeforeDone = prev;
  } else {
    delete next.statusBeforeDone;
  }
  return next;
}

function firstOpenStatusId(fields: Field[], doneId: string): string | null {
  return statusOptions(fields).find((o) => o.id !== doneId)?.id ?? null;
}

/** Where an unchecked card goes: back to its previous column, else the first open one. */
export function reopenStatusId(row: Row, fields: Field[], doneId: string): string | null {
  const before = row.statusBeforeDone;
  if (before && before !== doneId && statusOptions(fields).some((o) => o.id === before)) {
    return before;
  }
  return firstOpenStatusId(fields, doneId);
}

/** A recurring card that was just completed spawns its next occurrence. */
export function nextOccurrence(
  old: Row,
  fields: Field[],
  doneId: string
): { row: Row; dueDate: string } | null {
  const recurrence = old.cells[FIELD_IDS.RECURRENCE];
  if (!isRecurrencePattern(recurrence)) return null;
  const hasTodo = statusOptions(fields).some((o) => o.id === TODO_STATUS_ID);
  const status = hasTodo ? TODO_STATUS_ID : firstOpenStatusId(fields, doneId);
  if (!status) return null;
  const dueDate = computeNextDueDate(old.cells[FIELD_IDS.DUE_DATE], recurrence);
  return {
    dueDate,
    row: {
      id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      cells: {
        ...old.cells,
        [FIELD_IDS.STATUS]: status,
        [FIELD_IDS.DUE_DATE]: dueDate,
        ...(FIELD_IDS.COMMENTS in old.cells ? { [FIELD_IDS.COMMENTS]: '[]' } : {}),
      },
      createdBy: old.createdBy,
      createdAt: new Date().toISOString(),
      ...(old.icon ? { icon: old.icon } : {}),
      ...(old.coverColor ? { coverColor: old.coverColor } : {}),
      ...(old.coverImageUrl ? { coverImageUrl: old.coverImageUrl } : {}),
      // archivedAt and statusBeforeDone intentionally omitted (the new occurrence is open).
    },
  };
}
