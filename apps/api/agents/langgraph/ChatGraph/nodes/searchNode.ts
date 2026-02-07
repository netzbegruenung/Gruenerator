/**
 * Search Node
 *
 * Executes the appropriate search tool based on the classified intent.
 * Uses the direct search functions from the chat agents module.
 */

import type { ChatGraphState, SearchResult, Citation } from '../types.js';
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
 * Build citations from search results.
 */
function buildCitations(results: SearchResult[]): Citation[] {
  return results
    .filter((r) => r.url) // Only include results with URLs
    .slice(0, 8) // Limit to 8 citations
    .map((r, i) => ({
      id: i + 1,
      title: r.title,
      url: r.url || '',
      snippet: r.content.slice(0, 200),
    }));
}

/**
 * Search node implementation.
 * Routes to the appropriate search function based on intent.
 */
export async function searchNode(
  state: ChatGraphState
): Promise<Partial<ChatGraphState>> {
  const startTime = Date.now();
  const { intent, searchQuery, agentConfig } = state;

  log.info(`[Search] Executing ${intent} search: "${searchQuery?.slice(0, 50)}..."`);

  try {
    let results: SearchResult[] = [];
    let citations: Citation[] = [];
    let searchedCollections: string[] = [];

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
        log.info(`[Search] Research depth: ${depth}, maxSources: ${maxSources} (complexity: ${complexity})`);

        const researchResult = await executeResearch({
          question: searchQuery || '',
          depth,
          maxSources,
        });

        // Convert research citations to SearchResult format
        results = researchResult.citations?.map((c: any, i: number) => ({
          source: 'research',
          title: c.title,
          content: c.snippet || '',
          url: c.url,
          relevance: 1 - i * 0.1,
        })) || [];

        // Use research citations directly
        citations = researchResult.citations || [];

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
        // Cross-collection search: search multiple Qdrant collections in parallel
        const defaultCollection = agentConfig.toolRestrictions?.defaultCollection || 'deutschland';
        const collectionsToSearch = [
          defaultCollection,
          'bundestagsfraktion',
          'gruene-de',
          'kommunalwiki',
        ];
        // Deduplicate in case defaultCollection is already in the list
        const uniqueCollections = [...new Set(collectionsToSearch)];

        const query = searchQuery || '';

        // Search all sub-queries (if decomposed) across all collections
        const subQueries = state.subQueries?.length ? state.subQueries : [query];

        const searchPromises = uniqueCollections.flatMap((collection) =>
          subQueries.map((sq) =>
            executeDirectSearch({ query: sq, collection, limit: 3 })
              .catch((err: any) => {
                log.warn(`[Search] Collection ${collection} failed for query "${sq}": ${err.message}`);
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
              title: r.source || searchResult.collection,
              content: r.excerpt || '',
              url: r.url || undefined,
              relevance: r.relevance === 'Sehr hoch' ? 0.9 : r.relevance === 'Hoch' ? 0.7 : 0.5,
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
          const crawled = await selectAndCrawlTopUrls(results, query, { maxUrls: 2, timeout: 3000 });
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
        // Social media examples search
        const country = agentConfig.toolRestrictions?.examplesCountry;
        const examplesResult = await executeDirectExamplesSearch({
          query: searchQuery || '',
          platform: undefined,
          country,
        });

        results = examplesResult.examples?.map((e: any) => ({
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
