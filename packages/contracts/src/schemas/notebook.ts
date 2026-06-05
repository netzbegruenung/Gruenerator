/**
 * Zod schemas for notebook interaction endpoints.
 * Mirrors apps/api/routes/notebook/interactionController.ts.
 *
 * IMPORTANT: Request bodies use `.nullish()` for optional fields per the
 * 2026-04-12 production incident rule. The frontend follows feedback_no_undefined
 * and sends `null` for unset values; plain `.optional()` would 400 every request.
 */
import { z } from 'zod';

// ── Request bodies ──────────────────────────────────────────────────────────

export const askQuestionBodySchema = z.object({
  question: z.string(),
  filters: z.record(z.unknown()).nullish(),
  collectionIds: z.array(z.string()).nullish(),
  fastMode: z.boolean().nullish(),
});

// ── Response schemas ────────────────────────────────────────────────────────

export const notebookErrorResponseSchema = z.object({
  error: z.string(),
});

/**
 * Collection filter metadata. The shape has discriminated field types —
 * date_range fields have `min`/`max`, while select-style fields have
 * `values` and optional `valueLabels`. Both use `.nullish()` on optional
 * fields so the schema tolerates server omissions cleanly.
 */
export const notebookFilterFieldSchema = z.object({
  label: z.string(),
  type: z.string(),
  values: z.array(z.object({ value: z.string(), count: z.number() })).nullish(),
  valueLabels: z.record(z.string()).nullish(),
  min: z.string().nullish(),
  max: z.string().nullish(),
});

export const notebookFiltersResponseSchema = z.object({
  collectionId: z.string(),
  collectionName: z.string().nullable(),
  filters: z.record(notebookFilterFieldSchema),
});

export const notebookPublicCollectionResponseSchema = z.object({
  collection: z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullish(),
  }),
  message: z.string(),
});

/**
 * Citation in a QA answer. Single source of truth for the cited-source shape
 * returned by the notebook ask endpoints (mirrors the broad `Citation` union in
 * apps/api/services/notebook/types.ts — most fields are `.nullish()` because the
 * person-query path emits a different field subset than the document path).
 *
 * `date` is the source's real publication date (or upload date for user docs);
 * `null` when the source carries no usable date. Set in
 * `buildReferencesMap` (SearchResultProcessor) from the Qdrant `published_at`
 * payload — NOT the response timestamp.
 */
export const notebookCitationSchema = z.object({
  index: z.string(),
  // Nullability mirrors the producer types exactly: plain `.optional()` for
  // `T | undefined` fields, `.nullable().optional()` only where the value is
  // genuinely nullable. `date` is the real source date (or null).
  date: z.string().nullable().optional(),
  cited_text: z.string().optional(),
  document_title: z.string().optional(),
  document_id: z.string().optional(),
  source_url: z.string().nullable().optional(),
  similarity_score: z.number().optional(),
  chunk_index: z.number().optional(),
  filename: z.string().nullable().optional(),
  page_number: z.number().nullable().optional(),
  collection_id: z.string().optional(),
  collection_name: z.string().optional(),
  // Person-query / custom citation fields
  title: z.string().optional(),
  url: z.string().nullable().optional(),
  snippet: z.string().optional(),
  source: z.string().optional(),
  type: z.string().optional(),
});
export type NotebookCitation = z.infer<typeof notebookCitationSchema>;

/**
 * A source (document) grouped from one or more citations. `date` mirrors
 * `notebookCitationSchema.date`.
 */
export const notebookSourceSchema = z.object({
  document_id: z.string(),
  document_title: z.string(),
  source_url: z.string().nullable(),
  chunk_text: z.string(),
  similarity_score: z.number(),
  date: z.string().nullable().optional(),
  citations: z.array(notebookCitationSchema),
});
export type NotebookSource = z.infer<typeof notebookSourceSchema>;

/**
 * QA response mirrors `QAResponse` from apps/api/services/notebook/types.ts.
 * `citations` is strongly typed (it is the canonical cited-source list the UI
 * renders, and now carries `date`). `sources`, `allSources`, `metadata` stay
 * loosely typed (`z.unknown()`) — their inner shapes are deeply nested unions
 * (SearchSource / ExpandedChunkResult / multiple metadata types) and narrowing
 * them would strip branch-specific fields at serialize time.
 */
export const notebookQAResponseSchema = z.object({
  success: z.boolean(),
  answer: z.string(),
  citations: z.array(notebookCitationSchema).nullish(),
  // Loosely-typed fields use z.unknown() because the service returns strict
  // union types (MultiCollectionMetadata | SingleCollectionMetadata | ...)
  // that don't have index signatures. The inferred schema type for these
  // fields becomes `unknown`, which every concrete type assigns to.
  sources: z.unknown(),
  allSources: z.unknown(),
  sourcesByCollection: z.unknown().nullish(),
  metadata: z.unknown(),
  isPersonQuery: z.boolean().nullish(),
  person: z.unknown().nullish(),
});

// ── Per-notebook manual research (chunk-level Qdrant search) ────────────────

export const notebookResearchSearchBodySchema = z.object({
  query: z.string().min(2),
  limit: z.number().nullish(),
  mode: z.enum(['hybrid', 'vector', 'text']).nullish(),
  sortBy: z.enum(['relevance', 'date_desc', 'date_asc']).nullish(),
});

export const notebookResearchResultSchema = z.object({
  document_id: z.string(),
  title: z.string(),
  source_url: z.string().nullable(),
  relevant_content: z.string(),
  similarity_score: z.number(),
  chunk_count: z.number(),
  top_chunks: z.array(
    z.object({
      preview: z.string(),
      chunk_index: z.number(),
      page_number: z.number().nullable(),
    })
  ),
  collection_id: z.string().nullish(),
  collection_name: z.string().nullish(),
  published_at: z.string().nullable().nullish(),
});

export const notebookResearchSearchResponseSchema = z.object({
  results: z.array(notebookResearchResultSchema),
  metadata: z.object({
    totalResults: z.number(),
    collections: z.array(z.string()),
    timeMs: z.number(),
  }),
});
