import { FIELD_IDS } from '../types';

import type { Field, Row, BoardView, SelectOption } from '../types';

export const COLUMN_COLORS = [
  'transparent',
  '#7c9885',
  '#c9a0a0',
  '#b4a0c9',
  '#c4b08b',
  '#8da4bf',
  '#d4a07a',
  '#a0c9a8',
  '#c9b0c0',
];

export const LABEL_COLORS = [
  '#7c9885',
  '#c9a0a0',
  '#b4a0c9',
  '#c4b08b',
  '#d4a07a',
  '#8da4bf',
  '#a0c9a8',
  '#c9b0c0',
];

export const DEFAULT_STATUS_OPTIONS: SelectOption[] = [
  { id: 'status-todo', name: 'Zu erledigen', color: '#8da4bf' },
  { id: 'status-in-progress', name: 'In Arbeit', color: '#c4b08b' },
  { id: 'status-done', name: 'Erledigt', color: '#7c9885' },
];

export const DEFAULT_FIELDS: Field[] = [
  {
    id: FIELD_IDS.TITLE,
    name: 'Titel',
    type: 'text',
    typeOptions: {},
    order: 0,
  },
  {
    id: FIELD_IDS.STATUS,
    name: 'Status',
    type: 'singleSelect',
    typeOptions: { options: DEFAULT_STATUS_OPTIONS },
    order: 1,
  },
  {
    id: FIELD_IDS.DESCRIPTION,
    name: 'Beschreibung',
    type: 'text',
    typeOptions: {},
    order: 2,
  },
  {
    id: FIELD_IDS.DUE_DATE,
    name: 'Fällig',
    type: 'date',
    typeOptions: {},
    order: 3,
  },
  {
    id: FIELD_IDS.LABELS,
    name: 'Labels',
    type: 'multiSelect',
    typeOptions: { options: [] as SelectOption[] },
    order: 4,
  },
  {
    id: FIELD_IDS.ASSIGNEE,
    name: 'Zuständig',
    type: 'text',
    typeOptions: {},
    order: 5,
  },
];

export const DEFAULT_KANBAN_VIEW: BoardView = {
  id: 'view-kanban-default',
  name: 'Kanban',
  layout: 'kanban',
  groupByFieldId: FIELD_IDS.STATUS,
  filters: [],
  sorts: [],
  fieldSettings: DEFAULT_FIELDS.map((f) => ({
    fieldId: f.id,
    visible: true,
  })),
};

export function createDefaultRow(statusOptionId: string, userId: string): Row {
  return {
    id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    cells: {
      [FIELD_IDS.TITLE]: 'Neue Aufgabe',
      [FIELD_IDS.STATUS]: statusOptionId,
      [FIELD_IDS.DESCRIPTION]: '',
      [FIELD_IDS.DUE_DATE]: null,
      [FIELD_IDS.LABELS]: [],
      [FIELD_IDS.ASSIGNEE]: '',
    },
    createdBy: userId,
    createdAt: new Date().toISOString(),
  };
}

export const DEFAULT_ROWS: Row[] = DEFAULT_STATUS_OPTIONS.map((opt) => ({
  id: `row-sample-${opt.id}`,
  cells: {
    [FIELD_IDS.TITLE]: 'Neue Aufgabe',
    [FIELD_IDS.STATUS]: opt.id,
    [FIELD_IDS.DESCRIPTION]: '',
    [FIELD_IDS.DUE_DATE]: null,
    [FIELD_IDS.LABELS]: [],
    [FIELD_IDS.ASSIGNEE]: '',
  },
  createdBy: 'system',
  createdAt: new Date().toISOString(),
}));
