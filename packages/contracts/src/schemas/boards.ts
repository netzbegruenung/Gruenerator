/**
 * Zod schemas for boards endpoints.
 * Mirrors apps/api/routes/boards/boardsController.ts.
 */
import { z } from 'zod';

import { boardAiTaskSchema } from './boardFlow.js';

// ── Request bodies ──────────────────────────────────────────────────────────

export const generateBoardBodySchema = z.object({
  description: z.string(),
});

export const createBoardBodySchema = z.object({
  title: z.string().optional(),
  boardType: z.enum(['kanban', 'whiteboard']).optional(),
});

export const updateBoardBodySchema = z.object({
  title: z.string().optional(),
  is_archived: z.boolean().optional(),
  // Markdown board description (board-level briefing); null clears it.
  description: z.string().nullish(),
});

// ── Response schemas ────────────────────────────────────────────────────────

export const boardErrorResponseSchema = z.object({
  error: z.string(),
  details: z.string().optional(),
});

export const boardContentSchema = z.union([
  z.string(),
  z.object({
    is_archived: z.boolean().optional(),
    board_type: z.enum(['kanban', 'whiteboard']).optional(),
  }),
]);

export const boardPermissionLevelSchema = z.enum(['owner', 'editor', 'viewer']);

export const boardDocumentSchema = z.object({
  id: z.string(),
  title: z.string(),
  created_by: z.string(),
  last_edited_by: z.string(),
  document_subtype: z.literal('boards'),
  permissions: z
    .record(z.object({ level: boardPermissionLevelSchema, granted_at: z.string() }))
    .nullable(),
  is_public: z.boolean(),
  is_deleted: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
  creator_name: z.string().optional(),
  content: boardContentSchema.nullish(),
  // Optional markdown board-level description (board-overview briefing).
  description: z.string().nullish(),
});

export const generateBoardResponseSchema = z.object({
  board: boardDocumentSchema,
  generatedStructure: z.unknown().nullable(),
});

export const createBoardResponseSchema = boardDocumentSchema;

export const updateBoardResponseSchema = boardDocumentSchema;

export const listBoardsResponseSchema = z.array(boardDocumentSchema);

export const deleteBoardResponseSchema = z.object({
  message: z.string(),
});

// ── Assignable members (GET /:id/assignable-members) ──────────────────────────

export const assignableMemberSchema = z.object({
  user_id: z.string(),
  source: z.enum(['owner', 'direct', 'group', 'bot']),
  first_name: z.string().nullable(),
  display_name: z.string().nullable(),
  avatar_robot_id: z.number(),
});

export const assignableMembersResponseSchema = z.array(assignableMemberSchema);

// ── Public board (GET /api/boards/public/:id, no auth) ────────────────────────
// The non-authenticated branch carries share_mode 'public' OR 'private' (a private
// board with is_public=true still resolves here), so a plain union — not a
// discriminated union — is the correct model.

export const publicBoardResponseSchema = z.union([
  z.object({
    share_mode: z.literal('authenticated'),
    id: z.string(),
    title: z.string(),
  }),
  z.object({
    share_mode: z.enum(['public', 'private']),
    id: z.string(),
    title: z.string(),
    content: boardContentSchema.nullable(),
    share_permission: z.string(),
    creator_name: z.string().nullable(),
  }),
]);

// ── Board state (GET /:id/state) ──────────────────────────────────────────────
// Canonical source for the board domain model. The frontend derives Field/Row/View
// from these; the server's loadBoardState() casts loose Yjs toJSON() output to match
// at that boundary (no ts-rest response validation runs, so this stays a type contract).

export const fieldTypeSchema = z.enum([
  'text',
  'number',
  'singleSelect',
  'multiSelect',
  'date',
  'checkbox',
  'url',
  'checklist',
]);

export const selectOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  // Present when this status option is a "KI-Spalte" (AI column). Optional so the
  // field stays backward-compatible; MUST be declared here or Zod strips it on
  // every board-snapshot roundtrip.
  aiTask: boardAiTaskSchema.optional(),
  // Optional WIP limit (max cards) when this option is a kanban column. Empty =
  // no limit. The column header shows `count/limit` and turns red on overflow.
  limit: z.number().int().positive().optional(),
});

export const boardFieldSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: fieldTypeSchema,
  typeOptions: z.record(z.unknown()),
  order: z.number(),
});

export const cellValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  z.null(),
]);

