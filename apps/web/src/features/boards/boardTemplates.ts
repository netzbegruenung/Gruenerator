import { type BoardInitialStructure } from './hooks/useBoardState';
import { FIELD_IDS, type BoardView, type Field, type Row, type SelectOption } from './types';
import {
  COLUMN_COLORS,
  DEFAULT_FIELDS,
  DEFAULT_KANBAN_VIEW,
  DEFAULT_ROWS,
} from './utils/boardDefaults';

export interface BoardTemplate {
  id: string;
  name: string;
  description: string;
  defaultTitle: string;
  structure: BoardInitialStructure;
}

function makeRow(statusId: string, title: string): Row {
  return {
    id: `row-tpl-${statusId}-${Math.random().toString(36).slice(2, 7)}`,
    cells: {
      [FIELD_IDS.TITLE]: title,
      [FIELD_IDS.STATUS]: statusId,
      [FIELD_IDS.DESCRIPTION]: '',
      [FIELD_IDS.DUE_DATE]: null,
      [FIELD_IDS.LABELS]: [],
      [FIELD_IDS.ASSIGNEE]: '',
      [FIELD_IDS.LINKED_DOCS]: '[]',
      [FIELD_IDS.COMMENTS]: '[]',
    },
    createdBy: 'system',
    createdAt: new Date().toISOString(),
  };
}

function makeKanbanView(fields: Field[]): BoardView {
  return {
    id: 'view-kanban-default',
    name: 'Kanban',
    layout: 'kanban',
    groupByFieldId: FIELD_IDS.STATUS,
    filters: [],
    sorts: [],
    fieldSettings: fields.map((f) => ({
      fieldId: f.id,
      visible: f.id !== FIELD_IDS.COMMENTS,
    })),
  };
}

// ---------------------------------------------------------------------------
// Standard (default 3-column board)
// ---------------------------------------------------------------------------

const standardTemplate: BoardTemplate = {
  id: 'board-standard',
  name: 'Board',
  description: 'Kanban mit drei Spalten',
  defaultTitle: 'Neues Board',
  structure: {
    fields: DEFAULT_FIELDS,
    rows: DEFAULT_ROWS,
    views: [DEFAULT_KANBAN_VIEW],
  },
};

// ---------------------------------------------------------------------------
// Redaktionsplanung
// ---------------------------------------------------------------------------

const redaktionStatusOptions: SelectOption[] = [
  { id: 'status-idee', name: 'Idee', color: COLUMN_COLORS[5] },
  { id: 'status-entwurf', name: 'Entwurf', color: COLUMN_COLORS[4] },
  { id: 'status-review', name: 'Review', color: COLUMN_COLORS[3] },
  { id: 'status-geplant', name: 'Geplant', color: COLUMN_COLORS[1] },
  { id: 'status-veroeffentlicht', name: 'Veröffentlicht', color: COLUMN_COLORS[7] },
];

const redaktionPlatformOptions: SelectOption[] = [
  { id: 'plattform-instagram', name: 'Instagram', color: COLUMN_COLORS[2] },
  { id: 'plattform-facebook', name: 'Facebook', color: COLUMN_COLORS[5] },
  { id: 'plattform-website', name: 'Website', color: COLUMN_COLORS[1] },
  { id: 'plattform-newsletter', name: 'Newsletter', color: COLUMN_COLORS[6] },
];

const redaktionFields: Field[] = [
  { id: FIELD_IDS.TITLE, name: 'Titel', type: 'text', typeOptions: {}, order: 0 },
  {
    id: FIELD_IDS.STATUS,
    name: 'Status',
    type: 'singleSelect',
    typeOptions: { options: redaktionStatusOptions },
    order: 1,
  },
  {
    id: 'field-plattform',
    name: 'Plattform',
    type: 'singleSelect',
    typeOptions: { options: redaktionPlatformOptions },
    order: 2,
  },
  { id: FIELD_IDS.DESCRIPTION, name: 'Beschreibung', type: 'text', typeOptions: {}, order: 3 },
  { id: FIELD_IDS.DUE_DATE, name: 'Fällig', type: 'date', typeOptions: {}, order: 4 },
  {
    id: FIELD_IDS.LABELS,
    name: 'Labels',
    type: 'multiSelect',
    typeOptions: { options: [] as SelectOption[] },
    order: 5,
  },
  { id: FIELD_IDS.ASSIGNEE, name: 'Zuständig', type: 'text', typeOptions: {}, order: 6 },
  { id: FIELD_IDS.LINKED_DOCS, name: 'Dokumente', type: 'text', typeOptions: {}, order: 7 },
  {
    id: FIELD_IDS.COMMENTS,
    name: 'Kommentare',
    type: 'text',
    typeOptions: { isSystem: true },
    order: 8,
  },
];

const redaktionTemplate: BoardTemplate = {
  id: 'board-redaktion',
  name: 'Redaktionsplan',
  description: 'Social Media & Inhalte planen',
  defaultTitle: 'Neuer Redaktionsplan',
  structure: {
    fields: redaktionFields,
    rows: redaktionStatusOptions.map((opt) => makeRow(opt.id, 'Neuer Beitrag')),
    views: [makeKanbanView(redaktionFields)],
  },
};

// ---------------------------------------------------------------------------
// Eventplanung
// ---------------------------------------------------------------------------

