import { z } from 'zod';

/** Content types the unified search covers. Features/agents are matched client-side. */
export const globalSearchTypeSchema = z.enum(['chat', 'doc', 'canvas', 'media', 'notebook']);

export type GlobalSearchType = z.infer<typeof globalSearchTypeSchema>;

export const globalSearchItemSchema = z.object({
  id: z.string(),
  type: globalSearchTypeSchema,
  title: z.string(),
  subtitle: z.string().nullable(),
  /** Ready-to-navigate frontend path; the slug rules live server-side. */
  url: z.string(),
  thumbnailUrl: z.string().nullable(),
  updatedAt: z.string().nullable(),
});

export type GlobalSearchItem = z.infer<typeof globalSearchItemSchema>;

/**
 * Only `q`. The per-category cap is a server constant — a coerced numeric query
 * param would widen the ts-rest request type past Express's `ParsedQs`.
 */
export const globalSearchQuerySchema = z.object({
  q: z.string().min(2).max(200),
});

export const globalSearchResultsSchema = z.object({
  chats: z.array(globalSearchItemSchema),
  docs: z.array(globalSearchItemSchema),
  canvases: z.array(globalSearchItemSchema),
  media: z.array(globalSearchItemSchema),
  notebooks: z.array(globalSearchItemSchema),
});

export type GlobalSearchResults = z.infer<typeof globalSearchResultsSchema>;

export const globalSearchResponseSchema = z.object({
  query: z.string(),
  results: globalSearchResultsSchema,
  /** Categories whose backing query failed; the rest of the response is valid. */
  failedCategories: z.array(z.string()),
});

export type GlobalSearchResponse = z.infer<typeof globalSearchResponseSchema>;

export const globalSearchErrorResponseSchema = z.object({
  error: z.string(),
  details: z.string().optional(),
});

/**
 * Office content search — docs, boards, sheets, presentations — matching title
 * OR body. Powers the "Arbeiten" composer, which needs to jump to a document
 * whose search term lives in the body, not just the title. Kept separate from
 * the multi-category `globalSearch` so the composer runs one focused query.
 */
export const officeSearchKindSchema = z.enum(['doc', 'board', 'sheet', 'pres']);

export type OfficeSearchKind = z.infer<typeof officeSearchKindSchema>;

export const officeSearchItemSchema = z.object({
  id: z.string(),
  kind: officeSearchKindSchema,
  title: z.string(),
  /** Short body excerpt; '' when the match is title-only or no preview exists. */
  snippet: z.string(),
  /** Ready-to-navigate frontend path (/office/:id, or /boards/:id for boards). */
  url: z.string(),
  updatedAt: z.string().nullable(),
});

export type OfficeSearchItem = z.infer<typeof officeSearchItemSchema>;

export const officeSearchResponseSchema = z.object({
  query: z.string(),
  items: z.array(officeSearchItemSchema),
});

export type OfficeSearchResponse = z.infer<typeof officeSearchResponseSchema>;
