/**
 * applyBoardOperations — the client-side executor for the board AI assistant's
 * ops (agentic loop's edit_document tool → editor_operations SSE → here).
 *
 * SAFETY: `ALLOWED_OPS` (added in a0823bef4, "restrict AI assistant to creating
 * new items only") gates every op BEFORE the switch — only create_task,
 * add_column, add_field and add_view ever reach their case block. The switch
 * still has full handlers for update_task, move_task, delete_task, add_comment
 * and the rest, but they are unreachable through this function today. These
 * tests assert what the code actually does: the allowed ops apply, the
 * currently-disabled ones are reported in `skipped` and never touch the fake
 * `BoardMutations`/`addComment`/`confirmDelete`.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  applyBoardOperations,
  type BoardExecutorCtx,
  type BoardMutations,
} from './applyBoardOperations';
import { FIELD_IDS, type Field, type Row, type SelectOption } from './types';

import type { AssignableMember, BoardOperation } from '@gruenerator/contracts';

const STATUS_OPTIONS: SelectOption[] = [
  { id: 'status-todo', name: 'Zu erledigen', color: '#8da4bf' },
  { id: 'status-done', name: 'Erledigt', color: '#7c9885' },
];

function makeFields(): Field[] {
  return [
    { id: FIELD_IDS.TITLE, name: 'Titel', type: 'text', typeOptions: {}, order: 0 },
    {
      id: FIELD_IDS.STATUS,
      name: 'Status',
      type: 'singleSelect',
      typeOptions: { options: [...STATUS_OPTIONS] },
      order: 1,
    },
    { id: FIELD_IDS.DESCRIPTION, name: 'Beschreibung', type: 'text', typeOptions: {}, order: 2 },
    { id: FIELD_IDS.DUE_DATE, name: 'Fällig', type: 'date', typeOptions: {}, order: 3 },
    {
      id: FIELD_IDS.LABELS,
      name: 'Labels',
      type: 'multiSelect',
      typeOptions: { options: [] },
      order: 4,
    },
    { id: FIELD_IDS.ASSIGNEE, name: 'Zuständig', type: 'text', typeOptions: {}, order: 5 },
  ];
}

function makeRow(id: string, title: string, statusId: string): Row {
  return {
    id,
    cells: {
      [FIELD_IDS.TITLE]: title,
      [FIELD_IDS.STATUS]: statusId,
      [FIELD_IDS.DESCRIPTION]: '',
      [FIELD_IDS.DUE_DATE]: null,
      [FIELD_IDS.LABELS]: [],
      [FIELD_IDS.ASSIGNEE]: '',
    },
    createdBy: 'user-1',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

/** Fake BoardMutations recording every call, seeded with one existing row. */
function makeBoardState(overrides?: Partial<BoardMutations>): BoardMutations {
  return {
    fields: makeFields(),
    rows: [makeRow('row-1', 'Bestehende Aufgabe', 'status-todo')],
    views: [],
    addRow: vi.fn(),
    updateRow: vi.fn(),
    updateRowCell: vi.fn(),
    deleteRow: vi.fn(),
    duplicateRow: vi.fn(),
    addField: vi.fn(),
    updateField: vi.fn(),
    addView: vi.fn(),
    ...overrides,
  };
}