const eventStatusOptions: SelectOption[] = [
  { id: 'status-planung', name: 'Planung', color: COLUMN_COLORS[5] },
  { id: 'status-in-arbeit', name: 'In Arbeit', color: COLUMN_COLORS[4] },
  { id: 'status-erledigt', name: 'Erledigt', color: COLUMN_COLORS[1] },
];

const eventFields: Field[] = [
  { id: FIELD_IDS.TITLE, name: 'Titel', type: 'text', typeOptions: {}, order: 0 },
  {
    id: FIELD_IDS.STATUS,
    name: 'Status',
    type: 'singleSelect',
    typeOptions: { options: eventStatusOptions },
    order: 1,
  },
  { id: 'field-ort', name: 'Ort', type: 'text', typeOptions: {}, order: 2 },
  { id: 'field-event-datum', name: 'Datum', type: 'date', typeOptions: {}, order: 3 },
  { id: FIELD_IDS.DESCRIPTION, name: 'Beschreibung', type: 'text', typeOptions: {}, order: 4 },
  { id: FIELD_IDS.DUE_DATE, name: 'Fällig', type: 'date', typeOptions: {}, order: 5 },
  {
    id: FIELD_IDS.LABELS,
    name: 'Labels',
    type: 'multiSelect',
    typeOptions: { options: [] as SelectOption[] },
    order: 6,
  },
  { id: FIELD_IDS.ASSIGNEE, name: 'Zuständig', type: 'text', typeOptions: {}, order: 7 },
  { id: FIELD_IDS.LINKED_DOCS, name: 'Dokumente', type: 'text', typeOptions: {}, order: 8 },
  {
    id: FIELD_IDS.COMMENTS,
    name: 'Kommentare',
    type: 'text',
    typeOptions: { isSystem: true },
    order: 9,
  },
];

const eventTemplate: BoardTemplate = {
  id: 'board-event',
  name: 'Eventplanung',
  description: 'Veranstaltungen organisieren',
  defaultTitle: 'Neue Eventplanung',
  structure: {
    fields: eventFields,
    rows: eventStatusOptions.map((opt) => makeRow(opt.id, 'Neue Aufgabe')),
    views: [makeKanbanView(eventFields)],
  },
};

// ---------------------------------------------------------------------------
// Wahlkampf
// ---------------------------------------------------------------------------

const wahlkampfStatusOptions: SelectOption[] = [
  { id: 'status-backlog', name: 'Backlog', color: COLUMN_COLORS[5] },
  { id: 'status-diese-woche', name: 'Diese Woche', color: COLUMN_COLORS[4] },
  { id: 'status-in-arbeit', name: 'In Arbeit', color: COLUMN_COLORS[6] },
  { id: 'status-erledigt', name: 'Erledigt', color: COLUMN_COLORS[1] },
];

const wahlkampfPriorityOptions: SelectOption[] = [
  { id: 'prio-hoch', name: 'Hoch', color: '#c9a0a0' },
  { id: 'prio-mittel', name: 'Mittel', color: COLUMN_COLORS[4] },
  { id: 'prio-niedrig', name: 'Niedrig', color: COLUMN_COLORS[5] },
];

const wahlkampfFields: Field[] = [
  { id: FIELD_IDS.TITLE, name: 'Titel', type: 'text', typeOptions: {}, order: 0 },
  {
    id: FIELD_IDS.STATUS,
    name: 'Status',
    type: 'singleSelect',
    typeOptions: { options: wahlkampfStatusOptions },
    order: 1,
  },
  {
    id: 'field-prioritaet',
    name: 'Priorität',
    type: 'singleSelect',
    typeOptions: { options: wahlkampfPriorityOptions },
    order: 2,
  },
  { id: FIELD_IDS.DESCRIPTION, name: 'Beschreibung', type: 'text', typeOptions: {}, order: 3 },
  { id: FIELD_IDS.DUE_DATE, name: 'Fällig', type: 'date', typeOptions: {}, order: 4 },
  {
    id: FIELD_IDS.LABELS,
    name: 'Labels',
    type: 'multiSelect',
    typeOptions: { options: [] as SelectOption[] },
    order: 5,
  },
  { id: FIELD_IDS.ASSIGNEE, name: 'Zuständig', type: 'text', typeOptions: {}, order: 6 },
  { id: FIELD_IDS.LINKED_DOCS, name: 'Dokumente', type: 'text', typeOptions: {}, order: 7 },
  {
    id: FIELD_IDS.COMMENTS,
    name: 'Kommentare',
    type: 'text',
    typeOptions: { isSystem: true },
    order: 8,
  },
];

const wahlkampfTemplate: BoardTemplate = {
  id: 'board-wahlkampf',
  name: 'Wahlkampf',
  description: 'Kampagnen-Aufgaben planen',
  defaultTitle: 'Neue Wahlkampfplanung',
  structure: {
    fields: wahlkampfFields,
    rows: wahlkampfStatusOptions.map((opt) => makeRow(opt.id, 'Neue Aufgabe')),
    views: [makeKanbanView(wahlkampfFields)],
  },
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const boardTemplates: BoardTemplate[] = [
  standardTemplate,
  redaktionTemplate,
  eventTemplate,
  wahlkampfTemplate,
];

export function getBoardTemplate(id: string): BoardTemplate | null {
  return boardTemplates.find((t) => t.id === id) ?? null;
}
