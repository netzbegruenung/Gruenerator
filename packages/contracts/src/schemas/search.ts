/**
 * Zod schemas for web search endpoints.
 * Mirrors apps/api/routes/search/searchController.ts.
 * Complex nested types (ResearchDossier etc.) are left as z.unknown() on purpose —
 * the deep-research endpoint is AI-generated and its shape evolves. Model the
 * simple /search endpoint tightly; widen deep-research progressively.
 */
import { z } from 'zod';

// ── Request bodies ──────────────────────────────────────────────────────────

export const searchBodySchema = z.object({
  query: z.string(),
  includeSummary: z.boolean().optional(),
  maxResults: z.number().optional(),
  language: z.string().optional(),
  timeRange: z.string().optional(),
  safesearch: z.number().optional(),
  categories: z.string().optional(),
});

// ── Shared response sub-schemas ─────────────────────────────────────────────

export const searchResultSchema = z.object({
  url: z.string(),
  title: z.string(),
  content: z.string().optional(),
  score: z.number().optional(),
  source: z.string().optional(),
  excerpt: z.string().optional(),
});

export const citationSchema = z.object({
  index: z.number(),
  url: z.string(),
  title: z.string(),
});

export const sourceSchema = z.object({
  url: z.string(),
  title: z.string(),
  content: z.string().optional(),
});

// ── Response schemas ────────────────────────────────────────────────────────

export const searchResponseSchema = z.object({
  success: z.literal(true),
  query: z.string(),
  results: z.array(searchResultSchema),
  resultCount: z.number(),
  searchEngine: z.string(),
  summary: z
    .object({
      text: z.string().optional(),
      generated: z.boolean().optional(),
    })
    .optional(),
  citations: z.array(citationSchema).optional(),
  sources: z.array(sourceSchema).optional(),
  metadata: z
    .object({
      processingTimeMs: z.number(),
      timestamp: z.string(),
      searchType: z.string(),
      includedSummary: z.boolean(),
    })
    .passthrough(),
});

export const searchErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  metadata: z.unknown(),
  details: z.string().optional(),
});

export const searchStatusResponseSchema = z.object({
  success: z.boolean(),
  status: z.string(),
  service: z.string(),
  searxng: z.unknown().optional(),
  timestamp: z.string(),
  error: z.string().optional(),
  details: z.string().optional(),
});
