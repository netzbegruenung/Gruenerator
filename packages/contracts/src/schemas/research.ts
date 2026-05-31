/**
 * Zod schemas for the /api/research/* surface (system-collection manual
 * research). Mirrors apps/api/routes/research/researchContractRouter.ts.
 *
 * The result and filter-field shapes are identical to the per-notebook
 * research endpoint, so they are reused from ./notebook.js rather than
 * re-declared — one source of truth for the research result shape.
 *
 * Request bodies use `.nullish()` for optional fields per the
 * feedback_no_undefined rule: the frontend sends `null` for unset values,
 * which `.optional()` alone would reject.
 */
import { z } from 'zod';

import { notebookFilterFieldSchema, notebookResearchResultSchema } from './notebook.js';

// ── Request bodies / queries ────────────────────────────────────────────────

export const researchSearchBodySchema = z.object({
  query: z.string().min(2),
  collectionIds: z.array(z.string()).nullish(),
  limit: z.number().nullish(),
  filters: z.record(z.unknown()).nullish(),
  mode: z.enum(['hybrid', 'vector', 'text']).nullish(),
  sortBy: z.enum(['relevance', 'date_desc', 'date_asc']).nullish(),
});

export const researchSimilarBodySchema = z.object({
  sourceUrl: z.string().url(),
  collectionId: z.string(),
  limit: z.number().nullish(),
});

export const researchFiltersQuerySchema = z.object({
  /** Comma-separated system collection IDs; omitted = all collections. */
  collectionIds: z.string().nullish(),
});

// ── Response schemas ────────────────────────────────────────────────────────

export const researchErrorResponseSchema = z.object({
  error: z.string(),
});

/** A single research hit — same shape as the per-notebook research result. */
export const researchResultSchema = notebookResearchResultSchema;

export const researchSearchResponseSchema = z.object({
  results: z.array(researchResultSchema),
  metadata: z.object({
    totalResults: z.number(),
    collections: z.array(z.string()),
    timeMs: z.number(),
  }),
});

export const researchCollectionInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  filterableFields: z.array(z.string()),
});

export const researchCollectionsResponseSchema = z.array(researchCollectionInfoSchema);

export const researchFiltersResponseSchema = z.object({
  filters: z.record(notebookFilterFieldSchema),
});

export type ResearchSearchBody = z.infer<typeof researchSearchBodySchema>;
export type ResearchSimilarBody = z.infer<typeof researchSimilarBodySchema>;
export type ResearchResult = z.infer<typeof researchResultSchema>;
export type ResearchSearchResponse = z.infer<typeof researchSearchResponseSchema>;
export type ResearchCollectionInfo = z.infer<typeof researchCollectionInfoSchema>;
