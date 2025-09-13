/**
 * Unified Web Search Graph using LangGraph
 * Supports two modes:
 * 1. Normal web search: Simple SearXNG search with optional AI summary
 * 2. Deep research: Multi-step orchestrated research with web + document search
 */

import { StateGraph, Annotation } from "@langchain/langgraph";
import { DocumentSearchService } from '../../services/DocumentSearchService.js';
import searxngService from '../../services/searxngWebSearchService.js';

// Import citation functions from qaGraph
import {
  normalizeBracketListsToSingles,
  stripCodeFences,
  stripQuellenSection,
  validateAndInjectCitations,
  normalizeSearchResult,
  dedupeAndDiversify,
  buildReferencesMap
} from './qaGraphCitations.mjs';

// State schema for the search graph
const SearchState = Annotation.Root({
  // Input parameters
  query: Annotation({
    reducer: (x, y) => y ?? x,
  }),
  mode: Annotation({
    reducer: (x, y) => y ?? x, // 'normal' or 'deep'
  }),
  user_id: Annotation({
    reducer: (x, y) => y ?? x,
  }),
  searchOptions: Annotation({
    reducer: (x, y) => ({ ...x, ...y }),
  }),
  aiWorkerPool: Annotation({
    reducer: (x, y) => y ?? x,
  }),
  req: Annotation({
    reducer: (x, y) => y ?? x, // Express request object for AI worker context
  }),

  // Intermediate state
  subqueries: Annotation({
    reducer: (x, y) => y ?? x,
  }),
  webResults: Annotation({
    reducer: (x, y) => y ?? x,
  }),
  grundsatzResults: Annotation({
    reducer: (x, y) => y ?? x,
  }),
  aggregatedResults: Annotation({
    reducer: (x, y) => y ?? x,
  }),
  categorizedSources: Annotation({
    reducer: (x, y) => ({ ...x, ...y }),
  }),

  // Output
  finalResults: Annotation({
    reducer: (x, y) => y ?? x,
  }),
  summary: Annotation({
    reducer: (x, y) => y ?? x,
  }),
  dossier: Annotation({
    reducer: (x, y) => y ?? x,
  }),
  metadata: Annotation({
    reducer: (x, y) => ({ ...x, ...y }),
  }),
  success: Annotation({
    reducer: (x, y) => y ?? x,
  }),
  error: Annotation({
    reducer: (x, y) => y ?? x,
  })
});

// Initialize services
const documentSearchService = new DocumentSearchService();

/**
 * Planner Node: Generate search queries based on mode
 */
async function plannerNode(state) {
  console.log(`[WebSearchGraph] Planning ${state.mode} search for: "${state.query}"`);

  try {
    if (state.mode === 'normal') {
      // Normal mode: use original query, optionally with optimization
      const optimizedQuery = optimizeSearchQuery(state.query);
      return {
        subqueries: [optimizedQuery],
        metadata: {
          planningStrategy: 'normal_mode',
          queryOptimization: optimizedQuery !== state.query
        }
      };
    } else if (state.mode === 'deep') {
      // Deep mode: generate strategic research questions using AI
      const subqueries = await generateResearchQuestions(
        state.query,
        state.aiWorkerPool,
        state.req
      );
      return {
        subqueries,
        metadata: {
          planningStrategy: 'deep_research',
          generatedQuestions: subqueries.length
        }
      };
    } else {
      throw new Error(`Unknown search mode: ${state.mode}`);
    }
  } catch (error) {
    console.error('[WebSearchGraph] Planner error:', error);
    return {
      subqueries: [state.query], // Fallback to original query
      error: `Planning failed: ${error.message}`,
      metadata: { planningStrategy: 'fallback' }
    };
  }
}

/**
 * SearXNG Node: Execute web searches
 */
