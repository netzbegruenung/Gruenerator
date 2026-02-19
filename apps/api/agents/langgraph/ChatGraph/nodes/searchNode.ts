/**
 * Search Node
 *
 * Executes the appropriate search tool based on the classified intent.
 * Uses the direct search functions from the chat agents module.
 */

import {
  executeDirectSearch,
  // executeDirectPersonSearch, // DISABLED: Person search not production ready
  executeDirectExamplesSearch,
  executeDirectWebSearch,
  executeResearch,
} from '../../../../routes/chat/agents/directSearch.js';
import { selectAndCrawlTopUrls } from '../../../../services/search/CrawlingService.js';
import { expandQuery } from '../../../../services/search/QueryExpansionService.js';
import { createLogger } from '../../../../utils/logger.js';

import type { SubcategoryFilters } from '../../../../config/systemCollectionsConfig.js';
import type { AgentConfig } from '../../../../routes/chat/agents/types.js';
import type { ChatGraphState, SearchResult, SearchSource, Citation } from '../types.js';

const log = createLogger('ChatGraph:Search');

/**
 * Convert various search result formats to unified SearchResult structure.
 */
function normalizeResults(results: any[], source: string): SearchResult[] {
  return results.map((r: any, i: number) => ({
    source,
    title: r.title || r.name || r.source || 'Unknown',
    content: r.content || r.snippet || r.excerpt || r.text || '',
    url: r.url || r.source_url || undefined,
    relevance: r.relevance || r.score || r.similarity || 1 - i * 0.1,
  }));
}

/**
 * Human-readable labels for collection identifiers.
 */
export const COLLECTION_LABELS: Record<string, string> = {
  deutschland: 'Grundsatzprogramm',
  bundestagsfraktion: 'Bundestagsfraktion',
  'gruene-de': 'gruene.de',
  kommunalwiki: 'Kommunalwiki',
  oesterreich: 'Österreich',
  'gruene-at': 'Grüne Österreich',
  web: 'Web',
  research: 'Recherche',
  research_synthesis: 'Recherche',
  examples: 'Beispiele',
  hamburg: 'Hamburg',
  'schleswig-holstein': 'Schleswig-Holstein',
  thueringen: 'Thüringen',
  bayern: 'Bayern',
  'boell-stiftung': 'Böll-Stiftung',
};

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
 * Human-readable labels for document content types.
 */
const CONTENT_TYPE_LABELS: Record<string, string> = {
  presse: 'Pressemitteilung',
  pressemitteilung: 'Pressemitteilung',
  beschluss: 'Beschluss',
  antrag: 'Antrag',
  blog: 'Blogbeitrag',
  wahlprogramm: 'Wahlprogramm',
  position: 'Positionspapier',
  rede: 'Rede',
};

/**
 * Generic fallback titles that should be replaced with better alternatives.
 */
const GENERIC_TITLES = new Set(['Untitled', 'Unbekannte Quelle', 'Unknown', '']);

/**
 * Derive a meaningful citation title from available metadata.
 * Priority: real document title → URL-derived title → collection label.
 */
function deriveCitationTitle(
  source: string | undefined,
  url: string | undefined,
  collection: string
): string {
  // 1. Use real title if it's not a generic fallback or collection key
  if (source && !GENERIC_TITLES.has(source) && source !== collection) {
    return source;
  }

  // 2. Extract readable title from URL path
  if (url) {
    try {
      const urlObj = new URL(url);
      const pathSegments = urlObj.pathname
        .split('/')
        .filter((s) => s.length > 0 && !s.match(/^\d+$/));
      if (pathSegments.length > 0) {
        const lastSegment = pathSegments[pathSegments.length - 1]
          .replace(/\.[^.]+$/, '')
          .replace(/[-_]+/g, ' ')
          .trim();
        if (lastSegment.length > 2) {
          return lastSegment.charAt(0).toUpperCase() + lastSegment.slice(1);
        }
      }
    } catch {
      // URL parsing failed, fall through
    }
  }

  // 3. Fall back to human-readable collection label
  return COLLECTION_LABELS[collection] || collection;
}

/**
 * Extract domain from a URL, returning null on failure.
 */
