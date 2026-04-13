/**
 * Zod schemas for document export endpoints.
 * Mirrors the schemas in apps/api/routes/exports/docxController.ts and pdfController.ts.
 */
import { z } from 'zod';

// ── Shared citation schema ──────────────────────────────────────────────────

export const citationSchema = z.object({
  index: z.string(),
  document_title: z.string().optional(),
  cited_text: z.string().optional(),
  similarity_score: z.number().optional(),
  source_url: z.string().optional(),
});

// ── Request bodies ──────────────────────────────────────────────────────────

export const docxExportBodySchema = z.object({
  content: z.string(),
  title: z.string().optional(),
  citations: z.array(citationSchema).optional(),
});

export const pdfExportBodySchema = z.object({
  content: z.string(),
  title: z.string().optional(),
});

// ── Response schemas ────────────────────────────────────────────────────────

/**
 * Binary file responses are typed as `unknown` because ts-rest does not model
 * binary blobs in the schema layer — the actual response will be a Buffer/Blob.
 * Consumers must use `responseType: 'blob'` (axios) or handle the raw Response.
 */
export const binaryFileResponseSchema = z.unknown();

export const exportErrorResponseSchema = z.object({
  success: z.literal(false),
  message: z.string(),
  error: z.string().optional(),
});
