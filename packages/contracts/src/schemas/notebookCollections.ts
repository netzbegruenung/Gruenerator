/**
 * Zod schemas for notebook collections endpoints.
 * Mirrors apps/api/routes/notebook/collectionsController.ts.
 *
 * IMPORTANT: Request bodies use `.nullish()` for optional fields per the
 * 2026-04-12 production incident rule. The frontend follows feedback_no_undefined
 * and sends `null` for unset values; plain `.optional()` would 400 every request.
 */
import { z } from 'zod';

// ── Request bodies ──────────────────────────────────────────────────────────

export const publicOwnershipSchema = z.enum(['owner', 'public_data']);
export type PublicOwnership = z.infer<typeof publicOwnershipSchema>;

export const notebookShareModeSchema = z.enum(['private', 'groups', 'authenticated']);
export type NotebookShareMode = z.infer<typeof notebookShareModeSchema>;

export const notebookEditPolicySchema = z.enum(['owner_only', 'group_admins', 'all_members']);
export type NotebookEditPolicy = z.infer<typeof notebookEditPolicySchema>;

/**
 * Locale audience for a notebook. Only constrains the visibility of
 * `share_mode='authenticated'` listings: 'de-DE' / 'de-AT' hide the notebook
 * from viewers whose `users.locale` doesn't match; 'all' shows it everywhere.
 * Owner + explicit group-share viewers always bypass the audience filter.
 *
 * Convention mirrors `AgentAudience` (`packages/shared/src/agents/types.ts`).
 */
export const notebookAudienceSchema = z.enum(['de-DE', 'de-AT', 'all']);
export type NotebookAudience = z.infer<typeof notebookAudienceSchema>;

/**
 * Tag every notebook in a list response with how the calling user can reach it.
 * Lets the UI render a "Mit dir geteilt" section without re-querying access.
 */
export const notebookAccessSourceSchema = z.enum(['owned', 'shared', 'authenticated']);
export type NotebookAccessSource = z.infer<typeof notebookAccessSourceSchema>;

/**
 * Experimental: Wolke folder attached to a notebook.
 *
 * Persisted inside `settings.wolke_folders` (JSONB on `notebook_collections`).
 * On HTTP body the field name is snake_case (`wolke_folders`) to match the rest
 * of the collection contract; the inner object keeps camelCase because the
 * payload is opaque to Postgres.
 *
 * Sync is manual today (button on the editor card). The persisted pointer is
 * the foundation a future auto-sync follow-up needs.
 */
export const wolkeFolderRefSchema = z.object({
  shareLinkId: z.string(),
  shareLabel: z.string().nullish(),
  folderPath: z.string(),
  folderName: z.string(),
  lastSyncedAt: z.string().nullable().optional(),
});
export type WolkeFolderRef = z.infer<typeof wolkeFolderRefSchema>;

/**
 * Experimental: User-owned Doc linked to a notebook as a source.
 *
 * Persisted inside `settings.linked_docs` (JSONB on `notebook_collections`).
 * Each entry remembers which Doc was imported and the resulting Document id
 * so a re-sync can replace the previous snapshot in place.
 *
 * The actual content import goes through the regular file-upload path
 * (markdown export → File → uploadFileOnly), so security and indexing
 * reuse the same plumbing as manual uploads.
 */
export const linkedDocRefSchema = z.object({
  docId: z.string(),
  docTitle: z.string(),
  documentId: z.string().nullable().optional(),
  lastSyncedAt: z.string().nullable().optional(),
});
export type LinkedDocRef = z.infer<typeof linkedDocRefSchema>;

export const createCollectionBodySchema = z.object({
  name: z.string(),
  description: z.string().nullish(),
  custom_prompt: z.string().nullish(),
  selection_mode: z.enum(['documents', 'wolke']).nullish(),
  document_ids: z.array(z.string()).nullish(),
  wolke_share_link_ids: z.array(z.string()).nullish(),
  auto_sync: z.boolean().nullish(),
  remove_missing_on_sync: z.boolean().nullish(),
  labels: z.array(z.string()).nullish(),
  is_public: z.boolean().nullish(),
  public_ownership: publicOwnershipSchema.nullish(),
  wolke_folders: z.array(wolkeFolderRefSchema).nullish(),
  linked_docs: z.array(linkedDocRefSchema).nullish(),
  audience: notebookAudienceSchema.nullish(),
});

export const updateCollectionBodySchema = z.object({
  name: z.string(),
  description: z.string().nullish(),
  custom_prompt: z.string().nullish(),
  selection_mode: z.enum(['documents', 'wolke']).nullish(),
  document_ids: z.array(z.string()).nullish(),
  wolke_share_link_ids: z.array(z.string()).nullish(),
  auto_sync: z.boolean().nullish(),
  remove_missing_on_sync: z.boolean().nullish(),
  labels: z.array(z.string()).nullish(),
  is_public: z.boolean().nullish(),
  public_ownership: publicOwnershipSchema.nullish(),
  wolke_folders: z.array(wolkeFolderRefSchema).nullish(),
  linked_docs: z.array(linkedDocRefSchema).nullish(),
  audience: notebookAudienceSchema.nullish(),
});

export const bulkDeleteBodySchema = z.object({
  ids: z.array(z.string()),
});

/**
 * Payload emitted by `NotebookEditor.onSave`.
 *
 * Frontend-internal boundary between the editor component and its caller's
 * save handler — NOT an HTTP body. Each caller maps this to the backend
 * `createCollectionBodySchema` / `updateCollectionBodySchema` (e.g.
 * `documents` → `document_ids`, `selectionMode` → `selection_mode`).
 *
 * `documentMeta` carries upload titles for progress views (the IDs in
 * `documents` are authoritative for indexing-status polling).
 */
export const notebookEditorSavePayloadSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  description: z.string(),
  selectionMode: z.literal('documents'),
  documents: z.array(z.string()),
  documentMeta: z.array(z.object({ id: z.string(), title: z.string() })),
  labels: z.array(z.string()),
  isPublic: z.boolean(),
  publicOwnership: publicOwnershipSchema.nullable(),
  wolkeFolders: z.array(wolkeFolderRefSchema).default([]),
  linkedDocs: z.array(linkedDocRefSchema).default([]),
});

export type NotebookEditorSavePayload = z.infer<typeof notebookEditorSavePayloadSchema>;

// ── Shared sub-schemas ──────────────────────────────────────────────────────

export const documentRecordSchema = z.object({
  id: z.string(),
  title: z.string(),
  page_count: z.number().nullish(),
  created_at: z.string(),
  source_type: z.string().nullish(),
  wolke_share_link_id: z.string().nullish(),
  status: z.string().nullish(),
});

export const wolkeShareLinkSchema = z.object({
  id: z.string(),
});

/**
 * TransformedCollection — the shape returned by GET /. Uses z.unknown() for
 * `settings` because it is a Record<string, unknown> with no index signature.
 *
 * `slug_suffix` is the stable 6-char tail used in pretty URLs (see
 * packages/shared/src/utils/slug.ts). Nullish on the schema for legacy points
 * predating the backfill — the API guarantees a value on post-backfill rows.
 */
export const transformedCollectionSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  custom_prompt: z.string().nullable(),
  selection_mode: z.string(),
  wolke_share_link_ids: z.array(z.string()).nullish(),
  auto_sync: z.boolean(),
  remove_missing_on_sync: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
  documents: z.array(documentRecordSchema),
  document_count: z.number(),
  wolke_share_links: z.array(wolkeShareLinkSchema),
  has_wolke_sources: z.boolean(),
  documents_from_wolke: z.number(),
  // Optional fields that may be present on the raw Qdrant shape
  settings: z.unknown().nullish(),
  notebook_collection_documents: z.array(z.object({ document_id: z.string() })).nullish(),
  labels: z.array(z.string()).nullish(),
  is_public: z.boolean().nullish(),
  public_ownership: publicOwnershipSchema.nullable().optional(),
  wolke_folders: z.array(wolkeFolderRefSchema).nullish(),
  linked_docs: z.array(linkedDocRefSchema).nullish(),
  likes_count: z.number().nullish(),
  share_mode: notebookShareModeSchema.nullish(),
  edit_policy: notebookEditPolicySchema.nullish(),
  audience: notebookAudienceSchema.nullish(),
  access_source: notebookAccessSourceSchema.nullish(),
  slug_suffix: z.string().nullish(),
});

// ── Response schemas ────────────────────────────────────────────────────────

export const collectionsListResponseSchema = z.object({
  success: z.boolean(),
  collections: z.array(transformedCollectionSchema),
});

/**
 * Create collection response.
 * The `collection` sub-object is loosely typed for `settings` and arbitrary
 * extra fields written by `storeNotebookCollection`.
 */
export const createCollectionResponseSchema = z.object({
  success: z.boolean(),
  collection: z.object({
    id: z.string(),
    user_id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    custom_prompt: z.string().nullable(),
    selection_mode: z.string(),
    document_count: z.number(),
    documents_from_wolke: z.number(),
    wolke_share_links: z.union([z.array(z.string()), z.array(wolkeShareLinkSchema)]),
    created_at: z.string(),
    // settings and wolke_share_link_ids may be included
    wolke_share_link_ids: z.array(z.string()).nullish(),
    auto_sync: z.boolean().nullish(),
    remove_missing_on_sync: z.boolean().nullish(),
    settings: z.unknown().nullish(),
    slug_suffix: z.string().nullish(),
  }),
  message: z.string(),
});

export const updateCollectionResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  documents_from_wolke: z.number(),
  wolke_share_links: z.array(z.string()),
});

export const syncCollectionResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  added_count: z.number(),
  removed_count: z.number(),
  total_count: z.number(),
  wolke_share_links: z.array(z.string()),
});

export const searchResultItemSchema = z.object({
  documentId: z.string(),
  title: z.string(),
  excerpt: z.string(),
  score: z.number(),
});

export const simpleSuccessMessageSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

export const bulkDeleteResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  deleted_count: z.number(),
  failed_ids: z.array(z.string()),
  total_requested: z.number(),
  deleted_ids: z.array(z.string()),
});

export const likeCollectionResponseSchema = z.object({
  success: z.literal(true),
  liked: z.literal(true),
  count: z.number(),
});

export const unlikeCollectionResponseSchema = z.object({
  success: z.literal(true),
  liked: z.literal(false),
  count: z.number(),
});

export const listMyLikedCollectionsResponseSchema = z.object({
  success: z.literal(true),
  liked_ids: z.array(z.string()),
});

/**
 * Resolve a notebook URL fragment (slug or UUID) to its canonical ID.
 * Used by the frontend NotebookResolver to translate Notion-style slug URLs
 * like `/notebooks/my-research-Ab3xK9` into the UUID the rest of the app
 * already consumes. The route honours the same access rules as direct
 * id-based lookups; share_mode is returned so the resolver can short-circuit
 * UI states (e.g. "shared notebook" banner) without a second round-trip.
 */
export const resolveCollectionResponseSchema = z.object({
  id: z.string(),
  slug_suffix: z.string(),
  name: z.string(),
  share_mode: notebookShareModeSchema.nullable(),
});
