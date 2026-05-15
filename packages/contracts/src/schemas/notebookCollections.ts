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

export const shareCollectionResponseSchema = z.object({
  success: z.boolean(),
  public_url: z.string(),
  access_token: z.string(),
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
