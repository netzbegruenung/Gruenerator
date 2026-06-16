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
 * QA response metadata. The service returns one of three variants
 * (MultiCollectionMetadata | SingleCollectionMetadata | PersonQueryMetadata,
 * plus an `is_public` flag the public-ask handler adds). We model it as the
 * **superset with every field optional** rather than a discriminated union:
 * there is no literal discriminant field across the three, and a plain
 * `z.union` would strip the Person-only fields when a Single-shaped object
 * matched the Single member first. The superset types the shape end-to-end
 * (no more `z.unknown()` drift) without dropping any variant's fields.
 */
export const notebookQAMetadataSchema = z.object({
  // multi
  response_time_ms: z.number().optional(),
  collections_queried: z.array(z.string()).optional(),
  document_scope_detected: z.string().nullable().optional(),
  document_title_filter: z.string().nullable().optional(),
  subcategory_filters_applied: z.record(z.unknown()).nullable().optional(),
  total_results: z.number().optional(),
  citations_count: z.number().optional(),
  fast_mode: z.boolean().optional(),
  // single
  collection_id: z.string().optional(),
  collection_name: z.string().optional(),
  sources_count: z.number().optional(),
  corpus_state: z.enum(['indexing', 'failed', 'ready']).optional(),
  corpus_state_detail: z
    .object({
      indexing_count: z.number(),
      failed_count: z.number(),
      ready_count: z.number(),
      total_count: z.number(),
    })
    .optional(),
  // person query
  extractedName: z.string().optional(),
  detectionConfidence: z.number().optional(),
  detectionSource: z.string().optional(),
  contentMentionsCount: z.number().optional(),
  drucksachenCount: z.number().optional(),
  aktivitaetenCount: z.number().optional(),
  // public-ask augmentation (added in notebookContractRouter.askPublic)
  is_public: z.boolean().optional(),
});
export type NotebookQAMetadata = z.infer<typeof notebookQAMetadataSchema>;

/**
 * QA response mirrors `QAResponse` from apps/api/services/notebook/types.ts.
 * `citations` (carries `date`), `metadata`, and `person` are strongly typed.
 * `sources`, `allSources`, `sourcesByCollection` stay `z.unknown()` — their
 * inner shapes are heterogeneous unions (SearchSource / ExpandedChunkResult /
 * Citation) and narrowing them would strip branch-specific fields at serialize
 * time.
 */
export const notebookQAResponseSchema = z.object({
  success: z.boolean(),
  answer: z.string(),
  citations: z.array(notebookCitationSchema).nullish(),
  sources: z.unknown(),
  allSources: z.unknown(),
  sourcesByCollection: z.unknown().nullish(),
  metadata: notebookQAMetadataSchema,
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

// ── Recent documents ("Zuletzt hinzugefügt") ────────────────────────────────

export const notebookRecentDocumentCardSchema = z.object({
  id: z.string(),
  collectionId: z.string(),
  collectionName: z.string(),
  title: z.string(),
  snippet: z.string().nullable(),
  url: z.string().nullable(),
  publishedAt: z.string().nullable(),
  sourceLabel: z.string().nullable(),
});

export type NotebookRecentDocumentCard = z.infer<typeof notebookRecentDocumentCardSchema>;

export const notebookRecentResponseSchema = z.object({
  collectionId: z.string().nullish(),
  items: z.array(notebookRecentDocumentCardSchema),
});

// ── Statistics ───────────────────────────────────────────────────────────────

const notebookStatsFacetBucketSchema = z.object({ value: z.string(), count: z.number() });

export const notebookStatsResponseSchema = z.object({
  totalDocuments: z.number(),
  categoryDistribution: z.array(notebookStatsFacetBucketSchema),
  sourceDistribution: z.array(notebookStatsFacetBucketSchema),
  dateRange: z.object({ min: z.string().nullable(), max: z.string().nullable() }),
  monthlyActivity: z.array(z.object({ month: z.string(), count: z.number() })),
  topWords: z.array(z.object({ word: z.string(), count: z.number() })),
  topicDistribution: z.array(z.object({ topic: z.string(), count: z.number() })),
  topicSampleSize: z.number(),
  topPersons: z.array(z.object({ person: z.string(), count: z.number() })),
});

export type NotebookStatsResponse = z.infer<typeof notebookStatsResponseSchema>;
