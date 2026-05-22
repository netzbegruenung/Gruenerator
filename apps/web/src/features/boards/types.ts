/**
 * Board domain types.
 *
 * The field/row/view model and the board document shape are derived from the
 * ts-rest contract schemas (`@gruenerator/contracts`) so the frontend and backend
 * share one source of truth. Names are aliased to the established frontend vocabulary
 * (Board/Field/Row). Only client-only types (RowGroup, MemberPicker helpers) and the
 * content-parsing helpers live here.
 */
import {
  type BoardContent,
  type BoardDocument,
  type BoardField,
  type BoardRow,
  type BoardState,
  type BoardType,
  type BoardView,
  type CellValue,
  type FieldSetting,
  type FieldType,
  type FilterRule,
  type SelectOption,
  type SortRule,
  type ViewLayout,
} from '@gruenerator/contracts';

export type Board = BoardDocument;
export type Field = BoardField;
export type Row = BoardRow;

export type {
  BoardState,
  BoardType,
  BoardView,
  CellValue,
  FieldSetting,
  FieldType,
  FilterRule,
  SelectOption,
  SortRule,
  ViewLayout,
};

// Accepts any board-ish object that carries `content` (full board document or the
// trimmed public-board payload), since that's all these helpers read.
type BoardContentHolder = { content?: BoardContent | null };

function parseContent(board: BoardContentHolder): {
  is_archived?: boolean;
  board_type?: BoardType;
} {
  if (!board.content) return {};
  if (typeof board.content !== 'string') return board.content;
  try {
    return JSON.parse(board.content) as { is_archived?: boolean; board_type?: BoardType };
  } catch {
    // Rows in `collaborative_documents` with subtype='boards' occasionally carry
    // non-JSON content (e.g. BlockNote XHTML "<blockgroup>…") when the docs
    // editor wrote to a row that was previously a board. Treat malformed
    // metadata as absent rather than crashing every consumer in render.
    return {};
  }
}

export function getBoardType(board: BoardContentHolder): BoardType {
  return parseContent(board).board_type ?? 'kanban';
}

export function isBoardArchived(board: BoardContentHolder): boolean {
  return !!parseContent(board).is_archived;
}

// ---------------------------------------------------------------------------
// Grouped data (output of useViewData) — client-only
// ---------------------------------------------------------------------------

export interface RowGroup {
  groupId: string;
  groupName: string;
  groupColor: string;
  rows: Row[];
}

// ---------------------------------------------------------------------------
// Legacy types (used by MemberPicker, kept for compatibility) — client-only
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

export interface CardComment {
  id: string;
  text: string;
  authorId: string;
  authorName: string;
  authorAvatarRobotId: number;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Well-known field IDs (created with every new board)
// ---------------------------------------------------------------------------

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
