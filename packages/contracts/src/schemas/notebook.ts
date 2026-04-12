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
 * QA response mirrors `QAResponse` from apps/api/services/notebook/types.ts.
 * Fields `citations`, `sources`, `allSources`, `metadata` are left loosely
 * typed (`z.unknown()`) because their inner shapes are deeply nested unions
 * of Citation / SearchSource / ExpandedChunkResult / multiple metadata types.
 * `.passthrough()` preserves any extra fields the service adds over time.
 *
 * If a frontend consumer needs one of those inner shapes typed strictly,
 * add the inner schema here and narrow the field — fix at the source.
 */
export const notebookQAResponseSchema = z.object({
  success: z.boolean(),
  answer: z.string(),
  // Loosely-typed fields use z.unknown() because the service returns strict
  // union types (MultiCollectionMetadata | SingleCollectionMetadata | ...)
  // that don't have index signatures. The inferred schema type for these
  // fields becomes `unknown`, which every concrete type assigns to.
  //
  // NOTE: no `.passthrough()` — Zod strips unknown fields at serialize time.
  // This is safe for response validation; we only care about the shape above,
  // and `.passthrough()` makes the inferred type require an index signature
  // at the top level, which QAResponse doesn't have.
  citations: z.unknown(),
  sources: z.unknown(),
  allSources: z.unknown(),
  sourcesByCollection: z.unknown().nullish(),
  metadata: z.unknown(),
  isPersonQuery: z.boolean().nullish(),
  person: z.unknown().nullish(),
});
