/**
 * QdrantService Search Types & Filter Builders
 * Shared filter construction and the search-related type surface.
 * The search calls themselves live in operations/vectorSearch.ts.
 */

interface QdrantFilter {
  must?: FilterCondition[];
  must_not?: FilterCondition[];
  should?: FilterCondition[];
}

interface FilterCondition {
  key: string;
  match?: { value?: string | number; any?: (string | number)[]; text?: string };
  range?: { gte?: number; lte?: number; gt?: number; lt?: number };
}

interface SearchHit {
  id: string | number;
  score: number;
  payload?: Record<string, unknown>;
  vector?: unknown;
}

// Search options interfaces
interface BaseSearchOptions {
  limit?: number;
  threshold?: number;
}

interface DocumentSearchOptions extends BaseSearchOptions {
  userId?: string | null;
  documentIds?: string[] | null;
  collection?: string;
  section?: string | null;
}

interface ContentExampleSearchOptions extends BaseSearchOptions {
  contentType?: string;
  categories?: string[];
  tags?: string[];
}

interface SocialMediaSearchOptions extends BaseSearchOptions {
  platform?: string;
  country?: string;
  landesverband?: string | readonly string[];
  collection?: string;
}

// Search result interfaces
interface SearchResult {
  id: string | number;
  score: number;
  document_id?: string;
  chunk_text?: string;
  chunk_index?: number;
  metadata?: Record<string, unknown>;
  user_id?: string;
  title?: string | null;
  filename?: string | null;
  url?: string | null;
  section?: string | null;
  published_at?: string | null;
}

interface ContentExampleResult {
  id: string;
  score: number;
  title?: string;
  content?: string;
  type?: string;
  categories?: string[];
  tags?: string[];
  description?: string;
  content_data?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  created_at?: string;
  similarity_score?: number;
}

interface SocialMediaResult {
  id: string | number;
  score: number;
  content?: string;
  platform?: string;
  country?: string | null;
  source_account?: string | null;
  created_at?: string;
  _debug_payload?: Record<string, unknown>;
}

interface SearchResponse<T> {
  success: boolean;
  results: T[];
  total: number;
}

// Collection names type
interface Collections {
  documents: string;
  grundsatz_documents: string;
  bundestag_content: string;
  gruene_de_documents: string;
  gruene_at_documents: string;
  content_examples: string;
  social_media_examples: string;
  [key: string]: string;
}

/**
 * Extract content from multiple possible payload fields (legacy data support)
 * @param payload - The payload object to extract content from
 * @returns Extracted content string or undefined
 */
export function extractMultiFieldContent(payload: Record<string, unknown>): string | undefined {
  let content = payload.content as string | undefined;

  const contentData = payload.content_data as Record<string, unknown> | undefined;
  if (!content && contentData?.content) {
    content = contentData.content as string;
  }
  if (!content && contentData?.caption) {
    content = contentData.caption as string;
  }
  if (!content && payload.text) {
    content = payload.text as string;
  }
  if (!content && payload.caption) {
    content = payload.caption as string;
  }

  return content;
}

/**
 * Build filter for content example queries
 * @param options - Content example search options
 * @returns Qdrant filter object or undefined
 */
export function buildContentExampleFilter(
  options: ContentExampleSearchOptions
): QdrantFilter | undefined {
  const filter: QdrantFilter = { must: [] };

  if (options.contentType) {
    filter.must!.push({ key: 'type', match: { value: options.contentType } });
  }
  if (options.categories?.length) {
    filter.must!.push({ key: 'categories', match: { any: options.categories } });
  }
  if (options.tags?.length) {
    filter.must!.push({ key: 'tags', match: { any: options.tags } });
  }

  return filter.must!.length > 0 ? filter : undefined;
}

/**
 * Build filter for social media example queries
 * @param options - Social media search options
 * @returns Qdrant filter object or undefined
 */
export function buildSocialMediaFilter(
  options: SocialMediaSearchOptions
): QdrantFilter | undefined {
  const must: FilterCondition[] = [];

  if (options.platform) {
    must.push({ key: 'platform', match: { value: options.platform } });
  }
  if (options.country) {
    must.push({ key: 'country', match: { value: options.country } });
  }
  if (options.landesverband !== undefined) {
    const lv = options.landesverband;
    must.push({
      key: 'landesverband',
      match: typeof lv === 'string' ? { value: lv } : { any: [...lv] },
    });
  }

  return must.length > 0 ? { must } : undefined;
}

// Export types for consumers
export type {
  QdrantFilter,
  FilterCondition,
  SearchHit,
  BaseSearchOptions,
  DocumentSearchOptions,
  ContentExampleSearchOptions,
  SocialMediaSearchOptions,
  SearchResult,
  ContentExampleResult,
  SocialMediaResult,
  SearchResponse,
  Collections,
};