async function searxngNode(state) {
  console.log(`[WebSearchGraph] Executing SearXNG searches for ${state.subqueries?.length || 0} queries`);

  try {
    const searchPromises = state.subqueries.map(async (query, index) => {
      try {
        console.log(`[WebSearchGraph] SearXNG search ${index + 1}: "${query}"`);

        // Apply intelligent search options based on query and mode
        const searchOptions = getIntelligentSearchOptions(query, state.mode, state.searchOptions);

        const results = await searxngService.performWebSearch(query, searchOptions);

        return {
          query,
          success: true,
          results: results.results || [],
          metadata: results
        };
      } catch (error) {
        console.error(`[WebSearchGraph] SearXNG search ${index + 1} failed:`, error);
        return {
          query,
          success: false,
          error: error.message,
          results: []
        };
      }
    });

    const searchResults = await Promise.all(searchPromises);
    const successfulSearches = searchResults.filter(r => r.success);

    console.log(`[WebSearchGraph] SearXNG completed: ${successfulSearches.length}/${searchResults.length} searches successful`);

    return {
      webResults: searchResults,
      metadata: {
        webSearches: searchResults.length,
        successfulWebSearches: successfulSearches.length,
        totalWebResults: successfulSearches.reduce((sum, r) => sum + r.results.length, 0)
      }
    };
  } catch (error) {
    console.error('[WebSearchGraph] SearXNG node error:', error);
    return {
      webResults: [],
      error: `Web search failed: ${error.message}`,
      metadata: { webSearches: 0, successfulWebSearches: 0 }
    };
  }
}

/**
 * Grundsatz Node: Search official Green Party documents (deep mode only)
 */
async function grundsatzNode(state) {
  if (state.mode !== 'deep') {
    return { grundsatzResults: null };
  }

  console.log('[WebSearchGraph] Searching Grundsatz documents');

  try {
    // Use original query for Grundsatz search (more focused)
    const searchResults = await documentSearchService.search({
      query: state.query,
      user_id: 'deep-research',
      searchCollection: 'grundsatz_documents',
      limit: 3,
      mode: 'hybrid'
    });

    const formattedResults = (searchResults.results || []).map(result => ({
      document_id: result.document_id,
      title: result.title || result.document_title,
      content: result.relevant_content || result.chunk_text,
      similarity_score: result.similarity_score,
      filename: result.filename,
      chunk_index: result.chunk_index || 0,
      relevance_info: result.relevance_info,
      source_type: 'official_document'
    }));

    console.log(`[WebSearchGraph] Grundsatz search found ${formattedResults.length} results`);

    return {
      grundsatzResults: {
        success: true,
        results: formattedResults,
        searchType: searchResults.searchType,
        query: state.query
      },
      metadata: {
        grundsatzResults: formattedResults.length
      }
    };
  } catch (error) {
    console.error('[WebSearchGraph] Grundsatz search error:', error);
    return {
      grundsatzResults: {
        success: false,
        results: [],
        error: error.message,
        query: state.query
      },
      metadata: { grundsatzResults: 0 }
    };
  }
}

/**
 * Aggregator Node: Deduplicate and rank results from all sources
 */
async function aggregatorNode(state) {
  console.log('[WebSearchGraph] Aggregating results from all sources');

  try {
    const allSources = [];
    const sourceMap = new Map(); // URL -> source object

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
    const categorizedSources = {};

    if (state.grundsatzResults?.success && state.grundsatzResults.results?.length > 0) {
      categorizedSources['Offizielle Dokumente (Bündnis 90/Die Grünen)'] =
        state.grundsatzResults.results.map(result => ({
          title: result.title,
          url: `#grundsatz-${result.document_id}`, // Internal reference
          content: result.content,
          source_type: 'official_document',
          document_id: result.document_id,
          filename: result.filename,
          similarity_score: result.similarity_score,
          categories: ['Offizielle Dokumente (Bündnis 90/Die Grünen)']
        }));
    }

    // Categorize external sources
    allSources.forEach(source => {
      source.categories.forEach(category => {
        if (!categorizedSources[category]) {
          categorizedSources[category] = [];
        }
        categorizedSources[category].push({
          ...source,
          source_type: 'external',
          content_snippets: source.content_snippets
        });
      });
    });

    console.log(`[WebSearchGraph] Aggregated ${allSources.length} unique sources into ${Object.keys(categorizedSources).length} categories`);

    return {
      aggregatedResults: allSources,
      categorizedSources,
      metadata: {
        totalSources: allSources.length + (state.grundsatzResults?.results?.length || 0),
        externalSources: allSources.length,
        officialSources: state.grundsatzResults?.results?.length || 0,
        categories: Object.keys(categorizedSources)
      }
    };
  } catch (error) {
    console.error('[WebSearchGraph] Aggregation error:', error);
    return {
      aggregatedResults: [],
      categorizedSources: {},
      error: `Aggregation failed: ${error.message}`,
      metadata: { totalSources: 0 }
    };
  }
}

