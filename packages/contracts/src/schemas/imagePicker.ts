/**
 * Zod schemas for image picker endpoints.
 * Mirrors apps/api/routes/image/pickerController.ts.
 *
 * IMPORTANT: Request bodies use `.nullish()` for optional fields per the
 * 2026-04-12 production rule.
 *
 * NOTE: GET /stock-image/:filename is a binary file-serve route — not covered.
 */
import { z } from 'zod';

// ── Request bodies ──────────────────────────────────────────────────────────

export const imageSelectBodySchema = z.object({
  text: z.string(),
  type: z.string().nullish(),
  tags: z.unknown().nullish(),
  maxCandidates: z.number().nullish(),
});

export const imageValidateBodySchema = z.object({
  filename: z.string(),
});

export const imageDownloadTrackBodySchema = z.object({
  filename: z.string(),
  downloadLocation: z.string().nullish(),
});

// ── Sub-schemas ─────────────────────────────────────────────────────────────

const selectedImageSchema = z.object({
  filename: z.string(),
  category: z.string().nullish(),
  tags: z.unknown().nullish(),
  alt_text: z.string().nullish(),
  path: z.string(),
});

// ── Response schemas ────────────────────────────────────────────────────────

export const imageSelectResponseSchema = z.object({
  success: z.boolean(),
  selectedImage: selectedImageSchema.nullish(),
  confidence: z.number().nullish(),
  reasoning: z.string().nullish(),
  alternatives: z.array(selectedImageSchema).nullish(),
  metadata: z.unknown().nullish(),
  error: z.string().nullish(),
  code: z.string().nullish(),
  message: z.string().nullish(),
});

export const imageStatsResponseSchema = z.object({
  success: z.boolean(),
  stats: z.unknown().nullish(),
  error: z.string().nullish(),
  code: z.string().nullish(),
});

export const imageCatalogResponseSchema = z.object({
  success: z.boolean(),
  catalog: z.unknown().nullish(),
  count: z.number().nullish(),
  timestamp: z.string().nullish(),
  error: z.string().nullish(),
  code: z.string().nullish(),
});

export const cacheClearResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().nullish(),
  timestamp: z.string().nullish(),
  error: z.string().nullish(),
  code: z.string().nullish(),
});

export const imageValidateResponseSchema = z.object({
  success: z.boolean(),
  filename: z.string().nullish(),
  exists: z.boolean().nullish(),
  path: z.string().nullable().nullish(),
  fullPath: z.string().nullish(),
  timestamp: z.string().nullish(),
  error: z.string().nullish(),
  code: z.string().nullish(),
});

export const stockCatalogResponseSchema = z.object({
  success: z.boolean(),
  images: z.array(z.unknown()).nullish(),
  count: z.number().nullish(),
  totalCount: z.number().nullish(),
  categories: z.array(z.string()).nullish(),
  timestamp: z.string().nullish(),
  error: z.string().nullish(),
  code: z.string().nullish(),
  message: z.string().nullish(),
});

export const downloadTrackResponseSchema = z.object({
  success: z.boolean(),
  tracked: z.boolean().nullish(),
  timestamp: z.string().nullish(),
  error: z.string().nullish(),
  code: z.string().nullish(),
});

export const imagePickerErrorResponseSchema = z.object({
  success: z.boolean(),
  error: z.string(),
  code: z.string().nullish(),
  message: z.string().nullish(),
});
