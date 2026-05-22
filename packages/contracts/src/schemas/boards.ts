/**
 * Zod schemas for boards endpoints.
 * Mirrors apps/api/routes/boards/boardsController.ts.
 */
import { z } from 'zod';

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
  source: z.enum(['owner', 'direct', 'group']),
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
