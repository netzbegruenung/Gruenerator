/**
 * Zod schemas for /api/docs endpoints.
 * Mirrors apps/api/routes/docs/{documentController,permissionsController,shareController,groupShareController}.ts
 *
 * IMPORTANT: Request bodies use `.nullish()` for optional fields per the
 * 2026-04-12 production incident rule. The frontend sends `null` for unset
 * values; plain `.optional()` would 400 every request.
 */
import { z } from 'zod';

// ── Shared error schema ─────────────────────────────────────────────────────

export const docsErrorSchema = z.object({ error: z.string() });

export const docsErrorWithDetailsSchema = z.object({
  error: z.string(),
  details: z.unknown(),
});

// ── documentController schemas ──────────────────────────────────────────────

/**
 * A permission entry inside the JSONB `permissions` column.
 * Mirrors apps/api/routes/docs/types.ts PermissionEntry.
 */
export const permissionEntrySchema = z.object({
  level: z.enum(['owner', 'editor', 'viewer']),
  granted_at: z.string(),
  granted_by: z.string().nullish(),
  updated_at: z.string().nullish(),
  updated_by: z.string().nullish(),
});

/**
 * Response schema for GET /api/docs/:id and POST /api/docs.
 *
 * `passthrough()`: query results include joined columns (creator_name,
 * last_editor_name) and list-query extras (access_type, group_shares) that
 * vary by endpoint. Modeling every variant as a discriminated union would
 * couple this schema to query implementation details — passthrough lets
 * callers consume the typed core fields while preserving the rest.
 */
export const collaborativeDocumentSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    content: z.string().nullish(),
    created_by: z.string(),
    last_edited_by: z.string(),
    document_subtype: z.string(),
    folder_id: z.string().nullable(),
    permissions: z.record(z.string(), permissionEntrySchema).nullable(),
    is_public: z.boolean(),
    share_mode: z.enum(['private', 'authenticated', 'public']).nullish(),
    share_permission: z.enum(['editor', 'viewer']).nullish(),
    is_deleted: z.boolean(),
    created_at: z.string(),
    updated_at: z.string(),
    creator_name: z.string().nullish(),
    last_editor_name: z.string().nullish(),
  })
  .passthrough();

export type CollaborativeDocument = z.infer<typeof collaborativeDocumentSchema>;

/**
 * Response for GET /api/docs (listDocuments).
 * Same as collaborativeDocumentSchema but adds list-only computed columns.
 */
export const collaborativeDocumentListItemSchema = collaborativeDocumentSchema;

export const collaborativeDocumentListSchema = z.array(collaborativeDocumentListItemSchema);

// ── permissionsController schemas ───────────────────────────────────────────

/**
 * Permission entry returned by GET /api/docs/:id/permissions.
 * Discriminated union: `type: 'user'` rows include profile fields,
 * `type: 'group'` rows include group + member_count fields.
 */
export const userPermissionEntrySchema = z.object({
  type: z.literal('user'),
  user_id: z.string(),
  display_name: z.string().nullable(),
  email: z.string().nullable(),
  avatar_url: z.string().nullable(),
  avatar_robot_id: z.string().nullable(),
  permission_level: z.enum(['owner', 'editor', 'viewer']),
  granted_at: z.string(),
});

export const groupPermissionEntrySchema = z.object({
  type: z.literal('group'),
  group_id: z.string(),
  group_name: z.string(),
  permission_level: z.enum(['viewer', 'editor']),
  shared_at: z.string(),
  member_count: z.number(),
});

export const permissionListEntrySchema = z.discriminatedUnion('type', [
  userPermissionEntrySchema,
  groupPermissionEntrySchema,
]);

export const permissionsListSchema = z.array(permissionListEntrySchema);

export type PermissionListEntry = z.infer<typeof permissionListEntrySchema>;

// ── shareController schemas ──────────────────────────────────────────────────

export const shareSettingsSchema = z.object({
  is_public: z.boolean(),
  share_permission: z.string(),
  share_mode: z.string(),
});

export const sharePermissionBodySchema = z.object({
  permission: z.enum(['viewer', 'editor']),
});

export const shareModeBodySchema = z.object({
  mode: z.enum(['private', 'authenticated', 'public']),
});

// ── documentController body schemas ──────────────────────────────────────────

export const createDocumentBodySchema = z.object({
  title: z.string().nullish(),
  folder_id: z.string().nullish(),
  document_subtype: z.string().nullish(),
});

export const generateDocumentBodySchema = z.object({
  description: z.string(),
});

export const listDocumentsQuerySchema = z.object({
  // Query params can't carry `null` over HTTP — `.optional()` here, NOT
  // `.nullish()`. Using `.nullish()` triggers TS errors against Express's
  // ParsedQs (which forbids null) under exactOptionalPropertyTypes.
  limit: z.string().optional(),
});

// ── groupShareController schemas ─────────────────────────────────────────────

export const addGroupBodySchema = z.object({
  group_id: z.string(),
  permission_level: z.enum(['viewer', 'editor']).nullish(),
});

export const updateGroupBodySchema = z.object({
  permission_level: z.enum(['viewer', 'editor']),
});

// ── docChatThreadController schemas ──────────────────────────────────────────

/**
 * Response for GET /api/docs/:id/chat-thread.
 * The endpoint is idempotent: one chat thread per document, shared across
 * collaborators. The handler upserts and returns the canonical thread id.
 */
export const chatThreadResponseSchema = z.object({
  threadId: z.string(),
});

export type ChatThreadResponse = z.infer<typeof chatThreadResponseSchema>;

// ── importController schemas ─────────────────────────────────────────────────

/**
 * Response for POST /api/docs/from-import (multipart) and POST /api/docs/from-wolke (JSON).
 * Both create a new document and return its id; the import handler shape is
 * identical so we share the schema.
 */
export const docImportResponseSchema = z.object({
  documentId: z.string(),
});

export type DocImportResponse = z.infer<typeof docImportResponseSchema>;

// ── exportToDocsController schemas ───────────────────────────────────────────

/**
 * Request/response for POST /api/docs/from-export.
 * `content` may be markdown, HTML, or plain prose.
 */
export const exportToDocsBodySchema = z.object({
  content: z.string().min(1),
  title: z.string().nullish(),
  documentType: z.string().nullish(),
});

export const exportToDocsResponseSchema = z.object({
  documentId: z.string().uuid(),
  url: z.string(),
  success: z.literal(true),
});

export type ExportToDocsBody = z.infer<typeof exportToDocsBodySchema>;
export type ExportToDocsResponse = z.infer<typeof exportToDocsResponseSchema>;

// ── chat → docs live-edit bridge ─────────────────────────────────────────────

/**
 * Payload of the `trigger_doc_edit` SSE event. The chat backend (ChatGraph,
 * intent=edit_current_doc) forwards a doc-edit instruction to the docs editor
 * surface, which dispatches it into BlockNote's AIExtension.
 *
 * `referenceContent` carries prior assistant text the user referenced
 * ("dies/das einfügen"); it IS sent over the wire and so must be in the type —
 * the previous hand-written event type omitted it and the consumer re-declared
 * the shape with a cast. This schema is the single source of truth for both the
 * emit sites and the consumer. `.optional()` (not `.nullish()`) is correct: it
 * is an SSE payload field simply omitted when empty, not a request body.
 */
export const triggerDocEditSchema = z.object({
  targetDocumentId: z.string(),
  userPrompt: z.string(),
  useSelection: z.boolean(),
  referenceContent: z.string().optional(),
});

export type TriggerDocEdit = z.infer<typeof triggerDocEditSchema>;