/**
 * Summary Node: Generate AI summary for normal mode
 */
async function summaryNode(state) {
  if (state.mode !== 'normal' || !state.aggregatedResults?.length) {
    return { summary: null };
  }

  console.log('[WebSearchGraph] Generating AI summary for normal mode');

  try {
    // Prepare content for summarization (use first web search results)
    const firstWebSearch = state.webResults?.[0];
    if (!firstWebSearch?.success || !firstWebSearch.results?.length) {
      return {
        summary: {
          text: 'Keine Suchergebnisse zum Zusammenfassen verfügbar.',
          generated: false,
          error: 'No results to summarize'
        }
      };
    }

    // Use existing SearXNG summary generation logic
    const mockSearchResults = {
      results: firstWebSearch.results,
      query: state.query
    };

    const summaryResults = await searxngService.generateAISummary(
      mockSearchResults,
      state.query,
      state.aiWorkerPool,
      state.searchOptions,
      state.req
    );

    return {
      summary: summaryResults.summary,
      metadata: {
        summaryGenerated: summaryResults.summary?.generated || false
      }
    };
  } catch (error) {
    console.error('[WebSearchGraph] Summary generation error:', error);
    return {
      summary: {
        text: 'Fehler beim Generieren der Zusammenfassung.',
        generated: false,
        error: error.message
      }
    };
  }
}

/**
 * Dossier Node: Generate comprehensive research dossier for deep mode
 */
async function dossierNode(state) {
  if (state.mode !== 'deep') {
    return { dossier: null };
  }

  console.log('[WebSearchGraph] Generating comprehensive research dossier');

  try {
    // Filter and prepare data for AI processing (similar to deepResearchController)
    const filteredData = filterDataForAI(state.webResults, state.aggregatedResults, state.grundsatzResults);

    const dossierSystemPrompt = buildDossierSystemPrompt();
    const dossierPrompt = buildDossierPrompt(state.query, filteredData);

    const result = await state.aiWorkerPool.processRequest({
      type: 'text_adjustment',
      systemPrompt: dossierSystemPrompt,
      messages: [{ role: "user", content: dossierPrompt }],
      options: {
        max_tokens: 6000,
        temperature: 0.7
      }
    }, state.req);

    if (!result.success) {
      throw new Error(result.error);
    }

    // Add methodology section
    const methodologySection = buildMethodologySection(
      state.grundsatzResults,
      state.subqueries,
      state.aggregatedResults,
      state.categorizedSources
    );

    const completeDossier = result.content + methodologySection;

    console.log('[WebSearchGraph] Dossier generation completed');

    return {
      dossier: completeDossier,
      metadata: {
        dossierGenerated: true,
        dossierLength: completeDossier.length
      }
    };
  } catch (error) {
    console.error('[WebSearchGraph] Dossier generation error:', error);
    return {
      dossier: `Fehler bei der Deep Research: ${error.message}`,
      error: `Dossier generation failed: ${error.message}`,
      metadata: { dossierGenerated: false }
    };
  }
}

// Utility functions (extracted from existing controllers)

/**
 * Optimize search query for better results
 */
