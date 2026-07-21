/**
 * Zod schemas for the canvas-document CRUD endpoints (`/api/canvas`).
 * Source of truth for the request/response shapes; mirrors the responses the
 * legacy `canvasController.ts` returned so the frontend swap is transport-only.
 *
 * NOTE on `format` / `template_type`: kept free `z.string()`, NOT a z.enum. The
 * closed format set lives in `packages/canvas-editor/src/formats`, which this
 * dependency-light package cannot import; the server router validates `format`
 * against `getServerFormat()` at the boundary (same pattern as user-agent
 * `enabledTools`).
 *
 * NOTE on `initial_state`: stays `z.record(z.unknown())` — canvas state is
 * genuinely heterogeneous per template (dreizeilen / zitat / info / freeform /
 * presentation), so this is a legitimate open boundary, not a gap to close.
 */
import { z } from 'zod';

import { canvasTemplateTypeSchema } from './canvasTemplateDescriptors.js';

// ── Shared shapes ──────────────────────────────────────────────────────────

/** Mirrors `PermissionEntry` in apps/api/routes/docs/types.ts. */
export const canvasPermissionEntrySchema = z.object({
  level: z.enum(['owner', 'editor', 'viewer']),
  granted_at: z.string(),
  granted_by: z.string().optional(),
});

/** Mirrors `DocumentPermissions`: a map keyed by userId. */
export const canvasPermissionsSchema = z.record(canvasPermissionEntrySchema);

/** The canvas document as returned by list / get / create. */
export const canvasDocumentSchema = z.object({
  id: z.string(),
  title: z.string(),
  created_by: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  permissions: canvasPermissionsSchema.nullable(),
  is_public: z.boolean(),
  share_mode: z.enum(['private', 'authenticated', 'public']).optional(),
  template_type: z.string(),
  base_template_id: z.string().nullable(),
  thumbnail_url: z.string().nullable(),
  page_count: z.number().int(),
  initial_state: z.record(z.unknown()),
  format: z.string(),
  creator_name: z.string().nullable().optional(),
});

export type CanvasDocument = z.infer<typeof canvasDocumentSchema>;

/**
 * List rows omit `initial_state`: the full canvas JSONB (all pages/elements)
 * would make GET /api/canvas scale with total canvas count while list
 * consumers only render metadata cards.
 */
export const canvasListItemSchema = canvasDocumentSchema.omit({ initial_state: true });

export type CanvasListItem = z.infer<typeof canvasListItemSchema>;

// ── Request bodies ─────────────────────────────────────────────────────────

export const createCanvasBodySchema = z.object({
  title: z.string().optional(),
  template_type: z.string(),
  base_template_id: z.string().optional(),
  initial_state: z.record(z.unknown()).optional(),
  page_count: z.number().int().positive().optional(),
  format: z.string().optional(),
});

export type CreateCanvasBody = z.infer<typeof createCanvasBodySchema>;

/**
 * POST /api/canvas/from-variant — server-authoritative mint of an unminted chat
 * sharepic variant. The server seeds the Yjs formState from the FULL
 * `initial_props` (lossless, unlike the old client mint), binds it to the
 * thread/variant (idempotent — a re-open or a later chat edit reuse the same
 * canvas), and returns the canvasId to open at `/studio/canvas/:id`.
 */
export const canvasFromVariantBodySchema = z.object({
  canvasType: canvasTemplateTypeSchema,
  initialProps: z.record(z.string(), z.unknown()),
  threadId: z.string(),
  variantId: z.string(),
});

export type CanvasFromVariantBody = z.infer<typeof canvasFromVariantBodySchema>;

export const canvasFromVariantResponseSchema = z.object({
  canvasId: z.string(),
});

export const updateCanvasBodySchema = z.object({
  title: z.string().optional(),
  thumbnail_url: z.string().optional(),
  page_count: z.number().int().positive().optional(),
  format: z.string().optional(),
});

export type UpdateCanvasBody = z.infer<typeof updateCanvasBodySchema>;

export const resizeCanvasBodySchema = z.object({
  formatId: z.string(),
  title: z.string().optional(),
});

export type ResizeCanvasBody = z.infer<typeof resizeCanvasBodySchema>;

// ── Response wrappers ──────────────────────────────────────────────────────

export const canvasListResponseSchema = z.array(canvasListItemSchema);

export const canvasMessageResponseSchema = z.object({
  message: z.string(),
});

/** resize → 201 { newCanvasId }. */
export const canvasResizeResponseSchema = z.object({
  newCanvasId: z.string(),
});

/** clone → 201 { newCanvasId, accessMethod? }. */
export const canvasCloneResponseSchema = z.object({
  newCanvasId: z.string(),
  accessMethod: z.string().optional(),
});

/** Error body shared by all canvas endpoints: `{ error, details? }`. */
export const canvasErrorResponseSchema = z.object({
  error: z.string(),
  details: z.string().optional(),
});

// ── Live state & chat-edit version history ─────────────────────────────────

/**
 * getState → current merged canvas state. `source` says where it came from:
 * the live/persisted Yjs document or the `initial_state` fallback (doc never
 * opened, or Hocuspocus unreachable). `version` is the latest chat-edit
 * version number, null when the canvas has no version rows.
 */
export const canvasStateResponseSchema = z.object({
  state: z.record(z.unknown()),
  source: z.enum(['yjs', 'initial_state']),
  version: z.number().int().nullable(),
  /** Per-slide states for multi-page (deck) canvases, in page order. */
  pages: z.array(z.record(z.unknown())).nullish(),
});

export type CanvasStateResponse = z.infer<typeof canvasStateResponseSchema>;

export const canvasVersionEntrySchema = z.object({
  version: z.number().int(),
  summary: z.string().nullable(),
  origin: z.enum(['mint', 'chat-edit', 'restore']),
  created_at: z.string(),
});

export type CanvasVersionEntry = z.infer<typeof canvasVersionEntrySchema>;

export const canvasVersionListResponseSchema = z.object({
  versions: z.array(canvasVersionEntrySchema),
});

export const canvasVersionResponseSchema = z.object({
  version: z.number().int(),
  state: z.record(z.unknown()),
  summary: z.string().nullable(),
});

/** restore → the snapshot re-applied as a NEW version. */
export const canvasRestoreResponseSchema = z.object({
  version: z.number().int(),
  state: z.record(z.unknown()),
});