export const boardRowSchema = z.object({
  id: z.string(),
  cells: z.record(cellValueSchema),
  createdBy: z.string(),
  createdAt: z.string(),
  icon: z.string().optional(),
  coverColor: z.string().optional(),
  // Image attachment used as the card cover (set via "Als Cover" on an attachment).
  coverImageUrl: z.string().optional(),
  // ISO timestamp set when the card is archived (soft-delete); absent = active.
  // Archived rows are filtered out of every view by default (useViewData).
  archivedAt: z.string().optional(),
});

export const viewLayoutSchema = z.enum(['kanban', 'table', 'list', 'calendar', 'gantt']);

export const filterRuleSchema = z.object({
  fieldId: z.string(),
  operator: z.string(),
  value: z.unknown(),
});

export const sortRuleSchema = z.object({
  fieldId: z.string(),
  direction: z.enum(['asc', 'desc']),
});

export const fieldSettingSchema = z.object({
  fieldId: z.string(),
  visible: z.boolean(),
  width: z.number().optional(),
});

export const boardViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  layout: viewLayoutSchema,
  groupByFieldId: z.string().optional(),
  // Second grouping axis for kanban: rows are split into horizontal swimlanes by
  // this field, each containing the normal `groupByFieldId` columns. Absent = 1D.
  swimlaneFieldId: z.string().optional(),
  dateFieldId: z.string().optional(),
  endDateFieldId: z.string().optional(),
  hiddenGroupIds: z.array(z.string()).optional(),
  filters: z.array(filterRuleSchema),
  sorts: z.array(sortRuleSchema),
  fieldSettings: z.array(fieldSettingSchema),
});

export const boardTypeSchema = z.enum(['kanban', 'whiteboard']);

export const boardStateResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  boardType: boardTypeSchema,
  fields: z.array(boardFieldSchema),
  rows: z.array(boardRowSchema),
  views: z.array(boardViewSchema),
  whiteboardTexts: z.array(z.string()).optional(),
});

// ── Inferred domain types (frontend derives from these) ───────────────────────

export type BoardDocument = z.infer<typeof boardDocumentSchema>;
export type BoardContent = z.infer<typeof boardContentSchema>;
export type PublicBoard = z.infer<typeof publicBoardResponseSchema>;
export type BoardType = z.infer<typeof boardTypeSchema>;
export type FieldType = z.infer<typeof fieldTypeSchema>;
export type SelectOption = z.infer<typeof selectOptionSchema>;
export type BoardField = z.infer<typeof boardFieldSchema>;
export type CellValue = z.infer<typeof cellValueSchema>;
export type BoardRow = z.infer<typeof boardRowSchema>;
export type ViewLayout = z.infer<typeof viewLayoutSchema>;
export type FilterRule = z.infer<typeof filterRuleSchema>;
export type SortRule = z.infer<typeof sortRuleSchema>;
export type FieldSetting = z.infer<typeof fieldSettingSchema>;
export type BoardView = z.infer<typeof boardViewSchema>;
export type BoardState = z.infer<typeof boardStateResponseSchema>;
export type AssignableMember = z.infer<typeof assignableMemberSchema>;

// ── Board AI assistant ────────────────────────────────────────────────────────
// Powers the in-board chat assistant (FAB on the boards page). The frontend
// serializes the LIVE Yjs board state into `currentBoardSchema` and sends it as
// chat-request context; when the user asks for a change, the chat backend emits
// the `trigger_board_action` SSE event and the frontend calls POST
// /api/boards/:id/ai to turn the request into a list of board operations, which
// a client-side executor applies to the live board.

/**
 * Compact projection of the live board sent to the chat/AI backend as context.
 * `assignableMembers` flattens AssignableMember to the id+name the model needs
 * to resolve human assignee names.
 */
export const currentBoardSchema = z.object({
  id: z.string(),
  title: z.string().nullish(),
  boardType: boardTypeSchema,
  fields: z.array(boardFieldSchema),
  rows: z.array(boardRowSchema),
  views: z.array(boardViewSchema),
  // The field the visible Kanban columns are grouped by. `statusOptions` are this
  // field's options — NOT necessarily FIELD_IDS.STATUS — so the executor writes
  // columns/status to the field actually on screen. Optional for rollout
  // compatibility; the client-side executor uses its own live value regardless.
  groupByFieldId: z.string().optional(),
  statusOptions: z.array(selectOptionSchema),
  assignableMembers: z.array(z.object({ id: z.string(), name: z.string() })),
});

