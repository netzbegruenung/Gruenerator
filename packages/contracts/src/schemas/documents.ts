/**
 * Zod schemas for /api/documents endpoints.
 * Mirrors apps/api/routes/documents/{qdrantController,retrievalController,wolkeController}.ts
 *
 * These three controllers are all read-only (GET) routes that require auth
 * and return structured success/failure response envelopes.
 */
import { z } from 'zod';

// ── qdrantController schemas ─────────────────────────────────────────────────

/**
 * GET /api/documents/system-full-text
 * Returns full text of a system-collection document located by URL + collection name.
 * The fullText/title/url values come from DocumentSearchService — kept z.unknown()
 * because the service can return any string-like value and the exact type is an
 * internal service detail not yet pinned in a shared type.
 */
export const systemFullTextResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    fullText: z.unknown(),
    title: z.unknown(),
    url: z.unknown(),
  }),
});

export const systemFullTextNotFoundSchema = z.object({
  success: z.boolean(),
  message: z.unknown(),
});

export const systemFullTextErrorSchema = z.object({
  success: z.boolean(),
  message: z.unknown(),
});

// ── retrievalController schemas ──────────────────────────────────────────────

/**
 * GET /api/documents/stats
 * Returns document statistics from PostgresDocumentService.getDocumentStats().
 * The `stats` shape is a service-internal record — z.unknown() avoids
 * coupling the contract to the service's return type.
 */
export const documentStatsResponseSchema = z.object({
  success: z.boolean(),
  stats: z.unknown(),
});

export const documentStatsErrorSchema = z.object({
  success: z.boolean(),
  message: z.unknown(),
});

// ── wolkeController schemas ──────────────────────────────────────────────────

/**
 * GET /api/documents/sync-status
 * Returns Wolke sync statuses from WolkeSyncService.getUserSyncStatus().
 * The `syncStatuses` shape is a service-internal array — z.unknown() used
 * because pinning the full Nextcloud sync-status type is out of scope here.
 */
export const syncStatusResponseSchema = z.object({
  success: z.boolean(),
  syncStatuses: z.unknown(),
});

export const syncStatusErrorSchema = z.object({
  success: z.boolean(),
  message: z.unknown(),
});

// ── document statuses (used during notebook creation progress polling) ─────

/**
 * Five-state lifecycle observed across the codebase:
 *   - 'pending'    DB default for newly-inserted rows
 *   - 'uploaded'   manualController sets this after the file is on disk
 *   - 'processing' processUploadedDocument flips this while extracting + embedding
 *   - 'completed'  final success state
 *   - 'failed'     final error state (actual error stays in server logs; no error_message column)
 */
export const documentStatusValueSchema = z.enum([
  'pending',
  'uploaded',
  'processing',
  'completed',
  'failed',
]);

/**
 * Sub-stages within `status='processing'`. Written to documents.metadata by the
 * deferred processing pipeline (extract → chunk → upsert vectors). Surfaced
 * here so the notebook-creation UI can show "Wird gescannt / zerlegt / indexiert"
 * instead of a single generic "Wird verarbeitet…".
 */
export const documentProcessingStageSchema = z.enum(['extracting', 'chunking', 'upserting']);

export const documentProcessingProgressSchema = z.object({
  stage: documentProcessingStageSchema,
  current: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});

export const documentStatusesRequestSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(50),
});

export const documentStatusesResponseSchema = z.object({
  success: z.boolean(),
  statuses: z.array(
    z.object({
      id: z.string(),
      status: documentStatusValueSchema,
      stage: documentProcessingStageSchema.nullable().optional(),
      progress: documentProcessingProgressSchema.nullable().optional(),
    })
  ),
});

export type DocumentStatusValue = z.infer<typeof documentStatusValueSchema>;
export type DocumentProcessingStage = z.infer<typeof documentProcessingStageSchema>;
export type DocumentProcessingProgress = z.infer<typeof documentProcessingProgressSchema>;
export type DocumentStatusesRequest = z.infer<typeof documentStatusesRequestSchema>;
export type DocumentStatusesResponse = z.infer<typeof documentStatusesResponseSchema>;

// ── document content (GET /:id/content) ─────────────────────────────────────

/**
 * GET /api/documents/:id/content
 * Metadata (from Postgres) + full OCR text (from Qdrant) for one document.
 * `filename`/`created_at` mirror the nullable Drizzle columns; the remaining
 * fields are coalesced to their column defaults by the handler so callers get
 * a stable shape. A Qdrant miss degrades to `ocr_text: ''` (never a 500).
 */
export const documentContentSchema = z.object({
  id: z.string(),
  title: z.string(),
  filename: z.string().nullable(),
  page_count: z.number().nullable(),
  status: z.string(),
  vector_count: z.number(),
  source_type: z.string(),
  ocr_text: z.string(),
  created_at: z.union([z.string(), z.date()]),
});

export const documentContentResponseSchema = z.object({
  success: z.literal(true),
  data: documentContentSchema,
});

/** 404 (not found / access denied) and 500 share the `{ success:false, message }` shape. */
export const documentContentErrorSchema = z.object({
  success: z.literal(false),
  message: z.string(),
});

export type DocumentContent = z.infer<typeof documentContentSchema>;
export type DocumentContentResponse = z.infer<typeof documentContentResponseSchema>;

// ── Shared error schema ──────────────────────────────────────────────────────

export const documentsAuthErrorSchema = z.object({ error: z.string() });

export const documentsValidationErrorSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});
