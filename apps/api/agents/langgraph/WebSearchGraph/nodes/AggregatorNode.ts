/**
 * Aggregator Node for WebSearchGraph
 * Deduplicates and ranks results from all sources
 */

import type { WebSearchState, SearchResult, CategorizedSources } from '../types.js';

/**
 * Aggregator Node: Deduplicate and rank results from all sources
 */
export async function aggregatorNode(state: WebSearchState): Promise<Partial<WebSearchState>> {
  console.log('[WebSearchGraph] Aggregating results from all sources');

  try {
    const allSources: SearchResult[] = [];
    const sourceMap = new Map<string, any>(); // URL -> source object

    // Process web search results
    if (state.webResults) {
      state.webResults.forEach((searchResult, searchIndex) => {
        if (searchResult.success && searchResult.results) {
          searchResult.results.forEach(source => {
            if (!sourceMap.has(source.url)) {
              sourceMap.set(source.url, {
                ...source,
                categories: [`Web Search ${searchIndex + 1}`],
                questions: [searchResult.query],
                source_type: 'web',
                content_snippets: source.content || source.snippet || null
              });
              allSources.push(sourceMap.get(source.url));
            } else {
              // Add category and query to existing source
              const existingSource = sourceMap.get(source.url);
              const newCategory = `Web Search ${searchIndex + 1}`;
              if (!existingSource.categories.includes(newCategory)) {
                existingSource.categories.push(newCategory);
              }
              if (!existingSource.questions.includes(searchResult.query)) {
                existingSource.questions.push(searchResult.query);
              }
            }
          });
        }
      });
    }

    // Add Grundsatz results as official documents
    const categorizedSources: CategorizedSources = {};

    if (state.grundsatzResults?.success && state.grundsatzResults.results?.length > 0) {
      categorizedSources['official'] =
        state.grundsatzResults.results.map(result => ({
          ...result,
          url: `#grundsatz-${(result as any).document_id}`,
          title: result.title,
          content: result.content || '',
          snippet: result.snippet || ''
        }));
    }

    // Categorize external sources
    allSources.forEach(source => {
      const categories = (source as any).categories || [];
      categories.forEach((category: string) => {
        if (!categorizedSources[category]) {
          categorizedSources[category] = [];
        }
        categorizedSources[category].push({
          ...source,
          content: (source as any).content_snippets || source.content || ''
        });
      });
    });

    console.log(`[WebSearchGraph] Aggregated ${allSources.length} unique sources into ${Object.keys(categorizedSources).length} categories`);

    return {
      aggregatedResults: allSources,
      categorizedSources,
      metadata: {
        ...state.metadata,
        totalSources: allSources.length + (state.grundsatzResults?.results?.length || 0),
        externalSources: allSources.length,
        officialSources: state.grundsatzResults?.results?.length || 0,
        categories: Object.keys(categorizedSources)
      }
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[WebSearchGraph] Aggregation error:', errorMessage);
    return {
      aggregatedResults: [],
      categorizedSources: {},
      error: `Aggregation failed: ${errorMessage}`,
      metadata: { ...state.metadata, totalSources: 0 }
    };
  }
}