function extractDomain(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

/**
 * Resolve a human-readable collection name from a source identifier.
 * Handles both plain names ("web") and prefixed ("gruenerator:bundestagsfraktion").
 */
function resolveCollectionName(source: string): string | undefined {
  const key = source.startsWith('gruenerator:') ? source.slice('gruenerator:'.length) : source;
  return COLLECTION_LABELS[key];
}

/**
 * Build citations from search results.
 * Enriched with provenance data for inline popovers and grouped source cards.
 */
export function buildCitations(results: SearchResult[]): Citation[] {
  return results
    .filter((r) => r.url)
    .slice(0, 8)
    .map((r, i) => ({
      id: i + 1,
      title: r.title,
      url: r.url || '',
      snippet: r.content.slice(0, 200),
      citedText: r.content.length > 200 ? r.content.slice(0, 500) : undefined,
      source: r.source,
      collectionName: resolveCollectionName(r.source),
      domain: extractDomain(r.url),
      relevance: r.relevance,
      contentType: r.contentType
        ? CONTENT_TYPE_LABELS[r.contentType.toLowerCase()] || r.contentType
        : undefined,
    }));
}

/**
 * Execute document search across collections (extracted from case 'search').
 * Searches all sub-queries across all specified collections in parallel.
 */
async function executeDocumentSearchParallel(
  query: string,
  subQueries: string[] | null,
  notebookCollectionIds: string[],
  agentConfig: AgentConfig,
  filters?: SubcategoryFilters | null,
  userLocale?: string,
  defaultNotebookCollectionIds?: string[]
): Promise<{ results: SearchResult[]; searchedCollections: string[] }> {
  let collectionsToSearch: string[];
  if (notebookCollectionIds && notebookCollectionIds.length > 0) {
    collectionsToSearch = notebookCollectionIds;
    log.info(`[Search] Using notebook-scoped collections: ${collectionsToSearch.join(', ')}`);
  } else if (agentConfig.toolRestrictions?.allowedCollections?.length) {
    collectionsToSearch = agentConfig.toolRestrictions.allowedCollections;
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

  const searchPromises = uniqueCollections.flatMap((collection) =>
    queries.map((sq) =>
      executeDirectSearch({ query: sq, collection, limit: 3, filters: searchFilters }).catch(
        (err: any) => {
          log.warn(`[Search] Collection ${collection} failed for query "${sq}": ${err.message}`);
          return null;
        }
      )
    )
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
      });
    }
  }

  allResults.sort((a, b) => (b.relevance || 0) - (a.relevance || 0));
  return { results: allResults.slice(0, 8), searchedCollections: uniqueCollections };
}

/**
 * Execute web search with query expansion and crawling (extracted from case 'web').
 */
