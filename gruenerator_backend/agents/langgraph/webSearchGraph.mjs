/**
 * Unified Web Search Graph using LangGraph
 * Supports two modes:
 * 1. Normal web search: Simple SearXNG search with optional AI summary
 * 2. Deep research: Multi-step orchestrated research with web + document search
 */

import { StateGraph, Annotation } from "@langchain/langgraph";
import { DocumentSearchService } from '../../services/DocumentSearchService.js';
import searxngService from '../../services/searxngWebSearchService.js';
import { urlCrawlerService } from '../../services/urlCrawlerService.js';

// Import citation functions
import {
  normalizeSearchResult,
  dedupeAndDiversify,
  buildReferencesMap,
  validateAndInjectCitations,
  summarizeReferencesForPrompt
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

  // Citation support
  referencesMap: Annotation({
    reducer: (x, y) => y ?? x,
  }),
  citations: Annotation({
    reducer: (x, y) => y ?? x,
  }),
  citationSources: Annotation({
    reducer: (x, y) => y ?? x,
  }),

  // Intelligent crawling support
  crawlDecisions: Annotation({
    reducer: (x, y) => y ?? x,
  }),
  enrichedResults: Annotation({
    reducer: (x, y) => y ?? x,
  }),
  crawlMetadata: Annotation({
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
 * Intelligent Crawler Agent Node: AI decides which URLs to crawl for full content
 */
async function intelligentCrawlerAgent(state) {
  console.log('[WebSearchGraph] Running intelligent crawler agent');

  try {
    // Check if we have web results to analyze
    if (!state.webResults || state.webResults.length === 0 || !state.webResults[0].success) {
      console.log('[IntelligentCrawler] No web results available for analysis');
      return {
        crawlDecisions: [],
        crawlMetadata: { noResultsToAnalyze: true }
      };
    }

    const firstWebSearch = state.webResults[0];
    const results = firstWebSearch.results || [];

    if (results.length === 0) {
      console.log('[IntelligentCrawler] No individual results to analyze');
      return {
        crawlDecisions: [],
        crawlMetadata: { emptyResults: true }
      };
    }

    // Configuration based on mode
    const maxCrawls = state.mode === 'deep' ? 5 : 2;
    const timeout = state.mode === 'deep' ? 5000 : 3000;

    // Build the analysis prompt
    const analysisContent = results.map((r, i) => `
[${i+1}] ${r.title}
URL: ${r.url}
Domain: ${r.domain || 'unknown'}
Snippet: ${r.snippet || r.content || 'No preview available'}
`).join('\n');

    console.log(`[IntelligentCrawler] Analyzing ${results.length} results to select max ${maxCrawls} for crawling`);

    // AI analyzes snippets and decides which URLs to crawl
    const crawlDecision = await state.aiWorkerPool.processRequest({
      type: 'crawler_agent',
      systemPrompt: `You are an intelligent web research agent. Based on search snippets, decide which URLs to crawl for full content.

Evaluation criteria:
- RELEVANCE: How directly does the snippet address the query?
- AUTHORITY: Is this a credible, authoritative source? (gov, edu, established organizations)
- UNIQUENESS: Does this offer unique information not in other results?
- DEPTH: Does the snippet suggest rich, detailed content beyond what's shown?
- ACCESSIBILITY: Avoid paywalled sites (wsj.com, nytimes.com, etc.)

Select up to ${maxCrawls} URLs maximum that would provide the most value.
Prioritize quality over quantity - fewer high-quality sources are better than many mediocre ones.`,

      messages: [{
        role: "user",
        content: `Query: "${state.query}"
Mode: ${state.mode} research

Available search results:
${analysisContent}

Analyze these results and select the ${maxCrawls} most valuable URLs to crawl for full content.

Respond with JSON:
{
  "selections": [
    {
      "index": 1,
      "url": "...",
      "reason": "Brief reason why this source is valuable",
      "expectedValue": "high|medium|low"
    }
  ],
  "reasoning": "Overall strategy for this query and why these sources were chosen"
}`
      }],
      options: {
        max_tokens: 600,
        temperature: 0.1
      }
    }, state.req);

    if (!crawlDecision.success) {
      throw new Error(`AI crawler agent failed: ${crawlDecision.error}`);
    }

    // Parse AI decision
    let decision;
    try {
      decision = JSON.parse(crawlDecision.content);
    } catch (parseError) {
      console.warn('[IntelligentCrawler] Failed to parse AI decision, falling back to top results');
      // Fallback: select top results by ranking
      decision = {
        selections: results.slice(0, maxCrawls).map((r, i) => ({
          index: i + 1,
          url: r.url,
          reason: 'Fallback selection - top ranked result',
          expectedValue: 'medium'
        })),
        reasoning: 'Fallback due to JSON parsing error'
      };
    }

    console.log(`[IntelligentCrawler] Selected ${decision.selections.length} URLs to crawl: ${decision.reasoning}`);

    // Log selected URLs for debugging
    decision.selections.forEach(sel => {
      console.log(`[IntelligentCrawler] Will crawl [${sel.index}]: ${sel.url} - ${sel.reason}`);
    });

    return {
      crawlDecisions: decision.selections,
      crawlMetadata: {
        strategy: decision.reasoning,
        totalResultsAnalyzed: results.length,
        maxCrawlsAllowed: maxCrawls,
        selectedCount: decision.selections.length,
        timeout
      }
    };

  } catch (error) {
    console.error('[WebSearchGraph] Intelligent crawler agent error:', error);
    return {
      crawlDecisions: [],
      error: `Crawler agent failed: ${error.message}`,
      crawlMetadata: { failed: true }
    };
  }
}

/**
 * Content Enricher Node: Performs actual crawling of selected URLs
 */
async function contentEnricherNode(state) {
  console.log('[WebSearchGraph] Running content enricher');

  try {
    if (!state.crawlDecisions || state.crawlDecisions.length === 0) {
      console.log('[ContentEnricher] No URLs selected for crawling');
      return {
        enrichedResults: state.webResults?.[0]?.results || [],
        crawlMetadata: {
          ...state.crawlMetadata,
          crawledCount: 0,
          nothingToCrawl: true
        }
      };
    }

    const webResults = state.webResults?.[0]?.results || [];
    const timeout = state.crawlMetadata?.timeout || 3000;

    // Perform parallel crawling of selected URLs
    console.log(`[ContentEnricher] Starting parallel crawl of ${state.crawlDecisions.length} URLs`);

    const crawlPromises = state.crawlDecisions.map(async (decision) => {
      try {
        const originalResult = webResults[decision.index - 1];
        if (!originalResult) {
          console.warn(`[ContentEnricher] Invalid index ${decision.index}, skipping`);
          return null;
        }

        console.log(`[ContentEnricher] Crawling: ${originalResult.url}`);

        const crawlResult = await urlCrawlerService.crawlUrl(originalResult.url, {
          timeout,
          maxContentLength: 50000 // 50KB limit
        });

        if (crawlResult.success && crawlResult.data?.content) {
          return {
            ...originalResult,
            content: crawlResult.data.content,
            contentType: 'full',
            fullContent: crawlResult.data.content,
            selectionReason: decision.reason,
            expectedValue: decision.expectedValue,
            crawlSuccess: true,
            wordCount: crawlResult.data.wordCount,
            extractedAt: new Date().toISOString()
          };
        } else {
          const errorMsg = crawlResult.data?.error || crawlResult.error || 'Unknown error';
          console.warn(`[ContentEnricher] Crawl failed for ${originalResult.url}: ${errorMsg}`);
          return {
            ...originalResult,
            contentType: 'snippet',
            crawlSuccess: false,
            crawlError: errorMsg
          };
        }
      } catch (error) {
        console.warn(`[ContentEnricher] Crawl error for ${decision.url}:`, error.message);
        const originalResult = webResults[decision.index - 1];
        return originalResult ? {
          ...originalResult,
          contentType: 'snippet',
          crawlSuccess: false,
          crawlError: error.message
        } : null;
      }
    });

    const crawlResults = await Promise.all(crawlPromises);
    const validResults = crawlResults.filter(r => r !== null);
    const successfulCrawls = validResults.filter(r => r.crawlSuccess).length;

    // Merge crawled results with non-crawled results
    const enrichedResults = webResults.map(originalResult => {
      const crawled = validResults.find(c => c.url === originalResult.url);
      if (crawled) {
        return crawled;
      }
      return {
        ...originalResult,
        contentType: 'snippet',
        content: originalResult.snippet || originalResult.content || ''
      };
    });

    console.log(`[ContentEnricher] Crawl completed: ${successfulCrawls}/${state.crawlDecisions.length} successful`);

    return {
      enrichedResults,
      crawlMetadata: {
        ...state.crawlMetadata,
        crawledCount: successfulCrawls,
        failedCount: state.crawlDecisions.length - successfulCrawls,
        totalEnriched: enrichedResults.length
      }
    };

  } catch (error) {
    console.error('[WebSearchGraph] Content enricher error:', error);
    return {
      enrichedResults: state.webResults?.[0]?.results || [],
      error: `Content enrichment failed: ${error.message}`,
      crawlMetadata: {
        ...state.crawlMetadata,
        crawledCount: 0,
        failed: true
      }
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
 * Intelligent Summary Node: Generate AI summary using enriched results (full content + snippets)
 */
async function intelligentSummaryNode(state) {
  if (state.mode !== 'normal') {
    return { summary: null };
  }

  console.log('[WebSearchGraph] Generating intelligent summary with enriched results');

  try {
    // Use enriched results if available, otherwise fall back to original web results
    let resultsToUse = state.enrichedResults;
    if (!resultsToUse || resultsToUse.length === 0) {
      const firstWebSearch = state.webResults?.[0];
      resultsToUse = firstWebSearch?.results || [];
    }

    if (resultsToUse.length === 0) {
      return {
        summary: {
          text: 'Keine Suchergebnisse zum Zusammenfassen verfügbar.',
          generated: false,
          error: 'No results to summarize'
        }
      };
    }

    console.log(`[IntelligentSummary] Processing ${resultsToUse.length} results (${resultsToUse.filter(r => r.contentType === 'full').length} with full content)`);

    // Separate full content from snippets
    const fullContentResults = resultsToUse.filter(r => r.contentType === 'full' && r.crawlSuccess);
    const snippetResults = resultsToUse.filter(r => r.contentType === 'snippet' || !r.crawlSuccess);

    // Build hierarchical references - prioritize full content
    let references = [];
    let refIndex = 1;

    // Primary sources (full content) - extract key paragraphs
    for (const result of fullContentResults.slice(0, 3)) {
      const keyContent = extractKeyParagraphs(result.fullContent || result.content, state.query, 400);
      references.push({
        id: refIndex++,
        title: result.title,
        content: keyContent,
        type: 'primary',
        source: result.url,
        reason: result.selectionReason || 'Full content crawled'
      });
    }

    // Supplementary sources (snippets) - up to 5 more
    for (const result of snippetResults.slice(0, 5)) {
      references.push({
        id: refIndex++,
        title: result.title,
        content: result.snippet || result.content || 'No preview available',
        type: 'supplementary',
        source: result.url
      });
    }

    if (references.length === 0) {
      return {
        summary: {
          text: 'Keine verwertbaren Inhalte zum Zusammenfassen gefunden.',
          generated: false,
          error: 'No usable content found'
        }
      };
    }

    // Build references summary for AI
    const referencesText = references.map(r => {
      const typeLabel = r.type === 'primary' ? '(VOLLTEXT)' : '(Snippet)';
      return `[${r.id}] ${r.title} ${typeLabel}: ${r.content.slice(0, 300)}`;
    }).join('\n\n');

    // Enhanced system prompt that handles mixed content types
    const systemPrompt = `Du bist ein Experte für intelligente Web-Zusammenfassungen. Du erhältst sowohl Volltext-Quellen als auch Snippets.

HIERARCHIE:
- VOLLTEXT-Quellen [1-${fullContentResults.length}]: Primärquellen mit vollständigem Inhalt
- Snippet-Quellen [${fullContentResults.length + 1}-${references.length}]: Ergänzende Kurzzusammenfassungen

ANWEISUNGEN:
- MAX. 800 Zeichen (ca. 3-4 Sätze)
- PRIORISIERE Volltext-Quellen für Zitationen
- Verwende [1], [2], [3] für alle wichtigen Aussagen
- NIEMALS "Quelle:", "laut", "nach" - NUR [1], [2], [3]
- Zusammenhängende Absätze, keine Listen

BEISPIEL: "Kommunaler Klimaschutz zeigt konkrete Erfolge [1]. Pop-up-Radwege werden dauerhaft übernommen [2]. Freiburg dient als Vorbild für andere Städte [3]."`;

    const userPrompt = `Erstelle eine präzise Zusammenfassung zu: "${state.query}"

MAX. 800 Zeichen! Fokussiere auf die wichtigsten Erkenntnisse mit [1], [2], [3] Zitationen.

Verfügbare Quellen (VOLLTEXT-Quellen bevorzugen):
${referencesText}

Crawl-Statistik: ${state.crawlMetadata?.crawledCount || 0} erfolgreich gecrawlt, ${state.crawlMetadata?.strategy || 'Standard-Auswahl'}`;

    const result = await state.aiWorkerPool.processRequest({
      type: 'web_search_summary',
      systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      options: {
        max_tokens: 500,
        temperature: 0.2
      }
    }, state.req);

    if (!result.success) {
      throw new Error(result.error);
    }

    // Build references map for citation validation
    const referencesMap = {};
    references.forEach((ref, index) => {
      referencesMap[String(ref.id)] = {
        title: ref.title,
        snippets: [[ref.content]],
        description: null,
        date: new Date().toISOString(),
        source: ref.type === 'primary' ? 'full_content' : 'web_snippet',
        url: ref.source,
        source_type: 'web',
        similarity_score: 1.0,
        chunk_index: 0
      };
    });

    // Process the AI response for citations
    const { cleanDraft, citations, citationSources, errors } = validateAndInjectCitations(
      result.content,
      referencesMap
    );

    // Log citation validation errors if any
    if (errors && errors.length > 0) {
      console.warn('[WebSearchGraph] Intelligent summary citation validation errors:', errors);
    }

    return {
      summary: {
        text: cleanDraft,
        generated: true
      },
      referencesMap,
      citations,
      citationSources,
      metadata: {
        summaryGenerated: true,
        citationsCount: citations?.length || 0,
        sourcesCount: citationSources?.length || 0,
        citationErrors: errors?.length || 0,
        intelligentCrawl: {
          fullContentSources: fullContentResults.length,
          snippetSources: snippetResults.length,
          crawlMetadata: state.crawlMetadata
        }
      }
    };

  } catch (error) {
    console.error('[WebSearchGraph] Intelligent summary generation error:', error);
    return {
      summary: {
        text: 'Fehler beim Generieren der intelligenten Zusammenfassung.',
        generated: false,
        error: error.message
      }
    };
  }
}

/**
 * Helper function to extract key paragraphs from full content based on query relevance
 */
function extractKeyParagraphs(content, query, maxLength = 400) {
  if (!content || content.length <= maxLength) {
    return content || '';
  }

  // Split content into paragraphs
  const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 50);

  // Simple relevance scoring based on query terms
  const queryTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 2);

  const scoredParagraphs = paragraphs.map(paragraph => {
    const lowerPara = paragraph.toLowerCase();
    const score = queryTerms.reduce((score, term) => {
      return score + (lowerPara.split(term).length - 1);
    }, 0);

    return { paragraph: paragraph.trim(), score };
  });

  // Sort by relevance and take top paragraphs that fit within maxLength
  scoredParagraphs.sort((a, b) => b.score - a.score);

  let result = '';
  for (const { paragraph } of scoredParagraphs) {
    if (result.length + paragraph.length + 3 <= maxLength) { // +3 for spacing
      result += (result ? '\n\n' : '') + paragraph;
    } else if (result.length === 0) {
      // If even the first paragraph is too long, truncate it
      result = paragraph.slice(0, maxLength - 3) + '...';
      break;
    } else {
      break;
    }
  }

  return result || content.slice(0, maxLength - 3) + '...';
}

/**
 * Dossier Node: Generate comprehensive research dossier for deep mode with citations
 */
async function dossierNode(state) {
  if (state.mode !== 'deep') {
    return { dossier: null };
  }

  console.log('[WebSearchGraph] Generating comprehensive research dossier with citations');

  try {
    // Combine all sources for citation reference building
    const allSources = [];

    // Add web search results
    if (state.aggregatedResults && state.aggregatedResults.length > 0) {
      const normalizedWebSources = state.aggregatedResults.map(normalizeSearchResult);
      allSources.push(...normalizedWebSources);
    }

    // Add Grundsatz document results
    if (state.grundsatzResults?.success && state.grundsatzResults.results?.length > 0) {
      const normalizedGrundsatzSources = state.grundsatzResults.results.map(result => ({
        ...normalizeSearchResult(result),
        source_type: 'official_document'
      }));
      allSources.push(...normalizedGrundsatzSources);
    }

    if (allSources.length === 0) {
      return {
        dossier: 'Keine Quellen für die Deep Research verfügbar.',
        metadata: { dossierGenerated: false }
      };
    }

    // Deduplicate and limit sources for citations
    const deduplicatedSources = dedupeAndDiversify(allSources, {
      limitPerDoc: 4,
      maxTotal: 12
    });

    // Build references map for citations
    const referencesMap = buildReferencesMap(deduplicatedSources);
    const refsSummary = summarizeReferencesForPrompt(referencesMap);

    // Enhanced system prompt with citations
    const dossierSystemPrompt = `Du bist ein Experte für politische Recherche und erstellst faktische, tiefgreifende Dossiers basierend auf verfügbaren Daten.

WICHTIG ZITATIONEN:
- Du MUSST bei wichtigen Aussagen, Fakten und Daten Quellenangaben verwenden
- Verwende [1], [2], [3] etc. um deine Aussagen zu belegen
- Zitiere besonders bei konkreten Zahlen, Aussagen von Personen, und spezifischen Fakten
- Die Zitationen machen dein Dossier vertrauenswürdig und nachprüfbar

WICHTIG INHALT:
- BEANTWORTE DIE NUTZERFRAGE DIREKT: Fokussiere dich primär darauf, die konkrete Frage des Nutzers zu beantworten
- Verwende FAKTEN aus den Quellen, keine Spekulationen
- Vermeide oberflächliche Stichpunkt-Listen
- Schreibe in zusammenhängenden, analytischen Absätzen
- Zitiere konkrete Daten, Zahlen und Aussagen aus den Quellen
- Keine Fantasie oder Vermutungen - nur das, was die Quellen hergeben

Struktur des Dossiers:
1. **Executive Summary** - DIREKTE Beantwortung der Nutzerfrage basierend auf verfügbaren Erkenntnissen (mit Zitationen)
2. **Position von Bündnis 90/Die Grünen** - Konkrete Aussagen aus Grundsatzprogrammen zur Frage (mit Zitationen)
3. **Faktenlage nach Themenbereichen** - Detaillierte Analyse der verfügbaren Informationen zur Beantwortung der Frage (mit Zitationen)
4. **Quellenbasierte Erkenntnisse** - Tiefere Analyse konkreter Daten und Aussagen die zur Antwort beitragen (mit Zitationen)

Verwende NUR die folgenden Quellenreferenzen:
${refsSummary}

WICHTIG: Verwende nur die Referenz-IDs [1], [2], [3] etc. die in der obigen Liste stehen.

Erstelle eine faktische, tiefgreifende Analyse die die Nutzerfrage beantwortet. Verwende zusammenhängende Absätze mit Quellenangaben.`;

    // Filter and prepare data for AI processing
    const filteredData = filterDataForAI(state.webResults, state.aggregatedResults, state.grundsatzResults);

    const dossierPrompt = `Erstelle ein faktisches Recherche-Dossier zur FRAGE: "${state.query}"

WICHTIGE ANWEISUNG: Die Nutzerfrage lautet "${state.query}" - BEANTWORTE DIESE FRAGE DIREKT mit den verfügbaren Daten!

Verwende dabei Quellenangaben [1], [2], [3] etc. bei wichtigen Aussagen.

Verfügbare Quellenreferenzen:
${refsSummary}

## Verfügbare Forschungsergebnisse:
${JSON.stringify(filteredData.webResults, null, 2)}

## Verfügbare Quellen mit Inhalten:
${JSON.stringify(filteredData.sources, null, 2)}

## Verfügbare Grundsatz-Position:
${JSON.stringify(filteredData.grundsatz, null, 2)}

ANWEISUNG:
- BEANTWORTE DIE KONKRETE FRAGE: "${state.query}" - das ist das Hauptziel!
- Analysiere diese Daten gründlich und faktisch um die Frage zu beantworten
- Schreibe in zusammenhängenden Absätzen, nicht in Listen
- Zitiere konkrete Aussagen und Daten aus den Quellen die zur Antwort beitragen [1], [2], [3]
- Entwickle tiefere Erkenntnisse aus den verfügbaren Informationen zur Beantwortung der Frage
- Verzichte auf Spekulationen oder allgemeine Aussagen ohne Quellenbeleg
- Fokussiere auf das, was die Quellen zur Beantwortung der Frage tatsächlich aussagen`;

    const result = await state.aiWorkerPool.processRequest({
      type: 'text_adjustment',
      systemPrompt: dossierSystemPrompt,
      messages: [{ role: "user", content: dossierPrompt }],
      options: {
        max_tokens: 6000,
        temperature: 0.3
      }
    }, state.req);

    if (!result.success) {
      throw new Error(result.error);
    }

    // Process the AI response for citations
    const { cleanDraft, citations, citationSources, errors } = validateAndInjectCitations(
      result.content,
      referencesMap
    );

    // Log citation validation errors if any
    if (errors && errors.length > 0) {
      console.warn('[WebSearchGraph] Dossier citation validation errors:', errors);
    }

    // Add methodology section (without citations)
    const methodologySection = buildMethodologySection(
      state.grundsatzResults,
      state.subqueries,
      state.aggregatedResults,
      state.categorizedSources
    );

    const completeDossier = cleanDraft + methodologySection;

    console.log('[WebSearchGraph] Dossier generation with citations completed');

    return {
      dossier: completeDossier,
      referencesMap,
      citations,
      citationSources,
      metadata: {
        dossierGenerated: true,
        dossierLength: completeDossier.length,
        citationsCount: citations?.length || 0,
        sourcesCount: citationSources?.length || 0,
        citationErrors: errors?.length || 0
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
        // Clean up potential code fences and markdown formatting
        let cleanContent = result.content.replace(/```json\s*|\s*```/g, '').trim();
        cleanContent = cleanContent.replace(/\*\*/g, ''); // Remove bold markdown
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
    .addNode("intelligentCrawler", intelligentCrawlerAgent)
    .addNode("contentEnricher", contentEnricherNode)
    .addNode("grundsatz", grundsatzNode)
    .addNode("aggregator", aggregatorNode)
    .addNode("summarizer", intelligentSummaryNode)
    .addNode("writer", dossierNode)
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

  // After searxng, run intelligent crawler to select URLs
  graph.addEdge("searxng", "intelligentCrawler");

  // After crawler decision, enrich content
  graph.addEdge("intelligentCrawler", "contentEnricher");

  // After content enrichment, route based on mode
  graph.addConditionalEdges(
    "contentEnricher",
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
        // Add citation support for normal mode
        citations: result.citations || [],
        citationSources: result.citationSources || [],
        metadata: {
          ...result.metadata,
          searchType: 'normal_web_search',
          duration: Date.now() - result.metadata.startTime,
          totalResults: webResults.length,
          citationsEnabled: !!(result.citations && result.citations.length > 0)
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
        // Add citation support for deep mode
        citations: result.citations || [],
        citationSources: result.citationSources || [],
        metadata: {
          ...result.metadata,
          searchType: 'deep_research',
          duration: Date.now() - result.metadata.startTime,
          hasOfficialPosition: !!(result.grundsatzResults?.success && result.grundsatzResults.results?.length > 0),
          citationsEnabled: !!(result.citations && result.citations.length > 0)
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