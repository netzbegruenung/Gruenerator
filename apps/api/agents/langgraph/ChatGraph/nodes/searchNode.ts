/**
 * Search Node
 *
 * Executes the appropriate search tool based on the classified intent.
 * Uses the direct search functions from the chat agents module.
 */

import { vectorConfig } from '../../../../config/vectorConfig.js';
import {
  executeDirectSearch,
  // executeDirectPersonSearch, // DISABLED: Person search not production ready
  executeDirectExamplesSearch,
  executeDirectWebSearch,
  executeResearch,
} from '../../../../routes/chat/agents/directSearch.js';
import {
  searchExamples,
  type ExampleKind,
} from '../../../../services/examples/exampleSearchService.js';
import {
  selectAndCrawlTopUrls,
  type CrawlableResult,
} from '../../../../services/search/CrawlingService.js';
import { expandQuery } from '../../../../services/search/QueryExpansionService.js';
import { DEFAULT_RELEVANCE } from '../../../../services/search/rerankPipeline.js';
import { createLogger } from '../../../../utils/logger.js';
import { type AIWorkerPool } from '../../../../workers/types.js';
import {
  SOURCE_PREFIX,
  type ChatGraphState,
  type DocumentSource,
  type SearchResult,
  type Citation,
  type ResearchToolResult,
  type ExamplesToolResult,
} from '../types.js';

import {
  COLLECTION_LABELS,
  CONTENT_TYPE_LABELS,
  buildCitations,
  deriveCitationTitle,
  extractDomain,
  resolveCollectionName,
} from './citationUtils.js';
import { retrieveWolkeFile } from './wolkeRetrieval.js';
import { retrieveConnectFile } from './connectRetrieval.js';

import type { SubcategoryFilters } from '../../../../config/systemCollectionsConfig.js';
import type { AgentConfig } from '../../../../routes/chat/agents/types.js';

// Re-export for backward compatibility and reuse by SearchGraph
export {
  COLLECTION_LABELS,
  buildCitations,
  CONTENT_TYPE_LABELS,
  deriveCitationTitle,
  extractDomain,
  resolveCollectionName,
};

const log = createLogger('ChatGraph:Search');

/**
 * Return default Qdrant collections based on user locale.
 * Austrian users search Austrian collections; everyone else gets German defaults.
 */
export function getDefaultCollectionsForLocale(locale: string | undefined): string[] {
  if (locale === 'de-AT') return ['oesterreich', 'gruene-at'];
  return ['deutschland', 'bundestagsfraktion', 'gruene-de', 'kommunalwiki'];
}

/**
 * Return supplementary collections to pair with an agent's defaultCollection.
 * Austrian users get Austrian supplements; everyone else gets German defaults.
 */
export function getSupplementaryCollectionsForLocale(locale: string | undefined): string[] {
  if (locale === 'de-AT') return ['gruene-at'];
  return ['bundestagsfraktion', 'gruene-de', 'kommunalwiki'];
}

/**
 * Execute document search across collections (extracted from case 'search').
 * Searches all sub-queries across all specified collections in parallel.
 */
export interface DocumentSearchParallelResult {
  results: SearchResult[];
  searchedCollections: string[];
  errors: { source: string; message: string }[];
}

export async function executeDocumentSearchParallel(
  query: string,
  subQueries: string[] | null,
  notebookCollectionIds: string[],
  agentConfig: AgentConfig,
  filters?: SubcategoryFilters | null,
  userLocale?: string,
  defaultNotebookCollectionIds?: string[]
): Promise<DocumentSearchParallelResult> {
  let collectionsToSearch: string[];
  if (notebookCollectionIds && notebookCollectionIds.length > 0) {
    collectionsToSearch = notebookCollectionIds;
    log.info(`[Search] Using notebook-scoped collections: ${collectionsToSearch.join(', ')}`);
  } else if (agentConfig.toolRestrictions?.allowedCollections?.length) {
    collectionsToSearch = [...agentConfig.toolRestrictions.allowedCollections];
    log.info(`[Search] Using agent-allowed collections: ${collectionsToSearch.join(', ')}`);
  } else if (agentConfig.toolRestrictions?.defaultCollection) {
    const dc = agentConfig.toolRestrictions.defaultCollection;
    collectionsToSearch = [dc, ...getSupplementaryCollectionsForLocale(userLocale)];
  } else if (defaultNotebookCollectionIds && defaultNotebookCollectionIds.length > 0) {
    collectionsToSearch = defaultNotebookCollectionIds;
    log.info(`[Search] Using default notebook collections: ${collectionsToSearch.join(', ')}`);
  } else {
    collectionsToSearch = getDefaultCollectionsForLocale(userLocale);
    log.info(`[Search] Using locale-based collections: ${collectionsToSearch.join(', ')}`);
  }
  const uniqueCollections = [...new Set(collectionsToSearch)];
  const queries = subQueries?.length ? subQueries : [query];

  // Strip landesverband/region from filters for collection-scoped searches
  // (the collection's defaultFilter already handles this)
  const searchFilters = filters || undefined;

  const collectedErrors: { source: string; message: string }[] = [];
  const searchPromises = uniqueCollections.flatMap((collection) =>
    queries.map((sq) => {
      const params: Parameters<typeof executeDirectSearch>[0] = {
        query: sq,
        collection,
        limit: 3,
      };
      if (searchFilters != null) {
        params.filters = searchFilters;
      }
      return executeDirectSearch(params).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        log.warn(`[Search] Collection ${collection} failed for query "${sq}": ${msg}`);
        collectedErrors.push({ source: `documents:${collection}`, message: msg });
        return null;
      });
    })
  );

  const searchResults = await Promise.all(searchPromises);

  const allResults: SearchResult[] = [];
  const seenUrls = new Set<string>();

  for (const searchResult of searchResults) {
    if (!searchResult?.results) continue;
    for (const r of searchResult.results) {
      if (r.url && seenUrls.has(r.url)) continue;
      if (r.url) seenUrls.add(r.url);

      allResults.push({
        source: `gruenerator:${searchResult.collection}`,
        title: deriveCitationTitle(r.source, r.url, searchResult.collection),
        content: r.excerpt || '',
        url: r.url || undefined,
        relevance: r.relevance === 'Sehr hoch' ? 0.9 : r.relevance === 'Hoch' ? 0.7 : 0.5,
        contentType: r.contentType || undefined,
        documentId: r.documentId,
        chunkIndex: r.chunkIndex,
        similarityScore: r.score,
        collectionId: r.collectionId,
      });
    }
  }

  allResults.sort((a, b) => (b.relevance || 0) - (a.relevance || 0));
  // Only surface errors when the source produced zero usable results.
  // Partial failures (some collections OK, some failed) are already logged as warns.
  const errors = allResults.length === 0 ? collectedErrors : [];
  return {
    results: allResults.slice(0, 8),
    searchedCollections: uniqueCollections,
    errors,
  };
}