function makeCtx(
  boardState: BoardMutations,
  overrides?: Partial<BoardExecutorCtx>
): BoardExecutorCtx {
  const members: AssignableMember[] = [
    {
      user_id: 'u-1',
      source: 'direct',
      first_name: 'Alex',
      display_name: 'Alex Grün',
      avatar_robot_id: 3,
    },
  ];
  return {
    boardState,
    currentUserId: 'user-1',
    assignableMembers: members,
    addComment: vi.fn().mockResolvedValue(undefined),
    confirmDelete: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

describe('applyBoardOperations', () => {
  it('create_task resolves an existing status/label name to its id', async () => {
    const boardState = makeBoardState({
      fields: [
        ...makeFields().filter((f) => f.id !== FIELD_IDS.LABELS),
        {
          id: FIELD_IDS.LABELS,
          name: 'Labels',
          type: 'multiSelect',
          typeOptions: { options: [{ id: 'label-1', name: 'Dringend', color: '#c9a0a0' }] },
          order: 4,
        },
      ],
    });
    const ctx = makeCtx(boardState);
    const ops: BoardOperation[] = [
      { type: 'create_task', title: 'Neue Karte', status: 'Erledigt', labels: ['Dringend'] },
    ];

    const result = await applyBoardOperations(ops, ctx);

    expect(result).toEqual({ applied: 1, skipped: [] });
    expect(boardState.addRow).toHaveBeenCalledTimes(1);
    const row = (boardState.addRow as ReturnType<typeof vi.fn>).mock.calls[0][0] as Row;
    expect(row.cells[FIELD_IDS.STATUS]).toBe('status-done');
    expect(row.cells[FIELD_IDS.LABELS]).toEqual(['label-1']);
    // No option was missing, so no field update was needed.
    expect(boardState.updateField).not.toHaveBeenCalled();
  });

  it('create_task auto-creates a missing status column and label', async () => {
    const boardState = makeBoardState();
    const ctx = makeCtx(boardState);
    const ops: BoardOperation[] = [
      {
        type: 'create_task',
        title: 'Neue Karte',
        status: 'Warten auf Rückmeldung',
        labels: ['Presse'],
      },
    ];

    const result = await applyBoardOperations(ops, ctx);

    expect(result).toEqual({ applied: 1, skipped: [] });
    // Both the new status option and the new label were written back via updateField.
    expect(boardState.updateField).toHaveBeenCalledWith(
      FIELD_IDS.STATUS,
      expect.objectContaining({
        typeOptions: expect.objectContaining({
          options: expect.arrayContaining([
            expect.objectContaining({ name: 'Warten auf Rückmeldung' }),
          ]),
        }),
      })
    );
    expect(boardState.updateField).toHaveBeenCalledWith(
      FIELD_IDS.LABELS,
      expect.objectContaining({
        typeOptions: expect.objectContaining({
          options: expect.arrayContaining([expect.objectContaining({ name: 'Presse' })]),
        }),
      })
    );
    const row = (boardState.addRow as ReturnType<typeof vi.fn>).mock.calls[0][0] as Row;
    expect(row.cells[FIELD_IDS.STATUS]).not.toBe('');
    expect(row.cells[FIELD_IDS.STATUS]).not.toBeNull();
  });

  it('add_column auto-creates a status option via resolveStatusId', async () => {
    const boardState = makeBoardState();
    const ctx = makeCtx(boardState);
    const ops: BoardOperation[] = [{ type: 'add_column', name: 'Review' }];

    const result = await applyBoardOperations(ops, ctx);

    expect(result).toEqual({ applied: 1, skipped: [] });
    expect(boardState.updateField).toHaveBeenCalledWith(
      FIELD_IDS.STATUS,
      expect.objectContaining({
        typeOptions: expect.objectContaining({
          options: expect.arrayContaining([expect.objectContaining({ name: 'Review' })]),
        }),
      })
    );
  });

  it('add_field creates a select field with resolved options', async () => {
    const boardState = makeBoardState();
    const ctx = makeCtx(boardState);
    const ops: BoardOperation[] = [
      {
        type: 'add_field',
        name: 'Priorität',
        fieldType: 'singleSelect',
        options: ['Hoch', 'Niedrig'],
      },
    ];

    const result = await applyBoardOperations(ops, ctx);

    expect(result).toEqual({ applied: 1, skipped: [] });
    expect(boardState.addField).toHaveBeenCalledTimes(1);
    const field = (boardState.addField as ReturnType<typeof vi.fn>).mock.calls[0][0] as Field;
    expect(field.name).toBe('Priorität');
    expect(field.type).toBe('singleSelect');
    const options = field.typeOptions.options as SelectOption[];
    expect(options.map((o) => o.name)).toEqual(['Hoch', 'Niedrig']);
  });

  it('add_view creates a kanban view grouped by the status field', async () => {
    const boardState = makeBoardState();
    const ctx = makeCtx(boardState);
    const ops: BoardOperation[] = [{ type: 'add_view', name: 'Mein Kanban', layout: 'kanban' }];

    const result = await applyBoardOperations(ops, ctx);

    expect(result).toEqual({ applied: 1, skipped: [] });
    expect(boardState.addView).toHaveBeenCalledTimes(1);
    const view = (boardState.addView as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(view.layout).toBe('kanban');
    expect(view.groupByFieldId).toBe(FIELD_IDS.STATUS);
  });

  it('update_task is disabled by ALLOWED_OPS — skipped, no mutation applied', async () => {
    const boardState = makeBoardState();
    const ctx = makeCtx(boardState);
    const ops: BoardOperation[] = [{ type: 'update_task', taskId: 'row-1', title: 'Neuer Titel' }];

    const result = await applyBoardOperations(ops, ctx);

    expect(result.applied).toBe(0);
    expect(result.skipped).toEqual([
      '„update_task" ist deaktiviert — die KI darf nur neue Einträge anlegen',
    ]);
    expect(boardState.updateRowCell).not.toHaveBeenCalled();
  });

  it('move_task is disabled by ALLOWED_OPS — skipped, no mutation applied', async () => {
    const boardState = makeBoardState();
    const ctx = makeCtx(boardState);
    const ops: BoardOperation[] = [{ type: 'move_task', taskId: 'row-1', status: 'Erledigt' }];

    const result = await applyBoardOperations(ops, ctx);

    expect(result.applied).toBe(0);
    expect(result.skipped).toEqual([
      '„move_task" ist deaktiviert — die KI darf nur neue Einträge anlegen',
    ]);
    expect(boardState.updateRowCell).not.toHaveBeenCalled();
  });

  it('delete_task is disabled by ALLOWED_OPS — confirmDelete is never called', async () => {
    const boardState = makeBoardState();
    const ctx = makeCtx(boardState);
    const ops: BoardOperation[] = [{ type: 'delete_task', taskId: 'row-1' }];

    const result = await applyBoardOperations(ops, ctx);

    expect(result.applied).toBe(0);
    expect(result.skipped).toEqual([
      '„delete_task" ist deaktiviert — die KI darf nur neue Einträge anlegen',
    ]);
    expect(ctx.confirmDelete).not.toHaveBeenCalled();
    expect(boardState.deleteRow).not.toHaveBeenCalled();
  });

  it('add_comment is disabled by ALLOWED_OPS — the injected addComment is never called', async () => {
    const boardState = makeBoardState();
    const ctx = makeCtx(boardState);
    const ops: BoardOperation[] = [{ type: 'add_comment', taskId: 'row-1', text: 'Hallo' }];

    const result = await applyBoardOperations(ops, ctx);

    expect(result.applied).toBe(0);
    expect(result.skipped).toEqual([
      '„add_comment" ist deaktiviert — die KI darf nur neue Einträge anlegen',
    ]);
    expect(ctx.addComment).not.toHaveBeenCalled();
  });

  it('an unknown op type is counted as skipped, not thrown', async () => {
    const boardState = makeBoardState();
    const ctx = makeCtx(boardState);
    const ops = [{ type: 'do_something_unrecognised' }] as unknown as BoardOperation[];

    await expect(applyBoardOperations(ops, ctx)).resolves.toEqual({
      applied: 0,
      skipped: [
        '„do_something_unrecognised" ist deaktiviert — die KI darf nur neue Einträge anlegen',
      ],
    });
  });
});
