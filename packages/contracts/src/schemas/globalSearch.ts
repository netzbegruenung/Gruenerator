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
 * Upper bound for `q`. Exported so callers can clamp (or skip) *before* firing —
 * the composer input doubles as a prompt field, and a pasted prompt would
 * otherwise send a multi-KB query per keystroke that can only be rejected.
 */
export const GLOBAL_SEARCH_MAX_QUERY_LENGTH = 200;

export const GLOBAL_SEARCH_MIN_QUERY_LENGTH = 2;

/**
 * Only `q`. The per-category cap is a server constant — a coerced numeric query
 * param would widen the ts-rest request type past Express's `ParsedQs`.
 */
export const globalSearchQuerySchema = z.object({
  q: z.string().min(GLOBAL_SEARCH_MIN_QUERY_LENGTH).max(GLOBAL_SEARCH_MAX_QUERY_LENGTH),
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

/**
 * Thread search — the caller's own chat conversations, matching message content
 * OR thread title. Powers the search field above the sidebar thread list, which
 * has to find a conversation by something that was *said* in it, not only by its
 * title. Kept separate from the multi-category `globalSearch` for the same
 * reason `officeSearch` is: one focused query per keystroke, and a list-sized
 * result count instead of the palette's five.
 */
export const threadSearchItemSchema = z.object({
  /** chat_threads.id — the client builds the path from it via buildThreadPath. */
  threadId: z.string(),
  title: z.string(),
  /** ±100 chars around the match; the title when the match was title-only. */
  snippet: z.string(),
  messageRole: z.enum(['user', 'assistant']),
  /** ISO timestamp of the matched message. Drives the date grouping. */
  matchedAt: z.string(),
});

export type ThreadSearchItem = z.infer<typeof threadSearchItemSchema>;

export const threadSearchResponseSchema = z.object({
  query: z.string(),
  items: z.array(threadSearchItemSchema),
});

export type ThreadSearchResponse = z.infer<typeof threadSearchResponseSchema>;