/**
 * Execute web search with query expansion and crawling (extracted from case 'web').
 */
export interface WebSearchParallelResult {
  results: SearchResult[];
  errors: { source: string; message: string }[];
}

export async function executeWebSearchParallel(
  query: string,
  aiWorkerPool: AIWorkerPool
): Promise<WebSearchParallelResult> {
  const collectedErrors: { source: string; message: string }[] = [];
  let allWebQueries = [query];
  try {
    const expanded = await expandQuery(query, aiWorkerPool);
    if (expanded.alternatives.length > 0) {
      allWebQueries = [query, ...expanded.alternatives];
      log.info(`[Search] Expanded web query into ${allWebQueries.length} variants`);
    }
  } catch (err: unknown) {
    log.warn(
      `[Search] Query expansion failed, using original: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const webPromises = allWebQueries.map((q) =>
    executeDirectWebSearch({
      query: q,
      searchType: 'general',
      maxResults: 5,
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn(`[Search] Web search failed for variant "${q}": ${msg}`);
      collectedErrors.push({ source: 'web', message: msg });
      return null;
    })
  );
  const webResults = await Promise.all(webPromises);

  const seenWebUrls = new Set<string>();
  const allWebResults: SearchResult[] = [];

  for (const webResult of webResults) {
    if (!webResult?.results) continue;
    for (const r of webResult.results) {
      if (r.url && seenWebUrls.has(r.url)) continue;
      if (r.url) seenWebUrls.add(r.url);
      allWebResults.push({
        source: 'web',
        title: r.title,
        content: r.snippet || '',
        url: r.url,
        relevance: 1 - (r.rank - 1) * 0.15,
      });
    }
  }

  allWebResults.sort((a, b) => (b.relevance || 0) - (a.relevance || 0));
  // Only surface when zero usable results — partial variant failures are normal.
  const errors = allWebResults.length === 0 ? collectedErrors : [];
  return { results: allWebResults.slice(0, 8), errors };
}

/**
 * Normalize relevance scores across source types to a comparable [0, 1] scale.
 *
 * Documents: uses raw similarityScore (from Qdrant hybrid search) when available,
 * avoiding the lossy text-label mapping (0.5/0.7/0.9).
 * Web: compresses rank-decay scores with a configurable ceiling so web results
 * don't dominate over high-quality docs before the cross-encoder runs.
 */
export function normalizeScore(r: SearchResult): number {
  const { webScoreCeiling } = vectorConfig.get('rerank');

  if (r.similarityScore != null && r.source.startsWith(SOURCE_PREFIX.GRUENERATOR)) {
    return Math.min(1.0, r.similarityScore * 1.05);
  }

  if (r.source.startsWith(SOURCE_PREFIX.DOCUMENT)) {
    return r.relevance ?? DEFAULT_RELEVANCE;
  }

  if (r.source === SOURCE_PREFIX.WEB) {
    const raw = r.relevance ?? DEFAULT_RELEVANCE;
    return Math.min(webScoreCeiling, raw * webScoreCeiling);
  }

  return r.relevance ?? DEFAULT_RELEVANCE;
}

/**
 * Merge results from multiple search sources, deduplicating by URL.
 * Normalizes scores across source types before sorting so the cross-encoder
 * receives a fair set of candidates. Over-fetches (default 16) to give the
 * reranker more candidates — inspired by SurfSense's 2x retrieval pattern.
 */
export function mergeSearchResults(...resultSets: SearchResult[][]): SearchResult[] {
  const { mergeOverfetch } = vectorConfig.get('rerank');
  const seenUrls = new Set<string>();
  const merged: SearchResult[] = [];

  for (const results of resultSets) {
    for (const r of results) {
      if (r.url && seenUrls.has(r.url)) continue;
      if (r.url) seenUrls.add(r.url);
      merged.push({ ...r, relevance: normalizeScore(r) });
    }
  }

  merged.sort((a, b) => (b.relevance || 0) - (a.relevance || 0));
  return merged.slice(0, mergeOverfetch);
}

/**
 * Execute per-source fan-out for multi-document chat.
 *
 * Each retrievable DocumentSource gets its own scoped retrieval call so the
 * top-K budget is split evenly instead of one source dominating the merged
 * pool. Results are tagged with `documentSourceId` for downstream grouping
 * (rerank, respond, citations) and returned keyed by source id.
 *
 * Per-source budget is `max(3, floor(12 / N))` — enough headroom for rerank
 * to pick decent chunks per doc without bloating the prompt.
 */
export interface MultiDocFanoutResult {
  perSourceResults: Record<string, SearchResult[]>;
  searchedCollections: string[];
  errors: { source: string; message: string }[];
}

export async function executeMultiDocFanout(
  query: string,
  sources: DocumentSource[],
  agentConfig: AgentConfig
): Promise<MultiDocFanoutResult> {
  const perSourceLimit = Math.max(3, Math.floor(12 / sources.length));
  const errors: { source: string; message: string }[] = [];
  const collections = new Set<string>();

  const documentSearchService = (
    await import('../../../../services/document-services/DocumentSearchService/index.js')
  ).getQdrantDocumentService();

  const sourcePromises = sources.map(async (src): Promise<[string, SearchResult[]]> => {
    try {
      if (src.kind === 'document' || src.kind === 'document_chat' || src.kind === 'doc_mention') {
        const sourcePrefix =
          src.kind === 'document_chat'
            ? SOURCE_PREFIX.DOCUMENT_CHAT
            : src.kind === 'doc_mention'
              ? `${SOURCE_PREFIX.DOCUMENT}:`
              : `${SOURCE_PREFIX.DOCUMENT}:`;
        const response = await documentSearchService.search({
          query,
          userId: agentConfig.userId,
          options: {
            limit: perSourceLimit,
            mode: 'hybrid',
            threshold: 0.15,
          },
          filters: {
            documentIds: [src.id],
          },
        });
        collections.add(`${src.kind}:${src.id.slice(0, 8)}`);
        const results: SearchResult[] = (response.results || []).map((r) => ({
          source: `${sourcePrefix}${r.document_id || src.id}`,
          title: r.title || src.label,
          content: r.relevant_content || '',
          url: r.source_url || undefined,
          relevance: r.similarity_score ?? 0.5,
          documentSourceId: src.id,
        }));
        return [src.id, results];
      }

      if (src.kind === 'wolke') {
        collections.add(`wolke:${src.wolke?.shareLinkId.slice(0, 8) ?? '?'}`);
        if (!agentConfig.userId) {
          log.warn(`[Search] Skipping wolke source ${src.id}: no userId on agentConfig`);
          return [src.id, []];
        }
        const results = await retrieveWolkeFile(src, perSourceLimit, agentConfig.userId);
        return [src.id, results];
      }

      if (src.kind === 'connect') {
        collections.add(`connect:${src.connect?.provider ?? '?'}`);
        if (!agentConfig.userId) {
          log.warn(`[Search] Skipping connect source ${src.id}: no userId on agentConfig`);
          return [src.id, []];
        }
        const results = await retrieveConnectFile(src, perSourceLimit, agentConfig.userId);
        return [src.id, results];
      }

      if (src.kind === 'notebook' && src.collectionIds && src.collectionIds.length > 0) {
        const collectionPromises = src.collectionIds.map((collection) => {
          collections.add(collection);
          return executeDirectSearch({
            query,
            collection,
            limit: perSourceLimit,
          }).catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err);
            errors.push({ source: `notebook:${src.id}:${collection}`, message: msg });
            return null;
          });
        });
        const responses = await Promise.all(collectionPromises);
        const results: SearchResult[] = [];
        for (const response of responses) {
          if (!response?.results) continue;
          for (const r of response.results) {
            results.push({
              source: `${SOURCE_PREFIX.GRUENERATOR}${response.collection}`,
              title: deriveCitationTitle(r.source, r.url, response.collection),
              content: r.excerpt || '',
              url: r.url || undefined,
              relevance: r.relevance === 'Sehr hoch' ? 0.9 : r.relevance === 'Hoch' ? 0.7 : 0.5,
              contentType: r.contentType || undefined,
              documentId: r.documentId,
              chunkIndex: r.chunkIndex,
              similarityScore: r.score,
              collectionId: r.collectionId,
              documentSourceId: src.id,
            });
          }
        }
        results.sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0));
        return [src.id, results.slice(0, perSourceLimit * 2)];
      }

      return [src.id, []];
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn(`[Search] Multi-doc source ${src.kind}:${src.id} failed: ${msg}`);
      errors.push({ source: `${src.kind}:${src.id}`, message: msg });
      return [src.id, []];
    }
  });

  const entries = await Promise.all(sourcePromises);
  const perSourceResults: Record<string, SearchResult[]> = {};
  for (const [id, results] of entries) {
    perSourceResults[id] = results;
  }

  return {
    perSourceResults,
    searchedCollections: [...collections],
    errors,
  };
}

/**
 * Search node implementation.
 * Routes to the appropriate search function based on intent.
 * Supports parallel multi-source search when searchSources has multiple entries.
 */
export async function searchNode(state: ChatGraphState): Promise<Partial<ChatGraphState>> {
  const startTime = Date.now();
  const { intent, searchQuery, agentConfig } = state;

  const detectedFilters = state.detectedFilters || null;
  if (detectedFilters) {
    log.info(`[Search] Applying metadata filters: ${JSON.stringify(detectedFilters)}`);
  }

  const displayQuery = searchQuery || state.researchBrief || '(no query)';
  log.info(
    `[Search] Executing ${intent} search: "${displayQuery.slice(0, 50)}..." (locale=${state.userLocale})`
  );

  // Cap search queries to prevent multi-KB content from hitting embedding APIs
  const MAX_SEARCH_QUERY_LENGTH = 500;
  const truncateQuery = (q: string): string => {
    if (q.length <= MAX_SEARCH_QUERY_LENGTH) return q;
    const truncated = q.slice(0, MAX_SEARCH_QUERY_LENGTH);
    const lastSpace = truncated.lastIndexOf(' ');
    return lastSpace > MAX_SEARCH_QUERY_LENGTH * 0.8 ? truncated.slice(0, lastSpace) : truncated;
  };

  try {
    let results: SearchResult[] = [];
    let citations: Citation[] = [];
    let searchedCollections: string[] = [];
    let researchMeta: ResearchToolResult | null = null;
    let examplesResult: ExamplesToolResult | null = null;

    const searchSources = state.searchSources || [];
    const documentSources = state.documentSources || [];
    const retrievableDocSources = documentSources.filter(
      (s) =>
        s.kind === 'document' ||
        s.kind === 'document_chat' ||
        s.kind === 'doc_mention' ||
        s.kind === 'notebook' ||
        s.kind === 'wolke' ||
        s.kind === 'connect'
    );
    const hasWolke = retrievableDocSources.some((s) => s.kind === 'wolke');
    const hasConnect = retrievableDocSources.some((s) => s.kind === 'connect');

    // Multi-document fan-out: when the user references ≥2 retrievable doc sources,
    // run a doc-scoped retrieval per source so each gets its own evidence budget.
    // Prevents one denser/better-embedded doc from starving the others at rerank time.
    // Wolke sources always fan out (single or multiple) because they have no single-source
    // retrieval path in the `case 'search'` block — they're only fetched via retrieveWolkeFile.
    // Connect (Nango) sources behave identically — fetched only via retrieveConnectFile.
    if (retrievableDocSources.length >= 2 || hasWolke || hasConnect) {
      const query = truncateQuery(searchQuery || '');
      log.info(
        `[Search] Multi-doc fan-out across ${retrievableDocSources.length} sources: ${retrievableDocSources.map((s) => `${s.kind}:${s.id.slice(0, 8)}`).join(', ')}`
      );

      const fanoutResult = await executeMultiDocFanout(query, retrievableDocSources, agentConfig);

      const aggregatedErrors = fanoutResult.errors;
      const flatResults = Object.values(fanoutResult.perSourceResults).flat();
      flatResults.sort((a, b) => (b.relevance || 0) - (a.relevance || 0));
      const citationsBuilt = buildCitations(flatResults);

      log.info(
        `[Search] Multi-doc complete: ${flatResults.length} total results across ${Object.keys(fanoutResult.perSourceResults).length} sources, ${aggregatedErrors.length} errors in ${Date.now() - startTime}ms`
      );

      return {
        searchResults: flatResults,
        perSourceResults: fanoutResult.perSourceResults,
        citations: citationsBuilt,
        searchCount: 1,
        searchTimeMs: Date.now() - startTime,
        searchedCollections: fanoutResult.searchedCollections,
        ...(aggregatedErrors.length > 0 && { searchErrors: aggregatedErrors }),
      };
    }

    // Parallel multi-source search when classifier requests multiple backends
    if (searchSources.length > 1) {
      const query = truncateQuery(searchQuery || '');
      log.info(`[Search] Multi-source parallel search: ${searchSources.join(' + ')}`);

      type SourceResult = {
        results: SearchResult[];
        collections: string[];
        errors: { source: string; message: string }[];
      };
      const sourcePromises: Promise<SourceResult>[] = [];

      if (searchSources.includes('documents')) {
        sourcePromises.push(
          executeDocumentSearchParallel(
            query,
            state.subQueries || null,
            state.notebookCollectionIds || [],
            agentConfig,
            detectedFilters,
            state.userLocale,
            state.defaultNotebookCollectionIds
          )
            .then((r) => ({
              results: r.results,
              collections: r.searchedCollections,
              errors: r.errors,
            }))
            .catch((err) => {
              const msg = err instanceof Error ? err.message : String(err);
              log.error(`[Search] Document search failed in multi-source: ${msg}`);
              return {
                results: [],
                collections: [],
                errors: [{ source: 'documents', message: msg }],
              };
            })
        );
      }

      if (searchSources.includes('web')) {
        sourcePromises.push(
          executeWebSearchParallel(query, state.aiWorkerPool)
            .then((r) => ({ results: r.results, collections: ['web'], errors: r.errors }))
            .catch((err) => {
              const msg = err instanceof Error ? err.message : String(err);
              log.error(`[Search] Web search failed in multi-source: ${msg}`);
              return {
                results: [],
                collections: [],
                errors: [{ source: 'web', message: msg }],
              };
            })
        );
      }

      if (searchSources.includes('examples')) {
        const country =
          state.agentConfig.toolRestrictions?.examplesCountry ||
          (state.userLocale === 'de-AT' ? 'AT' : undefined);
        const examplesParams: Parameters<typeof executeDirectExamplesSearch>[0] = {
          query,
        };
        if (country != null) {
          examplesParams.country = country;
        }
        sourcePromises.push(
          executeDirectExamplesSearch(examplesParams)
            .then((r) => ({
              results: (r.examples || []).map((e) => ({
                source: 'examples' as const,
                title: `${e.platform} Beispiel${e.author ? ` von ${e.author}` : ''}`,
                content: e.content || '',
                relevance: 0.8,
              })),
              collections: ['examples'],
              errors: [] as { source: string; message: string }[],
            }))
            .catch((err: unknown) => {
              const msg = err instanceof Error ? err.message : String(err);
              log.error(`[Search] Examples search failed in multi-source: ${msg}`);
              return {
                results: [],
                collections: [],
                errors: [{ source: 'examples', message: msg }],
              };
            })
        );
      }

      const sourceResults = await Promise.all(sourcePromises);
      const allResults = sourceResults.map((s) => s.results);
      searchedCollections = sourceResults.flatMap((s) => s.collections);
      const aggregatedErrors = sourceResults.flatMap((s) => s.errors);

      results = mergeSearchResults(...allResults);

      // Crawl top web results for full content
      const webResults = results.filter((r) => r.source === 'web' && r.url);
      if (webResults.length > 0) {
        try {
          const crawled = await selectAndCrawlTopUrls(webResults as CrawlableResult[], query, {
            maxUrls: 2,
            timeout: 3000,
          });
          const crawledMap = new Map(
            crawled.filter((r) => r.crawled && r.url).map((r) => [r.url, r])
          );
          results = results.map((r) => {
            const c = r.url ? crawledMap.get(r.url) : undefined;
            return c ? { ...r, content: c.fullContent || r.content } : r;
          });
          const crawledCount = crawled.filter((r) => r.crawled).length;
          if (crawledCount > 0) {
            log.info(`[Search] Crawled ${crawledCount} web results for full content`);
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          log.warn(`[Search] Crawling failed in multi-source: ${msg}`);
          aggregatedErrors.push({ source: 'crawl', message: msg });
        }
      }

      citations = buildCitations(results);

      const docCount = results.filter((r) => r.source !== 'web').length;
      const webCount = results.filter((r) => r.source === 'web').length;
      log.info(
        `[Search] Multi-source complete: ${results.length} results (${docCount} docs, ${webCount} web), ${aggregatedErrors.length} errors in ${Date.now() - startTime}ms`
      );

      return {
        searchResults: results,
        citations,
        searchCount: 1,
        searchTimeMs: Date.now() - startTime,
        searchedCollections,
        ...(aggregatedErrors.length > 0 && { searchErrors: aggregatedErrors }),
      };
    }

    // Single-source mode: existing switch logic (backward compatible).
    // 'compare' degrades to plain search when only one (or zero) doc source
    // is present — the multi-doc fan-out above is its real path.
    const effectiveIntent = intent === 'compare' ? 'search' : intent;
    switch (effectiveIntent) {
      case 'research': {
        // Dynamic research depth based on query complexity
        const complexity = state.complexity || 'moderate';
        const depthConfig = {
          simple: { depth: 'quick' as const, maxSources: 4 },
          moderate: { depth: 'quick' as const, maxSources: 6 },
          complex: { depth: 'thorough' as const, maxSources: 10 },
        };
        const { depth, maxSources } = depthConfig[complexity];

        // Pass the user's actual short query to the search planner.
        // The brief is for orienting the synthesis LLM, not for SearXNG —
        // a 460-char paragraph as a search string returns near-random hits.
        const question = searchQuery || state.researchBrief || '';
        log.info(
          `[Search] Research depth: ${depth}, maxSources: ${maxSources} (complexity: ${complexity}, brief: ${!!state.researchBrief})`
        );

        const researchResult = await executeResearch({
          question,
          brief: state.researchBrief,
          depth,
          maxSources,
          complexity,
          userLocale: state.userLocale,
          aiWorkerPool: state.aiWorkerPool,
          ...(state.onResearchProgress && { onProgress: state.onResearchProgress }),
        });

        // Convert research citations to SearchResult format
        results =
          researchResult.citations?.map((c, i) => ({
            source: 'research',
            title: c.title,
            content: c.snippet || '',
            url: c.url,
            relevance: 1 - i * 0.1,
          })) || [];

        // Build enriched citations from results
        citations = buildCitations(results);

        // Capture full metadata for the persisted tool-call payload.
        // The synthesized `answer` is consumed directly by respondNode via
        // `state.researchMeta` (wrapper-mode prompt), so we no longer
        // need to unshift it into `results` as a fake `research_synthesis`
        // chunk — that workaround caused drift when small response models
        // treated it as one source among many and contradicted the artifact.
        researchMeta = {
          answer: researchResult.answer,
          citations,
          confidence: researchResult.confidence,
          searchSteps: researchResult.searchSteps,
          followUpQuestions: researchResult.followUpQuestions,
        };
        log.info(
          `[Search] researchMeta captured (answer_len=${researchResult.answer?.length ?? 0}, confidence=${researchResult.confidence}, citations=${citations.length}, follow_ups=${researchResult.followUpQuestions.length})`
        );
        break;
      }

      case 'search': {
        // Document chat: search within multi-selected user documents
        if (state.documentChatIds && state.documentChatIds.length > 0) {
          log.info(
            `[Search] Using document-chat search: ${state.documentChatIds.length} doc(s), higher limits`
          );
          try {
            const documentSearchService = (
              await import('../../../../services/document-services/DocumentSearchService/index.js')
            ).getQdrantDocumentService();
            const response = await documentSearchService.search({
              query: searchQuery || '',
              userId: agentConfig.userId,
              options: {
                limit: 12,
                mode: 'hybrid',
                threshold: 0.15,
              },
              filters: {
                documentIds: state.documentChatIds,
              },
            });

            for (const r of response.results || []) {
              results.push({
                source: `documentchat:${r.document_id || 'unknown'}`,
                title: r.title || 'Dokument',
                content: r.relevant_content || '',
                url: r.source_url || undefined,
                relevance: r.similarity_score ?? 0.5,
              });
            }
            searchedCollections.push('documentchat');
          } catch (err: unknown) {
            log.warn(
              `[Search] Document-chat search failed: ${err instanceof Error ? err.message : String(err)}`
            );
          }
          break;
        }

        // Union of @datei picks and @user-notebook resolved doc IDs. Both reach
        // the same Qdrant filter — a personal notebook is effectively a saved
        // set of @datei picks.
        const explicitDocIds = state.documentIds ?? [];
        const userNotebookDocIds = state.notebookDocumentIds ?? [];
        const scopeDocIds = [...new Set([...explicitDocIds, ...userNotebookDocIds])];

        if (scopeDocIds.length > 0) {
          const fromUserNotebook = userNotebookDocIds.length > 0;
          log.info(
            `[Search] Using document-scoped search: ${scopeDocIds.length} doc(s)${
              fromUserNotebook ? ` (incl. ${userNotebookDocIds.length} from user notebook)` : ''
            }`
          );
          try {
            const documentSearchService = (
              await import('../../../../services/document-services/DocumentSearchService/index.js')
            ).getQdrantDocumentService();
            const response = await documentSearchService.search({
              query: searchQuery || '',
              userId: agentConfig.userId,
              options: {
                limit: 8,
                mode: 'hybrid',
                threshold: 0.2,
              },
              filters: {
                documentIds: scopeDocIds,
              },
            });

            for (const r of response.results || []) {
              results.push({
                source: `document:${r.document_id || 'unknown'}`,
                title: r.title || 'Dokument',
                content: r.relevant_content || '',
                url: r.source_url || undefined,
                relevance: r.similarity_score ?? 0.5,
              });
            }
            searchedCollections.push(fromUserNotebook ? 'user-notebook' : 'user-documents');
          } catch (err: unknown) {
            log.warn(
              `[Search] Document-scoped search failed: ${err instanceof Error ? err.message : String(err)}`
            );
          }
          break;
        }

        // Collection selection priority chain
        let collectionsToSearch: string[];
        if (state.notebookCollectionIds && state.notebookCollectionIds.length > 0) {
          collectionsToSearch = state.notebookCollectionIds;
          log.info(`[Search] Using notebook-scoped collections: ${collectionsToSearch.join(', ')}`);
        } else if (agentConfig.toolRestrictions?.allowedCollections?.length) {
          collectionsToSearch = [...agentConfig.toolRestrictions.allowedCollections];
          log.info(`[Search] Using agent-allowed collections: ${collectionsToSearch.join(', ')}`);
        } else if (agentConfig.toolRestrictions?.defaultCollection) {
          const dc = agentConfig.toolRestrictions.defaultCollection;
          collectionsToSearch = [dc, ...getSupplementaryCollectionsForLocale(state.userLocale)];
        } else if (
          state.defaultNotebookCollectionIds &&
          state.defaultNotebookCollectionIds.length > 0
        ) {
          collectionsToSearch = state.defaultNotebookCollectionIds;
          log.info(
            `[Search] Using default notebook collections: ${collectionsToSearch.join(', ')}`
          );
        } else {
          collectionsToSearch = getDefaultCollectionsForLocale(state.userLocale);
          log.info(`[Search] Using locale-based collections: ${collectionsToSearch.join(', ')}`);
        }
        // Deduplicate in case of overlap
        const uniqueCollections = [...new Set(collectionsToSearch)];
        const isNotebookScoped =
          state.notebookCollectionIds && state.notebookCollectionIds.length > 0;

        const query = truncateQuery(searchQuery || '');

        // Expand queries for broader document coverage (short timeout to avoid blocking)
        let expandedQueries: string[] = [];
        if (!isNotebookScoped) {
          try {
            const expanded = await expandQuery(query, state.aiWorkerPool);
            if (expanded.alternatives.length > 0) {
              expandedQueries = expanded.alternatives;
              log.info(`[Search] Document query expanded: +${expandedQueries.length} variants`);
            }
          } catch {
            // Expansion is best-effort for document search
          }
        }

        // Search all sub-queries (if decomposed) + expanded variants across all collections
        // Notebook-scoped searches get deeper recall (10 vs 3 per collection)
        const baseQueries = state.subQueries?.length ? state.subQueries : [query];
        const subQueries = [...baseQueries, ...expandedQueries];
        const perCollectionLimit = isNotebookScoped ? 10 : 3;

        const searchPromises = uniqueCollections.flatMap((collection) =>
          subQueries.map((sq) => {
            const params: Parameters<typeof executeDirectSearch>[0] = {
              query: sq,
              collection,
              limit: perCollectionLimit,
            };
            if (detectedFilters != null) {
              params.filters = detectedFilters;
            }
            return executeDirectSearch(params).catch((err: unknown) => {
              log.warn(
                `[Search] Collection ${collection} failed for query "${sq}": ${err instanceof Error ? err.message : String(err)}`
              );
              return null;
            });
          })
        );

        const searchResults = await Promise.all(searchPromises);

        // Flatten and normalize results from all collections
        const allResults: SearchResult[] = [];
        const seenUrls = new Set<string>();

        for (const searchResult of searchResults) {
          if (!searchResult?.results) continue;
          for (const r of searchResult.results) {
            // Deduplicate by URL
            if (r.url && seenUrls.has(r.url)) continue;
            if (r.url) seenUrls.add(r.url);

            allResults.push({
              source: `gruenerator:${searchResult.collection}`,
              title: deriveCitationTitle(r.source, r.url, searchResult.collection),
              content: r.excerpt || '',
              url: r.url || undefined,
              relevance: r.relevance === 'Sehr hoch' ? 0.9 : r.relevance === 'Hoch' ? 0.7 : 0.5,
              contentType: r.contentType || undefined,
              documentId: r.documentId,
              chunkIndex: r.chunkIndex,
              similarityScore: r.score,
              collectionId: r.collectionId,
            });
          }
        }

        // Sort by relevance and take top results
        // Notebook-scoped searches keep more candidates for reranking
        allResults.sort((a, b) => (b.relevance || 0) - (a.relevance || 0));
        const resultsCap = isNotebookScoped ? 20 : 8;
        results = allResults.slice(0, resultsCap);
        citations = buildCitations(results);

        // Track which collections were searched for observability
        searchedCollections = uniqueCollections;
        break;
      }

      // DISABLED: Person search not production ready (only searches 80 cached MPs)
      // case 'person': {
      //   // Person search (Green politicians, MdB)
      //   const personResult = await executeDirectPersonSearch({
      //     query: searchQuery || '',
      //   });
      //
      //   if (personResult.isPersonQuery && personResult.person) {
      //     // Add person info as first result
      //     results.push({
      //       source: 'person_info',
      //       title: personResult.person.name,
      //       content: [
      //         personResult.person.fraktion && `Fraktion: ${personResult.person.fraktion}`,
      //         personResult.person.wahlkreis && `Wahlkreis: ${personResult.person.wahlkreis}`,
      //         personResult.person.biografie,
      //       ]
      //         .filter(Boolean)
      //         .join('\n'),
      //       relevance: 1.0,
      //     });
      //   }
      //
      //   // Add related content
      //   results.push(
      //     ...personResult.results?.map((r: any) => ({
      //       source: 'person_content',
      //       title: r.source || r.title,
      //       content: r.excerpt || '',
      //       url: r.url || undefined,
      //       relevance: r.relevance === 'Sehr hoch' ? 0.9 : r.relevance === 'Hoch' ? 0.7 : 0.5,
      //     })) || []
      //   );
      //
      //   citations = buildCitations(results);
      //   break;
      // }

      case 'web': {
        // Web search with query expansion and content crawling
        const query = truncateQuery(searchQuery || '');

        // A2: Expand query for broader coverage (web and research intents)
        let allWebQueries = [query];
        try {
          const expanded = await expandQuery(query, state.aiWorkerPool);
          if (expanded.alternatives.length > 0) {
            allWebQueries = [query, ...expanded.alternatives];
            log.info(`[Search] Expanded web query into ${allWebQueries.length} variants`);
          }
        } catch (err: unknown) {
          log.warn(
            `[Search] Query expansion failed, using original: ${err instanceof Error ? err.message : String(err)}`
          );
        }

        // Search all query variants in parallel
        const webPromises = allWebQueries.map((q) =>
          executeDirectWebSearch({
            query: q,
            searchType: 'general',
            maxResults: 5,
          }).catch((err: unknown) => {
            log.warn(
              `[Search] Web search failed for variant "${q}": ${err instanceof Error ? err.message : String(err)}`
            );
            return null;
          })
        );
        const webResults = await Promise.all(webPromises);

        // Merge and deduplicate by URL
        const seenWebUrls = new Set<string>();
        const allWebResults: SearchResult[] = [];

        for (const webResult of webResults) {
          if (!webResult?.results) continue;
          for (const r of webResult.results) {
            if (r.url && seenWebUrls.has(r.url)) continue;
            if (r.url) seenWebUrls.add(r.url);
            allWebResults.push({
              source: 'web',
              title: r.title,
              content: r.snippet || '',
              url: r.url,
              relevance: 1 - (r.rank - 1) * 0.15,
            });
          }
        }

        // Sort by relevance and limit
        allWebResults.sort((a, b) => (b.relevance || 0) - (a.relevance || 0));
        results = allWebResults.slice(0, 8);

        // A1: Crawl top 2 web results for full content
        try {
          const crawled = await selectAndCrawlTopUrls(
            results.filter((r) => r.url) as CrawlableResult[],
            query,
            {
              maxUrls: 2,
              timeout: 3000,
            }
          );
          results = crawled.map((r) => ({
            ...r,
            content: r.fullContent || r.content || '',
            source: (r.source as string) || 'web',
            title: r.title || '',
          }));
          const crawledCount = crawled.filter((r) => r.crawled).length;
          if (crawledCount > 0) {
            log.info(`[Search] Crawled ${crawledCount} web results for full content`);
          }
        } catch (err: unknown) {
          log.warn(
            `[Search] Crawling failed, using snippets: ${err instanceof Error ? err.message : String(err)}`
          );
        }

        citations = buildCitations(results);
        break;
      }

      case 'pressemitteilung_examples':
      case 'examples': {
        // Build kinds from intent + secondaryIntent. The dual SearchIntent
        // surface stays so postResponseService picks the right tool name (and
        // therefore the right UI card); the *data fetch* is unified.
        const kinds: ExampleKind[] = [];
        if (intent === 'pressemitteilung_examples') kinds.push('press');
        if (intent === 'examples' || state.secondaryIntent === 'examples') kinds.push('social');

        const country =
          agentConfig.toolRestrictions?.examplesCountry ||
          (state.userLocale === 'de-AT' ? 'AT' : undefined);
        // LV scope feeds press-examples filtering. Prefer the explicit
        // `toolRestrictions.examplesLvScope`; fall back to the per-agent
        // `defaultFilter.landesverband` (used by per-LV PR agents).
        const lvScope =
          agentConfig.toolRestrictions?.examplesLvScope ?? agentConfig.defaultFilter?.landesverband;

        // Composer paths want full bodies: PM bodies are reconstructed from
        // chunks inside searchExamples, social bodies skip the 500-char cut.
        // Pass platform hint when set so social fetches filter to Insta/FB.
        // lvScope (per-LV PR agents) constrains press to one LV substrate;
        // social currently logs but does not filter (Apify follow-up).
        const unified = await searchExamples({
          query: searchQuery || '',
          kinds,
          ...(country && { country }),
          ...(lvScope !== undefined && { lvScope }),
          ...(state.platform && { platform: state.platform }),
          ...(agentConfig.toolRestrictions?.examplesCollection != null && {
            examplesCollection: agentConfig.toolRestrictions.examplesCollection,
          }),
          fullBody: true,
        });

        results = unified.all.map((e) => ({
          source: 'examples',
          title:
            e.kind === 'press'
              ? `Pressemitteilung${e.lv ? ` (${e.lv})` : ''}: ${e.title}`
              : e.title,
          content: e.body,
          relevance: e.relevance,
          ...(e.url && { url: e.url }),
        }));
        // Press items have URLs → citations; social posts don't.
        citations = (unified.byKind.press ?? []).length > 0 ? buildCitations(results) : [];

        // Stash the rich kind-segmented shape on state so postResponseService
        // can persist it under `result.examples` for the per-kind UI cards.
        examplesResult = {
          ...(unified.byKind.press && {
            press: unified.byKind.press.map((e) => ({
              id: e.id,
              title: e.title,
              body: e.body,
              lv: e.lv ?? '',
              ...(e.sourceId && { sourceId: e.sourceId }),
              ...(e.publishedAt && { publishedAt: e.publishedAt }),
              ...(e.url && { url: e.url }),
            })),
          }),
          ...(unified.byKind.social && {
            social: unified.byKind.social.map((e) => ({
              id: e.id,
              platform: e.platform ?? 'unknown',
              content: e.body,
              ...(e.author && { author: e.author }),
              ...(e.publishedAt && { date: e.publishedAt }),
            })),
          }),
        };
        break;
      }

      case 'image':
      case 'image_edit':
      case 'sharepic':
      case 'summary':
      case 'chart':
      case 'save_as_doc':
      case 'modify_doc':
      case 'modify_board':
      case 'share_doc':
      case 'edit_current_doc':
      case 'direct':
        // These intents are handled by other graph nodes; no search needed.
        break;

      default:
        // Should not reach here due to graph routing
        log.warn(`[Search] Unexpected intent: ${intent}`);
        break;
    }

    const searchTimeMs = Date.now() - startTime;
    log.info(`[Search] Complete: ${results.length} results in ${searchTimeMs}ms`);

    return {
      searchResults: results,
      citations: citations.length > 0 ? citations : buildCitations(results),
      searchCount: 1,
      searchTimeMs,
      researchMeta,
      examplesResult,
      ...(searchedCollections.length > 0 && { searchedCollections }),
    };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    log.error(`[Search] Error during ${intent} search:`, errMsg);

    return {
      searchResults: [],
      citations: [],
      searchCount: 1,
      searchTimeMs: Date.now() - startTime,
      error: `Search failed: ${errMsg}`,
      searchErrors: [{ source: 'search', message: errMsg }],
    };
  }
}