export type CurrentBoard = z.infer<typeof currentBoardSchema>;

/**
 * Payload of the `trigger_board_action` SSE event. The chat backend (ChatGraph,
 * intent=edit_current_board) forwards a board-edit instruction to the boards
 * assistant surface, which calls POST /api/boards/:id/ai and applies the result.
 * Mirrors triggerDocEditSchema. `.optional()` (not `.nullish()`): SSE payload
 * field simply omitted when empty, not a request body.
 */
export const triggerBoardActionSchema = z.object({
  targetBoardId: z.string(),
  userPrompt: z.string(),
  referenceContent: z.string().optional(),
});

export type TriggerBoardAction = z.infer<typeof triggerBoardActionSchema>;

/**
 * A single board mutation the AI proposes. Discriminated union on `type` — per
 * the repo's type-safety rule, never destructure; switch on `op.type`. The model
 * emits HUMAN names for status/assignee/labels; the client executor resolves them
 * to ids against the live board (auto-creating missing status columns / labels).
 */
export const boardOperationSchema = z.discriminatedUnion('type', [
  // ── tasks ──
  z.object({
    type: z.literal('create_task'),
    title: z.string(),
    status: z.string().nullish(),
    description: z.string().nullish(),
    dueDate: z.string().nullish(),
    // `assignee` (single) kept for backward compat; `assignees` (multi) preferred.
    assignee: z.string().nullish(),
    assignees: z.array(z.string()).nullish(),
    labels: z.array(z.string()).nullish(),
  }),
  z.object({
    type: z.literal('update_task'),
    taskId: z.string(),
    title: z.string().nullish(),
    description: z.string().nullish(),
    dueDate: z.string().nullish(),
  }),
  z.object({ type: z.literal('delete_task'), taskId: z.string() }),
  // Soft-delete: archive hides the card from all views; restore brings it back.
  z.object({ type: z.literal('archive_task'), taskId: z.string() }),
  z.object({ type: z.literal('restore_task'), taskId: z.string() }),
  // Clone a card (cells incl. checklists/labels/assignees) into the same column.
  z.object({ type: z.literal('duplicate_task'), taskId: z.string() }),
  z.object({ type: z.literal('move_task'), taskId: z.string(), status: z.string() }),
  // ── comments ──
  z.object({ type: z.literal('add_comment'), taskId: z.string(), text: z.string() }),
  // ── people / fields on a task ──
  z.object({ type: z.literal('set_assignee'), taskId: z.string(), assignee: z.string().nullish() }),
  z.object({
    type: z.literal('set_assignees'),
    taskId: z.string(),
    assignees: z.array(z.string()),
  }),
  z.object({ type: z.literal('set_labels'), taskId: z.string(), labels: z.array(z.string()) }),
  z.object({ type: z.literal('set_due_date'), taskId: z.string(), dueDate: z.string().nullish() }),
  // Append an item to a card checklist (creates the named checklist if absent).
  z.object({
    type: z.literal('add_checklist_item'),
    taskId: z.string(),
    checklistTitle: z.string().nullish(),
    text: z.string(),
  }),
  // ── columns (status options) ──
  z.object({ type: z.literal('add_column'), name: z.string(), color: z.string().nullish() }),
  z.object({ type: z.literal('rename_column'), columnId: z.string(), name: z.string() }),
  // ── schema ──
  z.object({
    type: z.literal('add_field'),
    name: z.string(),
    fieldType: fieldTypeSchema,
    options: z.array(z.string()).nullish(),
  }),
  z.object({ type: z.literal('add_view'), name: z.string(), layout: viewLayoutSchema }),
]);

export type BoardOperation = z.infer<typeof boardOperationSchema>;

export const boardOperationsSchema = z.array(boardOperationSchema).min(1).max(50);

/**
 * Request body for POST /api/boards/:id/ai. The model turns `userPrompt` (with
 * the live `board` as context) into a list of operations.
 */
export const boardAiRequestBodySchema = z.object({
  userPrompt: z.string(),
  board: currentBoardSchema,
  referenceContent: z.string().nullish(),
});

export type BoardAiRequestBody = z.infer<typeof boardAiRequestBodySchema>;

export const boardAiResponseSchema = z.object({
  operations: z.array(boardOperationSchema),
});

export type BoardAiResponse = z.infer<typeof boardAiResponseSchema>;
