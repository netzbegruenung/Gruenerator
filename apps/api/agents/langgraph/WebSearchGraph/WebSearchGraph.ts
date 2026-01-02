/**
 * WebSearchGraph - Unified Web Search using LangGraph
 * Supports normal web search and deep research modes
 */

import { StateGraph, Annotation } from "@langchain/langgraph";
import type { WebSearchState, WebSearchInput, WebSearchOutput, NormalSearchOutput, DeepSearchOutput } from './types.js';
import { plannerNode } from './nodes/PlannerNode.js';
import { searxngNode } from './nodes/SearxngNode.js';
import { intelligentCrawlerNode } from './nodes/IntelligentCrawlerNode.js';
import { contentEnricherNode } from './nodes/ContentEnricherNode.js';
import { grundsatzNode } from './nodes/GrundsatzNode.js';
import { aggregatorNode } from './nodes/AggregatorNode.js';
import { summaryNode } from './nodes/SummaryNode.js';
import { dossierNode } from './nodes/DossierNode.js';

// State schema for the search graph
const SearchState = Annotation.Root({
  // Input parameters
  query: Annotation({
    reducer: (x: any, y: any) => y ?? x,
  }),
  mode: Annotation({
    reducer: (x: any, y: any) => y ?? x,
  }),
  user_id: Annotation({
    reducer: (x: any, y: any) => y ?? x,
  }),
  searchOptions: Annotation({
    reducer: (x: any, y: any) => ({ ...x, ...y }),
  }),
  aiWorkerPool: Annotation({
    reducer: (x: any, y: any) => y ?? x,
  }),
  req: Annotation({
    reducer: (x: any, y: any) => y ?? x,
  }),

  // Intermediate state
  subqueries: Annotation({
    reducer: (x: any, y: any) => y ?? x,
  }),
  webResults: Annotation({
    reducer: (x: any, y: any) => y ?? x,
  }),
  grundsatzResults: Annotation({
    reducer: (x: any, y: any) => y ?? x,
  }),
  aggregatedResults: Annotation({
    reducer: (x: any, y: any) => y ?? x,
  }),
  categorizedSources: Annotation({
    reducer: (x: any, y: any) => ({ ...x, ...y }),
  }),

  // Citation support
  referencesMap: Annotation({
    reducer: (x: any, y: any) => y ?? x,
  }),
  citations: Annotation({
    reducer: (x: any, y: any) => y ?? x,
  }),
  citationSources: Annotation({
    reducer: (x: any, y: any) => y ?? x,
  }),

  // Intelligent crawling support
  crawlDecisions: Annotation({
    reducer: (x: any, y: any) => y ?? x,
  }),
  enrichedResults: Annotation({
    reducer: (x: any, y: any) => y ?? x,
  }),
  crawlMetadata: Annotation({
    reducer: (x: any, y: any) => ({ ...x, ...y }),
  }),

  // Output
  finalResults: Annotation({
    reducer: (x: any, y: any) => y ?? x,
  }),
  summary: Annotation({
    reducer: (x: any, y: any) => y ?? x,
  }),
  dossier: Annotation({
    reducer: (x: any, y: any) => y ?? x,
  }),
  metadata: Annotation({
    reducer: (x: any, y: any) => ({ ...x, ...y }),
  }),
  success: Annotation({
    reducer: (x: any, y: any) => y ?? x,
  }),
  error: Annotation({
    reducer: (x: any, y: any) => y ?? x,
  })
});

/**
 * Create the web search graph
 */
const createWebSearchGraph = () => {
  const graph = new StateGraph(SearchState)
    .addNode("planner", plannerNode as any)
    .addNode("searxng", searxngNode as any)
    .addNode("intelligentCrawler", intelligentCrawlerNode as any)
    .addNode("contentEnricher", contentEnricherNode as any)
    .addNode("grundsatz", grundsatzNode as any)
    .addNode("aggregator", aggregatorNode as any)
    .addNode("summarizer", summaryNode as any)
    .addNode("writer", dossierNode as any)
    .addEdge("__start__", "planner")
    .addEdge("planner", "searxng");

  // Conditional edges based on mode
  graph.addConditionalEdges(
    "planner",
    (state: any) => state.mode === 'deep' ? ["searxng", "grundsatz"] : ["searxng"],
    {
      searxng: "searxng",
      grundsatz: "grundsatz"
    } as any
  );

  // After searxng, run intelligent crawler to select URLs
  graph.addEdge("searxng", "intelligentCrawler");

  // After crawler decision, enrich content
  graph.addEdge("intelligentCrawler", "contentEnricher");

  // After content enrichment, route based on mode
  graph.addConditionalEdges(
    "contentEnricher",
    (state: any) => state.mode === 'normal' ? "summarizer" : "aggregator"
  );

  graph.addConditionalEdges(
    "grundsatz",
    (state: any) => "aggregator"
  );

  graph.addConditionalEdges(
    "summarizer",
    (state: any) => "__end__"
  );

  graph.addConditionalEdges(
    "aggregator",
    (state: any) => state.mode === 'deep' ? "writer" : "__end__"
  );

  graph.addConditionalEdges(
    "writer",
    (state: any) => "__end__"
  );

  return graph.compile();
};

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
    req
  } = input;

  console.log(`[WebSearchGraph] Starting ${mode} search for: "${query}"`);

  try {
    const initialState: Partial<WebSearchState> = {
      query,
      mode,
      user_id,
      searchOptions,
      aiWorkerPool,
      req,
      metadata: {
        startTime: Date.now(),
        searchMode: mode
      }
    };

    const result = await webSearchGraph.invoke(initialState);

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
          citationsEnabled: !!(result.citations && result.citations.length > 0)
        }
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
          hasOfficialPosition: !!(result.grundsatzResults?.success && result.grundsatzResults.results?.length > 0),
          citationsEnabled: !!(result.citations && result.citations.length > 0)
        }
      } as DeepSearchOutput;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[WebSearchGraph] Execution error:', errorMessage);
    return {
      status: 'error',
      message: 'Fehler bei der Suche',
      error: errorMessage,
      metadata: {
        searchType: mode,
        errorOccurred: true
      }
    } as any;
  }
}
