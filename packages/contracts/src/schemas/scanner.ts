/**
 * Zod schemas for the scanner OCR endpoint.
 * Mirrors apps/api/routes/scanner/index.ts.
 *
 * NOTE: POST /api/scanner/extract is a multer multipart upload, so it is NOT
 * modelled as a ts-rest router (repo convention: ts-rest doesn't cleanly model
 * multipart — see voiceContract/transferContract). These schemas are the shared
 * source of truth for the query, response, and OCR-provider set instead: the
 * backend validates the request against them and the frontend derives its types
 * via `z.infer` rather than hand-duplicating the shape.
 */
import { z } from 'zod';

/**
 * OCR providers the scanner can route to. Handwriting recognition MUST use
 * Mistral: Docling cannot read handwritten scans, and because the backend
 * default is `env.OCR_PROVIDER` (Docling in production), the caller has to name
 * the provider explicitly rather than relying on the default.
 */
export const ocrProviderSchema = z.enum(['mistral', 'docling']);
export type OcrProvider = z.infer<typeof ocrProviderSchema>;

/** Query params for POST /api/scanner/extract. */
export const scannerExtractQuerySchema = z.object({
  provider: ocrProviderSchema.optional(),
});
export type ScannerExtractQuery = z.infer<typeof scannerExtractQuerySchema>;

export const scannerFileInfoSchema = z.object({
  originalname: z.string(),
  size: z.number(),
  mimetype: z.string(),
});

/** Success payload for POST /api/scanner/extract. */
export const scannerExtractSuccessSchema = z.object({
  success: z.literal(true),
  text: z.string(),
  pageCount: z.number(),
  method: z.string(),
  fileInfo: scannerFileInfoSchema,
});

/** Error payload for POST /api/scanner/extract. */
export const scannerExtractErrorSchema = z.object({
  success: z.literal(false),
  error: z.string(),
});

export const scannerExtractResponseSchema = z.union([
  scannerExtractSuccessSchema,
  scannerExtractErrorSchema,
]);
export type ScannerExtractResponse = z.infer<typeof scannerExtractResponseSchema>;