async function executeWebSearchParallel(query: string, aiWorkerPool: any): Promise<SearchResult[]> {
  let allWebQueries = [query];
  try {
    const expanded = await expandQuery(query, aiWorkerPool);
    if (expanded.alternatives.length > 0) {
      allWebQueries = [query, ...expanded.alternatives];
      log.info(`[Search] Expanded web query into ${allWebQueries.length} variants`);
    }
  } catch (err: any) {
    log.warn(`[Search] Query expansion failed, using original: ${err.message}`);
  }

  const webPromises = allWebQueries.map((q) =>
    executeDirectWebSearch({
      query: q,
      searchType: 'general',
      maxResults: 5,
    }).catch((err: any) => {
      log.warn(`[Search] Web search failed for variant "${q}": ${err.message}`);
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
  return allWebResults.slice(0, 8);
}

/**
 * Merge results from multiple search sources, deduplicating by URL.
 * Returns top results sorted by relevance for the reranker.
 */
function mergeSearchResults(...resultSets: SearchResult[][]): SearchResult[] {
  const seenUrls = new Set<string>();
  const merged: SearchResult[] = [];

  for (const results of resultSets) {
    for (const r of results) {
      if (r.url && seenUrls.has(r.url)) continue;
      if (r.url) seenUrls.add(r.url);
      merged.push(r);
    }
  }

  merged.sort((a, b) => (b.relevance || 0) - (a.relevance || 0));
  return merged.slice(0, 12);
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

  log.info(
    `[Search] Executing ${intent} search: "${searchQuery?.slice(0, 50)}..." (locale=${state.userLocale})`
  );

  try {
    let results: SearchResult[] = [];
    let citations: Citation[] = [];
    let searchedCollections: string[] = [];

    const searchSources = state.searchSources || [];

    // Parallel multi-source search when classifier requests multiple backends
    if (searchSources.length > 1) {
      const query = searchQuery || '';
      log.info(`[Search] Multi-source parallel search: ${searchSources.join(' + ')}`);

      const sourcePromises: Promise<{ results: SearchResult[]; collections: string[] }>[] = [];

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
            .then((r) => ({ results: r.results, collections: r.searchedCollections }))
            .catch((err) => {
              log.warn(`[Search] Document search failed in multi-source: ${err.message}`);
              return { results: [], collections: [] };
            })
        );
      }

      if (searchSources.includes('web')) {
        sourcePromises.push(
          executeWebSearchParallel(query, state.aiWorkerPool)
            .then((r) => ({ results: r, collections: ['web'] }))
            .catch((err) => {
              log.warn(`[Search] Web search failed in multi-source: ${err.message}`);
              return { results: [], collections: [] };
            })
        );
      }

      const sourceResults = await Promise.all(sourcePromises);
      const allResults = sourceResults.map((s) => s.results);
      searchedCollections = sourceResults.flatMap((s) => s.collections);

      results = mergeSearchResults(...allResults);

      // Crawl top web results for full content
      const webResults = results.filter((r) => r.source === 'web');
      if (webResults.length > 0) {
        try {
          const crawled = await selectAndCrawlTopUrls(webResults, query, {
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
        } catch (err: any) {
          log.warn(`[Search] Crawling failed in multi-source: ${err.message}`);
        }
      }

      citations = buildCitations(results);

      const docCount = results.filter((r) => r.source !== 'web').length;
      const webCount = results.filter((r) => r.source === 'web').length;
      log.info(
        `[Search] Multi-source complete: ${results.length} results (${docCount} docs, ${webCount} web) in ${Date.now() - startTime}ms`
      );

      return {
        searchResults: results,
        citations,
        searchCount: 1,
        searchTimeMs: Date.now() - startTime,
        searchedCollections,
      };
    }

    // Single-source mode: existing switch logic (backward compatible)
    switch (intent) {
      case 'research': {
        // Dynamic research depth based on query complexity
        const complexity = state.complexity || 'moderate';
        const depthConfig = {
          simple: { depth: 'quick' as const, maxSources: 4 },
          moderate: { depth: 'quick' as const, maxSources: 6 },
          complex: { depth: 'thorough' as const, maxSources: 10 },
        };
        const { depth, maxSources } = depthConfig[complexity];

        // Use research brief (compressed intent) when available, fall back to raw query
        const question = state.researchBrief || searchQuery || '';
        log.info(
          `[Search] Research depth: ${depth}, maxSources: ${maxSources} (complexity: ${complexity}, brief: ${!!state.researchBrief})`
        );

        const researchResult = await executeResearch({
          question,
          depth,
          maxSources,
        });

        // Convert research citations to SearchResult format
        results =
          researchResult.citations?.map((c: any, i: number) => ({
            source: 'research',
            title: c.title,
            content: c.snippet || '',
            url: c.url,
            relevance: 1 - i * 0.1,
          })) || [];

        // Build enriched citations from results
        citations = buildCitations(results);

        // Include the synthesized answer as context
        if (researchResult.answer) {
          results.unshift({
            source: 'research_synthesis',
            title: 'Recherche-Zusammenfassung',
            content: researchResult.answer,
            relevance: 1.0,
          });
        }
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
              userId: (agentConfig as any).userId,
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
                source: `documentchat:${(r as any).document_id || 'unknown'}`,
                title: (r as any).title || 'Dokument',
                content: (r as any).chunk_text || '',
                url: (r as any).source_url || undefined,
                relevance: (r as any).score ?? 0.5,
              });
            }
            searchedCollections.push('documentchat');
          } catch (err: any) {
            log.warn(`[Search] Document-chat search failed: ${err.message}`);
          }
          break;
        }

        // If specific documents are referenced, use document-scoped search
        if (state.documentIds && state.documentIds.length > 0) {
          log.info(`[Search] Using document-scoped search: ${state.documentIds.length} doc(s)`);
          try {
            const documentSearchService = (
              await import('../../../../services/document-services/DocumentSearchService/index.js')
            ).getQdrantDocumentService();
            const response = await documentSearchService.search({
              query: searchQuery || '',
              userId: (agentConfig as any).userId,
              options: {
                limit: 8,
                mode: 'hybrid',
                threshold: 0.2,
              },
              filters: {
                documentIds: state.documentIds,
              },
            });

            for (const r of response.results || []) {
              results.push({
                source: `document:${(r as any).document_id || 'unknown'}`,
                title: (r as any).title || 'Dokument',
                content: (r as any).chunk_text || '',
                url: (r as any).source_url || undefined,
                relevance: (r as any).score ?? 0.5,
              });
            }
            searchedCollections.push('user-documents');
          } catch (err: any) {
            log.warn(`[Search] Document-scoped search failed: ${err.message}`);
          }
          break;
        }

        // Collection selection priority chain
        let collectionsToSearch: string[];
        if (state.notebookCollectionIds && state.notebookCollectionIds.length > 0) {
          collectionsToSearch = state.notebookCollectionIds;
          log.info(`[Search] Using notebook-scoped collections: ${collectionsToSearch.join(', ')}`);
        } else if (agentConfig.toolRestrictions?.allowedCollections?.length) {
          collectionsToSearch = agentConfig.toolRestrictions.allowedCollections;
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

        const query = searchQuery || '';

        // Search all sub-queries (if decomposed) across all collections
        const subQueries = state.subQueries?.length ? state.subQueries : [query];

        const searchPromises = uniqueCollections.flatMap((collection) =>
          subQueries.map((sq) =>
            executeDirectSearch({
              query: sq,
              collection,
              limit: 3,
              filters: detectedFilters || undefined,
            }).catch((err: any) => {
              log.warn(
                `[Search] Collection ${collection} failed for query "${sq}": ${err.message}`
              );
              return null;
            })
          )
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
            });
          }
        }

        // Sort by relevance and take top results
        allResults.sort((a, b) => (b.relevance || 0) - (a.relevance || 0));
        results = allResults.slice(0, 8);
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
        const query = searchQuery || '';

        // A2: Expand query for broader coverage (web and research intents)
        let allWebQueries = [query];
        try {
          const expanded = await expandQuery(query, state.aiWorkerPool);
          if (expanded.alternatives.length > 0) {
            allWebQueries = [query, ...expanded.alternatives];
            log.info(`[Search] Expanded web query into ${allWebQueries.length} variants`);
          }
        } catch (err: any) {
          log.warn(`[Search] Query expansion failed, using original: ${err.message}`);
        }

        // Search all query variants in parallel
        const webPromises = allWebQueries.map((q) =>
          executeDirectWebSearch({
            query: q,
            searchType: 'general',
            maxResults: 5,
          }).catch((err: any) => {
            log.warn(`[Search] Web search failed for variant "${q}": ${err.message}`);
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
          const crawled = await selectAndCrawlTopUrls(results, query, {
            maxUrls: 2,
            timeout: 3000,
          });
          results = crawled.map((r) => ({
            ...r,
            content: r.fullContent || r.content,
          }));
          const crawledCount = crawled.filter((r) => r.crawled).length;
          if (crawledCount > 0) {
            log.info(`[Search] Crawled ${crawledCount} web results for full content`);
          }
        } catch (err: any) {
          log.warn(`[Search] Crawling failed, using snippets: ${err.message}`);
        }

        citations = buildCitations(results);
        break;
      }

      case 'examples': {
        // Social media examples search — derive country from locale when agent doesn't set it
        const country =
          agentConfig.toolRestrictions?.examplesCountry ||
          (state.userLocale === 'de-AT' ? 'AT' : undefined);
        const examplesResult = await executeDirectExamplesSearch({
          query: searchQuery || '',
          platform: undefined,
          country,
        });

        results =
          examplesResult.examples?.map((e: any) => ({
            source: 'examples',
            title: `${e.platform} Beispiel${e.author ? ` von ${e.author}` : ''}`,
            content: e.content || '',
            relevance: 0.8,
          })) || [];

        // Examples typically don't have URLs for citations
        citations = [];
        break;
      }

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
      ...(searchedCollections.length > 0 && { searchedCollections }),
    };
  } catch (error: any) {
    log.error(`[Search] Error during ${intent} search:`, error.message);

    return {
      searchResults: [],
      citations: [],
      searchCount: 1,
      searchTimeMs: Date.now() - startTime,
      error: `Search failed: ${error.message}`,
    };
  }
}
