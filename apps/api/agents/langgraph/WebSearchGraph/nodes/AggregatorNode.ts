/**
 * Aggregator Node for WebSearchGraph
 * Deduplicates and ranks results from all sources
 */

import { createLogger } from '../../../../utils/logger.js';

import type { WebSearchState, SearchResult, CategorizedSources } from '../types.js';

const log = createLogger('AggregatorNode');

interface SourceEntry extends SearchResult {
  categories: string[];
  questions: string[];
  source_type: string;
  content_snippets: string | null;
}

/**
 * Aggregator Node: Deduplicate and rank results from all sources
 */
export async function aggregatorNode(state: WebSearchState): Promise<Partial<WebSearchState>> {
  log.debug('[WebSearchGraph] Aggregating results from all sources');

  try {
    const allSources: SourceEntry[] = [];
    const sourceMap = new Map<string, SourceEntry>(); // URL -> source object

    // Process web search results
    if (state.webResults) {
      state.webResults.forEach((searchResult, searchIndex) => {
        if (searchResult.success && searchResult.results) {
          searchResult.results.forEach((source) => {
            if (!sourceMap.has(source.url)) {
              const entry: SourceEntry = {
                ...source,
                categories: [`Web Search ${searchIndex + 1}`],
                questions: [searchResult.query],
                source_type: 'web',
                content_snippets: source.content || source.snippet || null,
              };
              sourceMap.set(source.url, entry);
              allSources.push(entry);
            } else {
              // Add category and query to existing source
              const existingSource = sourceMap.get(source.url);
              if (existingSource) {
                const newCategory = `Web Search ${searchIndex + 1}`;
                if (!existingSource.categories.includes(newCategory)) {
                  existingSource.categories.push(newCategory);
                }
                if (!existingSource.questions.includes(searchResult.query)) {
                  existingSource.questions.push(searchResult.query);
                }
              }
            }
          });
        }
      });
    }

    // Add Grundsatz results as official documents
    const categorizedSources: CategorizedSources = {};

    if (state.grundsatzResults?.success && state.grundsatzResults.results?.length > 0) {
      categorizedSources['official'] = state.grundsatzResults.results.map((result) => ({
        ...result,
        url: `#grundsatz-${String((result as Record<string, unknown>).document_id ?? '')}`,
        title: result.title,
        content: result.content || '',
        snippet: result.snippet || '',
      }));
    }

    // Categorize external sources
    allSources.forEach((source) => {
      const categories = source.categories;
      categories.forEach((category: string) => {
        if (!categorizedSources[category]) {
          categorizedSources[category] = [];
        }
        categorizedSources[category].push({
          ...source,
          content: source.content_snippets ?? source.content ?? '',
        });
      });
    });

    log.debug(
      `[WebSearchGraph] Aggregated ${allSources.length} unique sources into ${Object.keys(categorizedSources).length} categories`
    );

    return {
      aggregatedResults: allSources,
      categorizedSources,
      metadata: {
        ...state.metadata,
        totalSources: allSources.length + (state.grundsatzResults?.results?.length || 0),
        externalSources: allSources.length,
        officialSources: state.grundsatzResults?.results?.length || 0,
        categories: Object.keys(categorizedSources),
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error('[WebSearchGraph] Aggregation error:', errorMessage);
    return {
      aggregatedResults: [],
      categorizedSources: {},
      error: `Aggregation failed: ${errorMessage}`,
      metadata: { ...state.metadata, totalSources: 0 },
    };
  }
}
