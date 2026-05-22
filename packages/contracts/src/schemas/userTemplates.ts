/**
 * Zod schemas for user template (Vorlagen) CRUD endpoints.
 * Mirrors apps/api/routes/auth/templates/userTemplates.ts.
 *
 * Source of truth for the /api/auth/user-templates* request/response shapes.
 * Backend handlers and the typed frontend client both derive their types from
 * here via z.infer.
 */
import { z } from 'zod';

// ── Closed sets ──────────────────────────────────────────────────────────────

/**
 * Template lifecycle status. A genuinely closed, server-controlled set —
 * request bodies never set it (it's derived from is_private on create and
 * mutated by the admin review flow), so enum-validating it carries no risk of
 * rejecting a legitimate caller.
 */
export const templateStatusSchema = z.enum(['draft', 'pending_review', 'published', 'rejected']);

// NOTE: `template_type` is intentionally a free string, NOT an enum. It is an
// open, server-extensible category (canva | sharepic | file | template | board
// | docs | …) — board/docs templates are created server-side. ts-rest validates
// request bodies at runtime, so an incomplete enum would 400 legitimate creates.

// ── Template row (response item) ─────────────────────────────────────────────

/**
 * The formatted template object returned by the user-templates endpoints.
 * Matches the `formattedTemplate` shape the handlers build (note the
 * thumbnail_url → preview_image_url rename at the boundary).
 */
export const userTemplateSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  type: z.string(),
  template_type: z.string(),
  external_url: z.string().nullable(),
  preview_image_url: z.string().nullable(),
  images: z.array(z.unknown()),
  categories: z.array(z.unknown()),
  tags: z.array(z.string()),
  content_data: z.unknown(),
  metadata: z.unknown(),
  is_private: z.boolean(),
  status: templateStatusSchema,
  created_at: z.string(),
  updated_at: z.string(),
});

export type UserTemplate = z.infer<typeof userTemplateSchema>;

// ── Request bodies ───────────────────────────────────────────────────────────

export const fromUrlBodySchema = z.object({
  url: z.string().min(1),
  preview: z.boolean().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const createTemplateBodySchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  template_type: z.string().optional(),
  external_url: z.string().nullish(),
  preview_image_url: z.string().nullish(),
  images: z.array(z.unknown()).optional(),
  categories: z.array(z.unknown()).optional(),
  tags: z.array(z.unknown()).optional(),
  content_data: z.unknown().optional(),
  metadata: z.unknown().optional(),
  is_private: z.boolean().optional(),
});

export const updateTemplateBodySchema = createTemplateBodySchema;

export const metadataUpdateBodySchema = z.object({
  title: z.string().optional(),
  description: z.string().nullish(),
  template_type: z.string().optional(),
  is_private: z.boolean().optional(),
});

export const bulkDeleteTemplatesBodySchema = z.object({
  ids: z.array(z.string()).min(1).max(100),
});

export const instantiateBodySchema = z.object({
  title: z.string().min(1).max(200),
});

// ── Response schemas ─────────────────────────────────────────────────────────

export const userTemplatePreviewSchema = z.object({
  title: z.string().nullable(),
  description: z.string().nullable(),
  thumbnail_url: z.string().nullable(),
  dimensions: z.unknown().nullable(),
  categories: z.array(z.unknown()),
  final_url: z.string(),
});

export type UserTemplatePreview = z.infer<typeof userTemplatePreviewSchema>;

/** GET /user-templates */
export const userTemplatesListResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(userTemplateSchema),
});

/** 200 from POST /user-templates/from-url with preview=true */
export const userTemplatePreviewResponseSchema = z.object({
  success: z.boolean(),
  preview: userTemplatePreviewSchema,
});

/** 201 from POST /user-templates/from-url (save) */
export const userTemplateCreatedFromUrlResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({ id: z.string() }),
  message: z.string(),
});

/** 200/201 carrying a single formatted template (create / update) */
export const userTemplateItemResponseSchema = z.object({
  success: z.boolean(),
  data: userTemplateSchema,
  message: z.string(),
});

/** Success with only a message (delete / metadata update) */
export const userTemplateMessageResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

/** DELETE /user-templates/bulk */
export const userTemplateBulkDeleteResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  deleted_count: z.number(),
  failed_ids: z.array(z.string()),
  total_requested: z.number(),
  deleted_ids: z.array(z.string()),
});

/** POST /user-templates/:id/instantiate */
export const userTemplateInstantiateResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    documentId: z.string(),
    subtype: z.string(),
  }),
});

export const userTemplatesErrorResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  unauthorized_ids: z.array(z.string()).optional(),
});
