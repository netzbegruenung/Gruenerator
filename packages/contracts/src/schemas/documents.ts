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
 *   - 'failed'     final error state; the reason is written to
 *                  documents.metadata.processing_error and surfaced by the
 *                  status routes (there is no error_message column)
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

// ── Upload formats ───────────────────────────────────────────────────────────

/**
 * The formats the extraction pipeline can actually read. Single source of truth
 * for the file dialog's `accept` list, the client-side drop check and the
 * server-side guard on POST /documents/upload-only — those three drifted apart
 * before: the UI advertised DOC/ODT/RTF, which `extractTextFromFile` has never
 * supported, and the resulting failure was invisible.
 *
 * `kind` mirrors the branch taken in
 * apps/api/services/document-services/DocumentProcessingService/textExtraction.ts:
 *   - 'ocr'  → handed to Mistral OCR
 *   - 'text' → decoded as utf-8
 *
 * Adding an entry here is a promise the pipeline has to keep; extend
 * textExtraction.ts in the same change.
 */
export const DOCUMENT_UPLOAD_FORMATS = [
  { extension: '.pdf', label: 'PDF', mimeTypes: ['application/pdf'], kind: 'ocr' },
  {
    extension: '.docx',
    label: 'DOCX',
    mimeTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    kind: 'ocr',
  },
  {
    extension: '.pptx',
    label: 'PPTX',
    mimeTypes: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    kind: 'ocr',
  },
  { extension: '.txt', label: 'TXT', mimeTypes: ['text/plain'], kind: 'text' },
  { extension: '.md', label: 'MD', mimeTypes: ['text/markdown', 'text/x-markdown'], kind: 'text' },
  { extension: '.csv', label: 'CSV', mimeTypes: ['text/csv'], kind: 'text' },
  { extension: '.png', label: 'PNG', mimeTypes: ['image/png'], kind: 'ocr' },
  { extension: '.jpg', label: 'JPG', mimeTypes: ['image/jpeg', 'image/jpg'], kind: 'ocr' },
  { extension: '.jpeg', label: 'JPEG', mimeTypes: ['image/jpeg', 'image/jpg'], kind: 'ocr' },
  { extension: '.avif', label: 'AVIF', mimeTypes: ['image/avif'], kind: 'ocr' },
] as const;

export type DocumentUploadFormat = (typeof DOCUMENT_UPLOAD_FORMATS)[number];
export type DocumentUploadExtension = DocumentUploadFormat['extension'];

/** For the file dialog's `accept` attribute and the "PDF, DOCX, …" hint. */
export const DOCUMENT_UPLOAD_EXTENSIONS: readonly DocumentUploadExtension[] =
  DOCUMENT_UPLOAD_FORMATS.map((f) => f.extension);

/** Matches the multer `limits.fileSize` on every document upload route. */
export const DOCUMENT_MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/**
 * Resolve a file to its extraction format. The extension decides, not the
 * mimetype: browsers hand us an empty string or `application/octet-stream` for
 * `.md` on most platforms, and a mimetype-only check therefore rejected files
 * the pipeline can read perfectly well. The mimetype is only consulted as a
 * fallback when the name carries no usable extension (Wolke/Docs imports).
 */
export function resolveDocumentUploadFormat(
  filename: string | null | undefined,
  mimetype?: string | null
): DocumentUploadFormat | null {
  const name = (filename ?? '').toLowerCase();
  const byExtension = DOCUMENT_UPLOAD_FORMATS.find((f) => name.endsWith(f.extension));
  if (byExtension) return byExtension;

  const mime = (mimetype ?? '').toLowerCase().split(';')[0]?.trim() ?? '';
  if (!mime) return null;
  return (
    DOCUMENT_UPLOAD_FORMATS.find((f) => (f.mimeTypes as readonly string[]).includes(mime)) ?? null
  );
}

/** Human-readable list for error messages and UI hints ("PDF, DOCX, …"). */
export const DOCUMENT_UPLOAD_FORMAT_HINT = DOCUMENT_UPLOAD_FORMATS.filter(
  (f) => f.extension !== '.jpeg'
)
  .map((f) => f.label)
  .join(', ');

// ── Shared error schema ──────────────────────────────────────────────────────

export const documentsAuthErrorSchema = z.object({ error: z.string() });

export const documentsValidationErrorSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});