function optimizeSearchQuery(query) {
  // Basic German synonym expansion and cleanup
  let optimizedQuery = query.trim();

  const synonymMap = {
    'verkehrswende': 'verkehrswende mobilität nachhaltiger verkehr',
    'nahverkehr': 'nahverkehr öpnv öffentlicher verkehr',
    'radverkehr': 'radverkehr fahrrad radwege',
    'klimaschutz': 'klimaschutz umweltschutz nachhaltigkeit',
    'energie': 'energie erneuerbare energien energiewende'
  };

  Object.entries(synonymMap).forEach(([term, synonyms]) => {
    if (optimizedQuery.toLowerCase().includes(term)) {
      optimizedQuery = optimizedQuery.replace(
        new RegExp(term, 'gi'),
        synonyms
      );
    }
  });

  // Keep under 400 characters
  if (optimizedQuery.length > 400) {
    optimizedQuery = optimizedQuery.substring(0, 397) + '...';
  }

  return optimizedQuery;
}

/**
 * Generate research questions for deep mode using AI
 */
async function generateResearchQuestions(originalQuery, aiWorkerPool, req) {
  try {
    const researchSystemPrompt = `Du bist ein Recherche-Experte. Generiere 4-5 strategische Forschungsfragen für eine umfassende Webrecherche.

Die Fragen sollten diese Aspekte abdecken:
1. Hintergrund/Kontext: Was ist der grundlegende Sachverhalt?
2. Aktuelle Entwicklungen: Was passiert gerade zu diesem Thema?
3. Auswirkungen: Welche gesellschaftlichen, ökologischen oder politischen Auswirkungen gibt es?
4. Alternative Perspektiven: Welche anderen Standpunkte gibt es?
5. Zukunftsausblick: Wie könnte sich das Thema entwickeln?

Antworte ausschließlich im JSON-Format: {"research_questions":["Frage 1","Frage 2","Frage 3","Frage 4","Frage 5"]}`;

    const researchPrompt = `Erstelle 4-5 strategische Forschungsfragen für das Thema: "${originalQuery}"

Fokussiere dich auf externe Quellen und verschiedene Perspektiven.`;

    const result = await aiWorkerPool.processRequest({
      type: 'text_adjustment',
      systemPrompt: researchSystemPrompt,
      messages: [{ role: "user", content: researchPrompt }],
      options: { max_tokens: 300, temperature: 0.3 }
    }, req);

    if (result.success && result.content) {
      try {
        // Clean up potential code fences
        let cleanContent = result.content.replace(/```json\s*|\s*```/g, '').trim();
        const parsed = JSON.parse(cleanContent);
        if (parsed.research_questions && Array.isArray(parsed.research_questions)) {
          return parsed.research_questions.slice(0, 5);
        }
      } catch (parseError) {
        console.warn('[WebSearchGraph] Failed to parse AI research questions:', parseError);
      }
    }
  } catch (error) {
    console.error('[WebSearchGraph] Research question generation error:', error);
  }

  // Fallback: generate basic questions
  return [
    `${originalQuery} - Hintergrund und Kontext`,
    `${originalQuery} - aktuelle Entwicklungen`,
    `${originalQuery} - gesellschaftliche Auswirkungen`,
    `${originalQuery} - alternative Perspektiven`
  ];
}

/**
 * Get intelligent search options based on query content
 */
function getIntelligentSearchOptions(query, mode, baseOptions = {}) {
  const options = {
    maxResults: mode === 'deep' ? 8 : 10,
    language: 'de-DE',
    safesearch: 0,
    categories: 'general',
    ...baseOptions
  };

  const queryLower = query.toLowerCase();

  // German regional search detection
  const isGermanRegional = [
    'rhein-sieg', 'deutschland', 'nrw', 'nordrhein-westfalen',
    'bonn', 'köln', 'landkreis', 'germany', 'german'
  ].some(term => queryLower.includes(term));

  if (isGermanRegional) {
    options.categories = 'general,news';
    console.log(`[WebSearchGraph] Using German regional search settings for: "${query}"`);
  }

  // News search for current developments
  if ([
    'aktuelle', 'entwicklung', 'derzeit', 'momentan', 'heute',
    '2024', '2025', 'situation', 'stand', 'status'
  ].some(term => queryLower.includes(term))) {
    options.categories = 'news';
    options.time_range = 'year';
    console.log(`[WebSearchGraph] Using news search for current developments: "${query}"`);
  }

  return options;
}

/**
 * Filter data for AI processing to reduce token usage
 */
