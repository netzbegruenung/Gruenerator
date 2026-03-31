export type BoardType = 'kanban' | 'whiteboard';

export interface Board {
  id: string;
  title: string;
  created_by: string;
  creator_name?: string;
  created_at: string;
  updated_at: string;
  content?: string | { is_archived?: boolean; board_type?: BoardType };
}

function parseContent(board: Board): { is_archived?: boolean; board_type?: BoardType } {
  if (!board.content) return {};
  return typeof board.content === 'string' ? JSON.parse(board.content) : board.content;
}

export function getBoardType(board: Board): BoardType {
  return parseContent(board).board_type ?? 'kanban';
}

export function isBoardArchived(board: Board): boolean {
  return !!parseContent(board).is_archived;
}

// ---------------------------------------------------------------------------
// Field system
// ---------------------------------------------------------------------------

export type FieldType =
  | 'text'
  | 'number'
  | 'singleSelect'
  | 'multiSelect'
  | 'date'
  | 'checkbox'
  | 'url'
  | 'checklist';

export interface SelectOption {
  id: string;
  name: string;
  color: string;
}

export interface Field {
  id: string;
  name: string;
  type: FieldType;
  typeOptions: Record<string, unknown>;
  order: number;
}

// ---------------------------------------------------------------------------
// Row (replaces BoardCard)
// ---------------------------------------------------------------------------

export type CellValue = string | number | boolean | string[] | null;

export interface Row {
  id: string;
  cells: Record<string, CellValue>;
  createdBy: string;
  createdAt: string;
  icon?: string;
  coverColor?: string;
}

// ---------------------------------------------------------------------------
// View system
// ---------------------------------------------------------------------------

export type ViewLayout = 'kanban' | 'table' | 'list' | 'calendar' | 'gantt';

export interface FilterRule {
  fieldId: string;
  operator: string;
  value: unknown;
}

export interface SortRule {
  fieldId: string;
  direction: 'asc' | 'desc';
}

export interface FieldSetting {
  fieldId: string;
  visible: boolean;
  width?: number;
}

export interface BoardView {
  id: string;
  name: string;
  layout: ViewLayout;
  groupByFieldId?: string;
  dateFieldId?: string;
  endDateFieldId?: string;
  hiddenGroupIds?: string[];
  filters: FilterRule[];
  sorts: SortRule[];
  fieldSettings: FieldSetting[];
}

// ---------------------------------------------------------------------------
// Grouped data (output of useViewData)
// ---------------------------------------------------------------------------

export interface RowGroup {
  groupId: string;
  groupName: string;
  groupColor: string;
  rows: Row[];
}

// ---------------------------------------------------------------------------
// Well-known field IDs (created with every new board)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Legacy types (used by MemberPicker, kept for compatibility)
// ---------------------------------------------------------------------------

export interface CardAssignee {
  id: string;
  name: string;
  avatarRobotId: number;
}

export interface CardLabel {
  id: string;
  text: string;
  color: string;
}

export interface LinkedDoc {
  id: string;
  title: string;
}

// ---------------------------------------------------------------------------
// Well-known field IDs (created with every new board)
// ---------------------------------------------------------------------------

export interface CardComment {
  id: string;
  text: string;
  authorId: string;
  authorName: string;
  authorAvatarRobotId: number;
  createdAt: string;
}

export const FIELD_IDS = {
  TITLE: 'field-title',
  STATUS: 'field-status',
  DESCRIPTION: 'field-description',
  DUE_DATE: 'field-due-date',
  LABELS: 'field-labels',
  ASSIGNEE: 'field-assignee',
  LINKED_DOCS: 'field-linked-docs',
  COMMENTS: 'field-comments',
} as const;
