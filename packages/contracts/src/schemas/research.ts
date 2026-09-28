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

export const researchDocumentQuerySchema = z.object({
  collectionId: z.string(),
  sourceUrl: z.string(),
  /** The search the document was opened from; its terms mark the passages. */
  query: z.string().nullish(),
});

/** A user's own document for the reader. `notebookId` names the notebook the
 *  link came from — reading through it is how members of a shared notebook
 *  get access to a document they do not own. */
export const userDocumentReaderQuerySchema = z.object({
  notebookId: z.string().nullish(),
  query: z.string().nullish(),
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

/** A run of text, split at the query terms. */
export const researchDocumentPartSchema = z.object({
  text: z.string(),
  term: z.boolean(),
});

/** Text inside a block; `passage` numbers it when it is a relevant passage. */
export const researchDocumentSegmentSchema = z.object({
  passage: z.number().nullable(),
  parts: z.array(researchDocumentPartSchema),
});

export const researchDocumentBlockSchema = z.object({
  kind: z.enum(['heading', 'paragraph']),
  segments: z.array(researchDocumentSegmentSchema),
});

export const researchDocumentPassageSchema = z.object({
  index: z.number(),
  /** The heading above the passage, when the text has headings. */
  heading: z.string().nullable(),
  /** Short teaser for the passage list. */
  text: z.string(),
});

/** A document, ready for the notebook reader. */
export const researchDocumentResponseSchema = z.object({
  title: z.string(),
  /** The original on the web; `null` for an uploaded file, which has none. */
  sourceUrl: z.string().nullable(),
  sourceName: z.string().nullable(),
  contentTypeLabel: z.string().nullable(),
  publishedAt: z.string().nullable(),
  blocks: z.array(researchDocumentBlockSchema),
  passages: z.array(researchDocumentPassageSchema),
});

export type ResearchSearchBody = z.infer<typeof researchSearchBodySchema>;
export type ResearchSimilarBody = z.infer<typeof researchSimilarBodySchema>;
export type ResearchResult = z.infer<typeof researchResultSchema>;
export type ResearchSearchResponse = z.infer<typeof researchSearchResponseSchema>;
export type ResearchDocumentQuery = z.infer<typeof researchDocumentQuerySchema>;
export type ResearchDocumentPart = z.infer<typeof researchDocumentPartSchema>;
export type ResearchDocumentSegment = z.infer<typeof researchDocumentSegmentSchema>;
export type ResearchDocumentBlock = z.infer<typeof researchDocumentBlockSchema>;
export type ResearchDocumentPassage = z.infer<typeof researchDocumentPassageSchema>;
export type ResearchDocumentResponse = z.infer<typeof researchDocumentResponseSchema>;
export type ResearchCollectionInfo = z.infer<typeof researchCollectionInfoSchema>;
