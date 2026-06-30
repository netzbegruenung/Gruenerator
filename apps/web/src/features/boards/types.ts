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

/** A horizontal swimlane (A12): a lane value × the normal column groups within it. */
export interface SwimlaneGroup {
  laneId: string;
  laneName: string;
  laneColor: string;
  groups: RowGroup[];
}

// ---------------------------------------------------------------------------
// Legacy types (used by MemberPicker, kept for compatibility) — client-only
// ---------------------------------------------------------------------------

export interface CardAssignee {
  id: string;
  name: string;
  avatarRobotId: number;
  /**
   * Set when this assignee is an agent (not a person). Its `id` is the agent
   * identifier slug; assigning it delegates the card's task to that agent. Agent
   * ids must never be sent as `addedAssigneeIds` (those are cast to ::uuid[]).
   */
  agentId?: string;
}

export interface CardLabel {
  id: string;
  text: string;
  color: string;
}

// ---------------------------------------------------------------------------
// Checklists (Feature 1) — stored as a JSON string in the FIELD_IDS.CHECKLIST cell
// ---------------------------------------------------------------------------

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
  doneBy?: string;
  doneAt?: string;
  /** Optional person responsible for this individual subtask. */
  assignee?: CardAssignee;
}

export interface ChecklistGroup {
  id: string;
  title: string;
  items: ChecklistItem[];
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
  CHECKLIST: 'field-checklist',
  RECURRENCE: 'field-recurrence',
} as const;

// ---------------------------------------------------------------------------
// Cell parsing helpers (single source of truth for serialized cells)
// ---------------------------------------------------------------------------

/**
 * Lenient parser for the assignee cell. Handles every shape the cell has ever
 * held so the migration to multiple assignees needs no data backfill:
 *  - empty / null        → []
 *  - legacy single object → [obj]
 *  - raw display-name str → [{ id:'', name, avatarRobotId:1 }]
 *  - new JSON array       → as-is
 * The next write upgrades the cell to the array form. EVERY read path must go
 * through this — never JSON.parse the assignee cell inline.
 */
export function parseAssignees(raw: CellValue | undefined): CardAssignee[] {
  if (raw == null || raw === '') return [];
  if (typeof raw !== 'string') return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Non-JSON: treat the raw string as a bare display name.
    return [{ id: '', name: raw, avatarRobotId: 1 }];
  }
  if (Array.isArray(parsed)) {
    return parsed.filter((a): a is CardAssignee => !!a && typeof a === 'object' && 'name' in a);
  }
  if (parsed && typeof parsed === 'object' && 'name' in parsed) {
    return [parsed as CardAssignee];
  }
  return [];
}

export function serializeAssignees(assignees: CardAssignee[]): string {
  return assignees.length ? JSON.stringify(assignees) : '';
}

/** Parse the checklist cell (JSON string) into groups; tolerant of malformed data. */
export function parseChecklists(raw: CellValue | undefined): ChecklistGroup[] {
  if (raw == null || raw === '' || typeof raw !== 'string') return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (g): g is ChecklistGroup => !!g && typeof g === 'object' && 'items' in g && 'id' in g
    );
  } catch {
    return [];
  }
}

/** Flatten checklist progress to { done, total } across all groups on a card. */
export function checklistProgress(groups: ChecklistGroup[]): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const g of groups) {
    for (const it of g.items) {
      total++;
      if (it.done) done++;
    }
  }
  return { done, total };
}
