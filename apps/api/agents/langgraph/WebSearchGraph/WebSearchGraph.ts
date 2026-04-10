/**
 * WebSearchGraph - Unified Web Search using LangGraph
 * Supports normal web search and deep research modes
 */

import { StateGraph, Annotation } from '@langchain/langgraph';
import { type Request } from 'express';

import { aggregatorNode } from './nodes/AggregatorNode.js';
import { contentEnricherNode } from './nodes/ContentEnricherNode.js';
import { dossierNode } from './nodes/DossierNode.js';
import { grundsatzNode } from './nodes/GrundsatzNode.js';
import { intelligentCrawlerNode } from './nodes/IntelligentCrawlerNode.js';
import { plannerNode } from './nodes/PlannerNode.js';
import { searxngNode } from './nodes/SearxngNode.js';
import { summaryNode } from './nodes/SummaryNode.js';
import {
  type WebSearchState,
  type WebSearchInput,
  type WebSearchOutput,
  type NormalSearchOutput,
  type DeepSearchOutput,
  type SearchOptions,
  type SearchMetadata,
  type CrawlMetadata,
  type CategorizedSources,
  type CrawlDecision,
  type EnrichedResult,
  type WebSearchBatch,
  type GrundsatzResult,
  type SearchResult,
  type ReferencesMap,
  type ResearchDossier,
  type Citation,
  type Source,
} from './types.js';

import type AIWorkerPool from '../../../workers/aiWorkerPool.js';

// State schema for the search graph
const SearchState = Annotation.Root({
  // Input parameters
  query: Annotation<string>({
    reducer: (x, y) => y ?? x,
  }),
  mode: Annotation<'normal' | 'deep'>({
    reducer: (x, y) => y ?? x,
  }),
  user_id: Annotation<string>({
    reducer: (x, y) => y ?? x,
  }),
  searchOptions: Annotation<SearchOptions>({
    reducer: (x, y) => ({ ...x, ...y }),
  }),
  aiWorkerPool: Annotation<AIWorkerPool>({
    reducer: (x, y) => y ?? x,
  }),
  req: Annotation<Request>({
    reducer: (x, y) => y ?? x,
  }),

  // Intermediate state
  subqueries: Annotation<string[] | null>({
    reducer: (x, y) => y ?? x,
  }),
  webResults: Annotation<WebSearchBatch[] | null>({
    reducer: (x, y) => y ?? x,
  }),
  grundsatzResults: Annotation<GrundsatzResult | null>({
    reducer: (x, y) => y ?? x,
  }),
  aggregatedResults: Annotation<SearchResult[] | null>({
    reducer: (x, y) => y ?? x,
  }),
  categorizedSources: Annotation<CategorizedSources>({
    reducer: (x, y) => ({ ...x, ...y }),
  }),

  // Citation support
  referencesMap: Annotation<ReferencesMap | null>({
    reducer: (x, y) => y ?? x,
  }),
  citations: Annotation<Citation[] | null>({
    reducer: (x, y) => y ?? x,
  }),
  citationSources: Annotation<Source[] | null>({
    reducer: (x, y) => y ?? x,
  }),

  // Intelligent crawling support
  crawlDecisions: Annotation<CrawlDecision[] | null>({
    reducer: (x, y) => y ?? x,
  }),
  enrichedResults: Annotation<EnrichedResult[] | null>({
    reducer: (x, y) => y ?? x,
  }),
  crawlMetadata: Annotation<CrawlMetadata>({
    reducer: (x, y) => ({ ...x, ...y }),
  }),

  // Output
  finalResults: Annotation<SearchResult[] | null>({
    reducer: (x, y) => y ?? x,
  }),
  summary: Annotation<string | null>({
    reducer: (x, y) => y ?? x,
  }),
  dossier: Annotation<ResearchDossier | null>({
    reducer: (x, y) => y ?? x,
  }),
  metadata: Annotation<SearchMetadata>({
    reducer: (x, y) => ({ ...x, ...y }),
  }),
  success: Annotation<boolean | null>({
    reducer: (x, y) => y ?? x,
  }),
  error: Annotation<string | null>({
    reducer: (x, y) => y ?? x,
  }),
});