function filterDataForAI(webResults, aggregatedResults, grundsatzResults) {
  // Simplified filtering logic from deepResearchController
  const filteredWebResults = (webResults || []).map(result => ({
    query: result.query,
    success: result.success,
    resultCount: result.results?.length || 0,
    hasResults: (result.results?.length || 0) > 0
  }));

  const filteredSources = (aggregatedResults || []).slice(0, 10).map(source => ({
    title: source.title,
    url: source.url,
    snippet: source.content_snippets?.substring(0, 150) || null,
    domain: source.domain
  }));

  const filteredGrundsatz = grundsatzResults?.success ? {
    hasResults: (grundsatzResults.results?.length || 0) > 0,
    resultCount: grundsatzResults.results?.length || 0,
    keyFindings: (grundsatzResults.results || []).slice(0, 3).map(result => ({
      title: result.title,
      content: result.content?.substring(0, 200) || '',
      filename: result.filename,
      similarity_score: result.similarity_score
    }))
  } : { hasResults: false, resultCount: 0, keyFindings: [] };

  return {
    webResults: filteredWebResults,
    sources: filteredSources,
    grundsatz: filteredGrundsatz
  };
}

/**
 * Build dossier system prompt
 */
function buildDossierSystemPrompt() {
  return `Du bist ein Experte für politische Recherche und erstellst faktische, tiefgreifende Dossiers basierend auf verfügbaren Daten.

WICHTIG:
- BEANTWORTE DIE NUTZERFRAGE DIREKT: Fokussiere dich primär darauf, die konkrete Frage des Nutzers zu beantworten
- Verwende FAKTEN aus den Quellen, keine Spekulationen
- Vermeide oberflächliche Stichpunkt-Listen
- Schreibe in zusammenhängenden, analytischen Absätzen
- Zitiere konkrete Daten, Zahlen und Aussagen aus den Quellen
- Keine Fantasie oder Vermutungen - nur das, was die Quellen hergeben

Struktur des Dossiers:
1. **Executive Summary** - DIREKTE Beantwortung der Nutzerfrage basierend auf verfügbaren Erkenntnissen
2. **Position von Bündnis 90/Die Grünen** - Konkrete Aussagen aus Grundsatzprogrammen zur Frage
3. **Faktenlage nach Themenbereichen** - Detaillierte Analyse der verfügbaren Informationen zur Beantwortung der Frage
4. **Quellenbasierte Erkenntnisse** - Tiefere Analyse konkreter Daten und Aussagen die zur Antwort beitragen

Erstelle eine faktische, tiefgreifende Analyse die die Nutzerfrage beantwortet. Verwende zusammenhängende Absätze statt Aufzählungen.`;
}

/**
 * Build dossier prompt with filtered data
 */
function buildDossierPrompt(query, filteredData) {
  return `Erstelle ein faktisches Recherche-Dossier zur FRAGE: "${query}"

WICHTIGE ANWEISUNG: Die Nutzerfrage lautet "${query}" - BEANTWORTE DIESE FRAGE DIREKT mit den verfügbaren Daten!

## Verfügbare Forschungsergebnisse:
${JSON.stringify(filteredData.webResults, null, 2)}

## Verfügbare Quellen mit Inhalten:
${JSON.stringify(filteredData.sources, null, 2)}

## Verfügbare Grundsatz-Position:
${JSON.stringify(filteredData.grundsatz, null, 2)}

ANWEISUNG:
- BEANTWORTE DIE KONKRETE FRAGE: "${query}" - das ist das Hauptziel!
- Analysiere diese Daten gründlich und faktisch um die Frage zu beantworten
- Schreibe in zusammenhängenden Absätzen, nicht in Listen
- Zitiere konkrete Aussagen und Daten aus den Quellen die zur Antwort beitragen
- Entwickle tiefere Erkenntnisse aus den verfügbaren Informationen zur Beantwortung der Frage
- Verzichte auf Spekulationen oder allgemeine Aussagen ohne Quellenbeleg
- Fokussiere auf das, was die Quellen zur Beantwortung der Frage tatsächlich aussagen`;
}

/**
 * Build methodology section for dossier
 */
