import { type AssignableMember, type CurrentBoard } from '@gruenerator/contracts';

import { FIELD_IDS, type BoardView, type Field, type Row, type SelectOption } from '../types';

import { DEFAULT_STATUS_OPTIONS } from './boardDefaults';

const MAX_ROWS = 300;
const MAX_DESCRIPTION_CHARS = 500;

/**
 * Project the live board state into the compact `currentBoard` shape the chat /
 * AI backend consumes. Drops bulky cells (comments, linked docs) and truncates
 * long descriptions so the request body stays bounded on large boards.
 */
export function serializeBoardForChat(opts: {
  boardId: string;
  boardTitle: string | null;
  fields: Field[];
  rows: Row[];
  views: BoardView[];
  assignableMembers: AssignableMember[];
}): CurrentBoard {
  const { boardId, boardTitle, fields, rows, views, assignableMembers } = opts;

  const statusField = fields.find((f) => f.id === FIELD_IDS.STATUS);
  const statusOptions =
    ((statusField?.typeOptions.options as SelectOption[] | undefined) ?? DEFAULT_STATUS_OPTIONS) ||
    [];

  const trimmedRows: Row[] = rows.slice(0, MAX_ROWS).map((row) => {
    const cells: Row['cells'] = {};
    for (const [fieldId, value] of Object.entries(row.cells)) {
      if (fieldId === FIELD_IDS.COMMENTS || fieldId === FIELD_IDS.LINKED_DOCS) continue;
      if (
        fieldId === FIELD_IDS.DESCRIPTION &&
        typeof value === 'string' &&
        value.length > MAX_DESCRIPTION_CHARS
      ) {
        cells[fieldId] = `${value.slice(0, MAX_DESCRIPTION_CHARS)}…`;
        continue;
      }
      cells[fieldId] = value;
    }
    return { ...row, cells };
  });

  return {
    id: boardId,
    title: boardTitle,
    boardType: 'kanban',
    fields,
    rows: trimmedRows,
    views,
    statusOptions,
    assignableMembers: assignableMembers.map((m) => ({
      id: m.user_id,
      name: m.display_name || m.first_name || 'Unbenannt',
    })),
  };
}