/**
 * Create the web search graph
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- LangGraph node/edge type coercions */
const createWebSearchGraph = () => {
  const graph = new StateGraph(SearchState)
    .addNode('planner', plannerNode as any)
    .addNode('searxng', searxngNode as any)
    .addNode('intelligentCrawler', intelligentCrawlerNode as any)
    .addNode('contentEnricher', contentEnricherNode as any)
    .addNode('grundsatz', grundsatzNode as any)
    .addNode('aggregator', aggregatorNode as any)
    .addNode('summarizer', summaryNode as any)
    .addNode('writer', dossierNode as any)
    .addEdge('__start__', 'planner')
    .addEdge('planner', 'searxng');

  // Conditional edges based on mode
  graph.addConditionalEdges(
    'planner',
    (state: any) => (state.mode === 'deep' ? ['searxng', 'grundsatz'] : ['searxng']),
    {
      searxng: 'searxng',
      grundsatz: 'grundsatz',
    } as any
  );

  // After searxng, run intelligent crawler to select URLs
  graph.addEdge('searxng', 'intelligentCrawler');

  // After crawler decision, enrich content
  graph.addEdge('intelligentCrawler', 'contentEnricher');

  // After content enrichment, route based on mode
  graph.addConditionalEdges('contentEnricher', (state: any) =>
    state.mode === 'normal' ? 'summarizer' : 'aggregator'
  );

  graph.addConditionalEdges('grundsatz', (_state: any) => 'aggregator');

  graph.addConditionalEdges('summarizer', (_state: any) => '__end__');

  graph.addConditionalEdges('aggregator', (state: any) =>
    state.mode === 'deep' ? 'writer' : '__end__'
  );

  graph.addConditionalEdges('writer', (_state: any) => '__end__');

  return graph.compile();
};
/* eslint-enable @typescript-eslint/no-explicit-any */

// Export the compiled graph
export const webSearchGraph = createWebSearchGraph();

/**
 * Execute web search using the graph
 */
export async function runWebSearch(input: WebSearchInput): Promise<WebSearchOutput> {
  const {
    query,
    mode = 'normal',
    user_id = 'anonymous',
    searchOptions = {},
    aiWorkerPool,
    req,
  } = input;

  console.log(`[WebSearchGraph] Starting ${mode} search for: "${query}"`);

  try {
    const initialState = {
      query,
      mode,
      user_id,
      searchOptions,
      aiWorkerPool,
      req,
      metadata: {
        startTime: Date.now(),
        searchMode: mode,
      } as SearchMetadata,
    };

    const result = await webSearchGraph.invoke(initialState as unknown as typeof SearchState.State);

    // Format final output based on mode
    if (mode === 'normal') {
      // For normal mode, get results from the first successful web search
      const firstWebSearch = result.webResults?.[0];
      const webResults = firstWebSearch?.success ? firstWebSearch.results || [] : [];

      return {
        status: 'success',
        query: result.query,
        results: webResults,
        summary: result.summary,
        citations: result.citations || [],
        citationSources: result.citationSources || [],
        metadata: {
          ...result.metadata,
          searchType: 'normal_web_search',
          duration: Date.now() - (result.metadata.startTime || 0),
          totalResults: webResults.length,
          citationsEnabled: !!(result.citations && result.citations.length > 0),
        },
      } as NormalSearchOutput;
    } else {
      return {
        status: 'success',
        dossier: result.dossier,
        researchQuestions: result.subqueries || [],
        searchResults: result.webResults || [],
        sources: result.aggregatedResults || [],
        categorizedSources: result.categorizedSources || {},
        grundsatzResults: result.grundsatzResults || null,
        citations: result.citations || [],
        citationSources: result.citationSources || [],
        metadata: {
          ...result.metadata,
          searchType: 'deep_research',
          duration: Date.now() - (result.metadata.startTime || 0),
          hasOfficialPosition: !!(
            result.grundsatzResults?.success && result.grundsatzResults.results?.length > 0
          ),
          citationsEnabled: !!(result.citations && result.citations.length > 0),
        },
      } as DeepSearchOutput;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[WebSearchGraph] Execution error:', errorMessage);
    return {
      status: 'error' as const,
      query: input.query,
      results: [],
      citations: [],
      citationSources: [],
      message: 'Fehler bei der Suche',
      error: errorMessage,
      metadata: {
        searchType: mode,
        errorOccurred: true,
      } as SearchMetadata,
    } satisfies NormalSearchOutput;
  }
}