function buildMethodologySection(grundsatzResults, researchQuestions, aggregatedResults, categorizedSources) {
  return `

---

## Methodology

Diese Deep Research wurde mit folgender Methodik durchgeführt:

1. **Grundsatz-Recherche**: Suche in offiziellen Grundsatzprogrammen von Bündnis 90/Die Grünen (${grundsatzResults?.results?.length || 0} Dokumente gefunden)
2. **Strategische Fragengenerierung**: ${researchQuestions?.length || 0} Forschungsfragen zu verschiedenen Aspekten des Themas
3. **Optimierte Webrecherche**: SearXNG mit intelligenter Quellenauswahl und regionaler Filterung (${aggregatedResults?.length || 0} Quellen analysiert)
4. **Query-Optimierung**: Automatische Anpassung für deutsche Suchbegriffe und <400 Zeichen Limit
5. **KI-Synthese**: Professionelle Analyse und Strukturierung durch Claude AI

**Datenquellen:**
- Offizielle Grundsatzprogramme: ${grundsatzResults?.results?.length || 0} Treffer
- Externe Webquellen: ${aggregatedResults?.length || 0} Quellen
- Kategorien: ${Object.keys(categorizedSources || {}).length}
- Forschungsfragen: ${researchQuestions?.length || 0}

**Qualitätssicherung:** SearXNG mit intelligenter Quellenauswahl und regionaler Filterung für maximale Relevanz.`;
}

// Create the search graph
const createWebSearchGraph = () => {
  const graph = new StateGraph(SearchState)
    .addNode("planner", plannerNode)
    .addNode("searxng", searxngNode)
    .addNode("grundsatz", grundsatzNode)
    .addNode("aggregator", aggregatorNode)
    .addNode("summarizer", summaryNode) // Renamed to avoid conflict with state attribute
    .addNode("writer", dossierNode) // Renamed to avoid conflict with state attribute
    .addEdge("__start__", "planner")
    .addEdge("planner", "searxng");

  // Conditional edges based on mode
  graph.addConditionalEdges(
    "planner",
    (state) => state.mode === 'deep' ? ["searxng", "grundsatz"] : ["searxng"],
    {
      searxng: "searxng",
      grundsatz: "grundsatz"
    }
  );

  graph.addConditionalEdges(
    "searxng",
    (state) => state.mode === 'normal' ? "summarizer" : "aggregator"
  );

  graph.addConditionalEdges(
    "grundsatz",
    (state) => "aggregator"
  );

  graph.addConditionalEdges(
    "summarizer",
    (state) => "__end__"
  );

  graph.addConditionalEdges(
    "aggregator",
    (state) => state.mode === 'deep' ? "writer" : "__end__"
  );

  graph.addConditionalEdges(
    "writer",
    (state) => "__end__"
  );

  return graph.compile();
};

// Export the compiled graph
export const webSearchGraph = createWebSearchGraph();

/**
 * Execute web search using the graph
 */
export async function runWebSearch({
  query,
  mode = 'normal', // 'normal' or 'deep'
  user_id = 'anonymous',
  searchOptions = {},
  aiWorkerPool,
  req
}) {
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
        metadata: {
          ...result.metadata,
          searchType: 'normal_web_search',
          duration: Date.now() - result.metadata.startTime,
          totalResults: webResults.length
        }
      };
    } else {
      return {
        status: 'success',
        dossier: result.dossier,
        researchQuestions: result.subqueries,
        searchResults: result.webResults || [],
        sources: result.aggregatedResults || [],
        categorizedSources: result.categorizedSources || {},
        grundsatzResults: result.grundsatzResults || null,
        metadata: {
          ...result.metadata,
          searchType: 'deep_research',
          duration: Date.now() - result.metadata.startTime,
          hasOfficialPosition: !!(result.grundsatzResults?.success && result.grundsatzResults.results?.length > 0)
        }
      };
    }
  } catch (error) {
    console.error('[WebSearchGraph] Execution error:', error);
    return {
      status: 'error',
      message: 'Fehler bei der Suche',
      error: error.message,
      metadata: {
        searchType: mode,
        errorOccurred: true
      }
    };
  }
}