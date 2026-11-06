import { describe, expect, it } from 'vitest';

import { FIELD_IDS, type BoardState } from './BoardService.js';
import { openCardsAssignedTo, sortByDue } from './myOpenCards.js';

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

const assignee = (id: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify([{ id, name: 'X', avatarRobotId: 1, ...extra }]);

function board(
  options: Array<Record<string, unknown>>,
  rows: Array<Record<string, unknown>>
): BoardState {
  return {
    id: 'b1',
    title: 'Board',
    boardType: 'kanban',
    fields: [
      {
        id: FIELD_IDS.STATUS,
        name: 'Status',
        type: 'singleSelect',
        typeOptions: { options },
        order: 0,
      },
    ],
    rows: rows.map((cells, i) => ({ id: `r${i}`, cells, createdBy: ME, createdAt: '' })),
    views: [],
  };
}

describe('openCardsAssignedTo', () => {
  it('keeps open cards assigned to me by id and drops done, foreign and name-only cards', () => {
    const b = board(
      [
        { id: 'status-todo', name: 'Offen' },
        { id: 'status-x', name: 'Fertig gemacht', isDone: true },
      ],
      [
        {
          [FIELD_IDS.TITLE]: 'Mine open',
          [FIELD_IDS.STATUS]: 'status-todo',
          [FIELD_IDS.ASSIGNEE]: assignee(ME),
        },
        {
          [FIELD_IDS.TITLE]: 'Mine done',
          [FIELD_IDS.STATUS]: 'status-x',
          [FIELD_IDS.ASSIGNEE]: assignee(ME),
        },
        {
          [FIELD_IDS.TITLE]: 'Theirs',
          [FIELD_IDS.STATUS]: 'status-todo',
          [FIELD_IDS.ASSIGNEE]: assignee(OTHER),
        },
        {
          [FIELD_IDS.TITLE]: 'Name only',
          [FIELD_IDS.STATUS]: 'status-todo',
          [FIELD_IDS.ASSIGNEE]: 'Moritz',
        },
        {
          [FIELD_IDS.TITLE]: 'Agent',
          [FIELD_IDS.STATUS]: 'status-todo',
          [FIELD_IDS.ASSIGNEE]: assignee(ME, { agentId: 'a' }),
        },
      ]
    );
    expect(openCardsAssignedTo(b, ME).map((c) => c.title)).toEqual(['Mine open']);
  });

  it('recognises legacy done columns by name', () => {
    const b = board(
      [
        { id: 'status-1', name: 'Offen' },
        { id: 'status-2', name: 'Erledigt' },
      ],
      [
        {
          [FIELD_IDS.TITLE]: 'Done',
          [FIELD_IDS.STATUS]: 'status-2',
          [FIELD_IDS.ASSIGNEE]: assignee(ME),
        },
      ]
    );
    expect(openCardsAssignedTo(b, ME)).toEqual([]);
  });

  it('reads the due day from date and datetime cells', () => {
    const b = board(
      [{ id: 's', name: 'Offen' }],
      [
        {
          [FIELD_IDS.TITLE]: 'A',
          [FIELD_IDS.STATUS]: 's',
          [FIELD_IDS.ASSIGNEE]: assignee(ME),
          [FIELD_IDS.DUE_DATE]: '2026-11-06T10:00:00Z',
        },
      ]
    );
    expect(openCardsAssignedTo(b, ME)[0]?.dueDate).toBe('2026-11-06');
  });
});

describe('sortByDue', () => {
  it('sorts earliest due first and undated last', () => {
    const c = (title: string, dueDate: string | null) => ({
      boardId: 'b',
      boardTitle: 'B',
      cardId: title,
      title,
      dueDate,
    });
    expect(
      sortByDue([c('none', null), c('late', '2026-11-20'), c('early', '2026-11-01')]).map(
        (x) => x.title
      )
    ).toEqual(['early', 'late', 'none']);
  });
});
