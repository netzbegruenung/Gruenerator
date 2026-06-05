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
 * Person info returned by the bundestagsfraktion person-query path. Mirrors
 * `PersonInfo` in apps/api/services/notebook/types.ts.
 */
export const notebookPersonInfoSchema = z.object({
  name: z.string().optional(),
  fraktion: z.union([z.string(), z.array(z.string())]).optional(),
  wahlkreis: z.string().optional(),
  biografie: z.string().optional(),
});
export type NotebookPersonInfo = z.infer<typeof notebookPersonInfoSchema>;

/**
 * QA response mirrors `QAResponse` from apps/api/services/notebook/types.ts.
 * `person` is strongly typed; `citations`, `sources`, `allSources`, `metadata`
 * stay loosely typed (`z.unknown()`) because their inner shapes are deeply
 * nested unions (Citation / SearchSource / ExpandedChunkResult / multiple
 * metadata types) and narrowing them would strip branch-specific fields.
 */
export const notebookQAResponseSchema = z.object({
  success: z.boolean(),
  answer: z.string(),
  citations: z.unknown(),
  sources: z.unknown(),
  allSources: z.unknown(),
  sourcesByCollection: z.unknown().nullish(),
  metadata: z.unknown(),
  isPersonQuery: z.boolean().nullish(),
  person: notebookPersonInfoSchema.nullish(),
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
