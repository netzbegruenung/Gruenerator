/**
 * Direct Search Service for Chat
 *
 * Provides direct Qdrant vector search for chat tools, bypassing the MCP server.
 * This enables the chat feature to search documents without requiring an external
 * MCP service to be running.
 *
 * Reuses the existing DocumentSearchService infrastructure that powers
 * the working notebook search functionality.
 */

import { generateText } from 'ai';

// import { getEnrichedPersonSearchService } from '../../../services/bundestag/index.js'; // DISABLED: Person search not production ready
import {
  getSearchParams,
  buildSubcategoryFilter,
  applyDefaultFilter,
  type SubcategoryFilters,
} from '../../../config/systemCollectionsConfig.js';
import { contentExamplesService } from '../../../services/contentExamplesService.js';
import { DocumentSearchService } from '../../../services/document-services/index.js';
import {
  validateCitations,
  stripUngroundedCitations,
} from '../../../services/search/CitationGrounder.js';
import { applyMMR } from '../../../services/search/DiversityReranker.js';
import { withRetry, searxngCircuit } from '../../../services/search/index.js';
import { searxngService } from '../../../services/search/SearxngService.js';
import { createLogger } from '../../../utils/logger.js';

import { getModel } from './providers.js';

import type { QdrantFilter } from '../../../database/services/QdrantService/types.js';

const log = createLogger('DirectSearch');

/**
 * Maps chat collection names to Qdrant collection names.
 * The chat uses simplified names while the backend uses full collection identifiers.
 */
const COLLECTION_MAP: Record<string, { qdrantCollection: string; systemId: string }> = {
  deutschland: {
    qdrantCollection: 'grundsatz_documents',
    systemId: 'grundsatz-system',
  },
  bundestagsfraktion: {
    qdrantCollection: 'bundestag_content',
    systemId: 'bundestagsfraktion-system',
  },
  kommunalwiki: {
    qdrantCollection: 'kommunalwiki_documents',
    systemId: 'kommunalwiki-system',
  },
  'gruene-de': {
    qdrantCollection: 'gruene_de_documents',
    systemId: 'gruene-de-system',
  },
  'gruene-at': {
    qdrantCollection: 'gruene_at_documents',
    systemId: 'gruene-at-system',
  },
  oesterreich: {
    qdrantCollection: 'oesterreich_gruene_documents',
    systemId: 'oesterreich-gruene-system',
  },
  examples: {
    qdrantCollection: 'social_media_examples',
    systemId: 'examples-system',
  },
  'boell-stiftung': {
    qdrantCollection: 'boell_stiftung_documents',
    systemId: 'boell-stiftung-system',
  },
  hamburg: {
    qdrantCollection: 'landesverbaende_documents',
    systemId: 'hamburg-system',
  },
  'schleswig-holstein': {
    qdrantCollection: 'landesverbaende_documents',
    systemId: 'schleswig-holstein-system',
  },
  thueringen: {
    qdrantCollection: 'landesverbaende_documents',
    systemId: 'thueringen-system',
  },
  bayern: {
    qdrantCollection: 'landesverbaende_documents',
    systemId: 'bayern-system',
  },
};

export interface DirectSearchResult {
  collection: string;
  query: string;
  searchMode: string;
  resultsCount: number;
  results: Array<{
    rank: number;
    relevance: string;
    source: string;
    url?: string;
    excerpt: string;
    searchMethod: string;
    contentType?: string;
  }>;
  cached?: boolean;
  error?: boolean;
  message?: string;
}

// DISABLED: Person search feature not production ready
// export interface DirectPersonResult {
//   isPersonQuery: boolean;
//   person?: {
//     name: string;
//     fraktion?: string;
//     wahlkreis?: string;
//     biografie?: string;
//   };
//   results: Array<{
//     rank: number;
//     relevance: string;
//     source: string;
//     url?: string;
//     type: string;
//     excerpt: string;
//   }>;
//   error?: boolean;
//   message?: string;
// }

export interface DirectExamplesResult {
  resultsCount: number;
  examples: Array<{
    id: string;
    platform: string;
    content: string;
    imageUrl?: string;
    author?: string;
    date?: string;
  }>;
  error?: boolean;
  message?: string;
}

export interface DirectWebSearchResult {
  query: string;
  searchType: string;
  resultsCount: number;
  results: Array<{
    rank: number;
    title: string;
    url: string;
    snippet: string;
    domain: string;
    publishedDate?: string | null;
  }>;
  suggestions?: string[];
  error?: boolean;
  message?: string;
}

const documentSearchService = new DocumentSearchService();

/**
 * Execute a direct document search against Qdrant.
 * Replaces the MCP tool call for gruenerator_search.
 */
export async function executeDirectSearch(params: {
  query: string;
  collection?: string;
  limit?: number;
  filters?: SubcategoryFilters;
}): Promise<DirectSearchResult> {
  const { query, collection = 'deutschland', limit = 5, filters } = params;

  log.info(
    `[Direct Search] query="${query}" collection="${collection}" limit=${limit}${filters ? ` filters=${JSON.stringify(filters)}` : ''}`
  );

  const mapping = COLLECTION_MAP[collection];
  if (!mapping) {
    log.warn(`[Direct Search] Unknown collection: ${collection}, falling back to deutschland`);
  }

  const { qdrantCollection, systemId } = mapping || COLLECTION_MAP.deutschland;
  const searchParams = getSearchParams(systemId);

  // Build filter: merge collection default filter with user-detected filters
  const collectionDefault = applyDefaultFilter(systemId);
  const userFilter = buildSubcategoryFilter(filters);
  let additionalFilter: QdrantFilter | undefined;

  if (collectionDefault && userFilter) {
    // Merge both must arrays
    additionalFilter = {
      must: [...(collectionDefault.must || []), ...(userFilter.must || [])] as QdrantFilter['must'],
    };
  } else {
    additionalFilter = userFilter || collectionDefault;
  }

  try {
    let response = await documentSearchService.search({
      query,
      userId: undefined,
      options: {
        limit: Math.min(limit * 2, 30),
        mode: 'hybrid',
        vectorWeight: searchParams.vectorWeight,
        textWeight: searchParams.textWeight,
        threshold: searchParams.threshold,
        searchCollection: qdrantCollection,
        recallLimit: searchParams.recallLimit,
        qualityMin: searchParams.qualityMin,
        additionalFilter,
      },
    });

    if (!response.success || !response.results || response.results.length === 0) {
      // If we had user filters, retry without them (over-filtering fallback)
      if (userFilter) {
        log.info(
          `[Direct Search] No results with filters, retrying without user filters for "${query}" in ${collection}`
        );
        const fallbackFilter = collectionDefault;
        const fallbackResponse = await documentSearchService.search({
          query,
          userId: undefined,
          options: {
            limit: Math.min(limit * 2, 30),
            mode: 'hybrid',
            vectorWeight: searchParams.vectorWeight,
            textWeight: searchParams.textWeight,
            threshold: searchParams.threshold,
            searchCollection: qdrantCollection,
            recallLimit: searchParams.recallLimit,
            qualityMin: searchParams.qualityMin,
            additionalFilter: fallbackFilter,
          },
        });
        if (fallbackResponse.success && fallbackResponse.results?.length > 0) {
          log.info(
            `[Direct Search] Fallback without filters found ${fallbackResponse.results.length} results`
          );
          response = fallbackResponse;
        }
      }

      if (!response.success || !response.results || response.results.length === 0) {
        log.info(`[Direct Search] No results found for query: "${query}" in ${collection}`);
        return {
          collection,
          query,
          searchMode: 'hybrid',
          resultsCount: 0,
          results: [],
          message: 'Keine Ergebnisse gefunden.',
        };
      }
    }

    const formattedResults = response.results.slice(0, limit).map((result: any, index: number) => ({
      rank: index + 1,
      relevance: formatRelevance(result.score || result.similarity || 0),
      source: result.title || result.document_title || 'Unbekannte Quelle',
      url: result.source_url || result.url || undefined,
      excerpt: truncateText(result.snippet || result.chunk_text || result.content || '', 800),
      searchMethod: result.searchMethod || 'hybrid',
      contentType: result.top_chunks?.[0]?.content_type || result.content_type || undefined,
    }));

    log.info(`[Direct Search] Found ${formattedResults.length} results for "${query}"`);

    return {
      collection,
      query,
      searchMode: 'hybrid',
      resultsCount: formattedResults.length,
      results: formattedResults,
    };
  } catch (error: any) {
    log.error(`[Direct Search] Error searching ${collection}:`, error.message);
    return {
      collection,
      query,
      searchMode: 'hybrid',
      resultsCount: 0,
      results: [],
      error: true,
      message: `Suche fehlgeschlagen: ${error.message}`,
    };
  }
}

// DISABLED: Person search feature not production ready
// Only searches 80 cached Green MPs, returns 0 results for anyone else
// /**
//  * Execute a direct person search.
//  * Replaces the MCP tool call for gruenerator_person_search.
//  */
// export async function executeDirectPersonSearch(params: {
//   query: string;
// }): Promise<DirectPersonResult> {
//   const { query } = params;
//
//   log.info(`[Direct Person Search] query="${query}"`);
//
//   try {
//     const enrichedService = getEnrichedPersonSearchService();
//     const result = await enrichedService.search(query);
//
//     if (!result.isPersonQuery || !result.person) {
//       log.info(`[Direct Person Search] No person detected in query: "${query}"`);
//       return {
//         isPersonQuery: false,
//         results: [],
//         message: 'Keine Person in der Anfrage erkannt.',
//       };
//     }
//
//     const { person, contentMentions = [], drucksachen = [], aktivitaeten = [] } = result;
//
//     const formattedResults: DirectPersonResult['results'] = [];
//     let rank = 1;
//
//     for (const mention of contentMentions.slice(0, 5)) {
//       formattedResults.push({
//         rank: rank++,
//         relevance: formatRelevance(mention.similarity || 0.8),
//         source: mention.title,
//         url: mention.url,
//         type: 'Erwähnung',
//         excerpt: truncateText(mention.snippet || '', 300),
//       });
//     }
//
//     for (const drucksache of drucksachen.slice(0, 3)) {
//       formattedResults.push({
//         rank: rank++,
//         relevance: 'Hoch',
//         source: drucksache.titel,
//         url: `https://dip.bundestag.de/drucksache/${drucksache.dokumentnummer}`,
//         type: drucksache.drucksachetyp || 'Drucksache',
//         excerpt: `${drucksache.drucksachetyp} ${drucksache.dokumentnummer} vom ${drucksache.datum}`,
//       });
//     }
//
//     for (const aktivitaet of aktivitaeten.slice(0, 3)) {
//       formattedResults.push({
//         rank: rank++,
//         relevance: 'Mittel',
//         source: aktivitaet.titel || aktivitaet.aktivitaetsart,
//         type: aktivitaet.aktivitaetsart,
//         excerpt: `${aktivitaet.aktivitaetsart} vom ${aktivitaet.datum}`,
//       });
//     }
//
//     log.info(`[Direct Person Search] Found person: ${person.name}, ${formattedResults.length} results`);
//
//     return {
//       isPersonQuery: true,
//       person: {
//         name: person.name,
//         fraktion: person.fraktion,
//         wahlkreis: person.wahlkreis,
//         biografie: person.biografie || person.vita,
//       },
//       results: formattedResults,
//     };
//   } catch (error: any) {
//     log.error(`[Direct Person Search] Error:`, error.message);
//     return {
//       isPersonQuery: false,
//       results: [],
//       error: true,
//       message: `Personensuche fehlgeschlagen: ${error.message}`,
//     };
//   }
// }

/**
 * Execute a direct examples search for social media examples.
 * Replaces the MCP tool call for gruenerator_examples_search.
 * Uses the dedicated contentExamplesService for social media examples.
 *
 * @param params.country - Optional country filter ('DE' or 'AT') for country-specific agents
 */
export async function executeDirectExamplesSearch(params: {
  query: string;
  platform?: string;
  country?: 'DE' | 'AT';
}): Promise<DirectExamplesResult> {
  const { query, platform, country } = params;

  const countryInfo = country ? ` country="${country}"` : '';
  log.info(
    `[Direct Examples Search] query="${query}" platform="${platform || 'all'}"${countryInfo}`
  );

  try {
    const results = await contentExamplesService.searchSocialMediaExamples(query, {
      platform: platform as 'facebook' | 'instagram' | null,
      limit: 10,
      threshold: 0.15,
      country: country || null,
    });

    if (!results || results.length === 0) {
      log.info(`[Direct Examples Search] No examples found, trying random examples`);

      const randomResults = await contentExamplesService.getRandomSocialMediaExamples({
        platform: platform as 'facebook' | 'instagram' | null,
        limit: 5,
        country: country || null,
      });

      if (!randomResults || randomResults.length === 0) {
        return {
          resultsCount: 0,
          examples: [],
          message: 'Keine Beispiele gefunden.',
        };
      }

      const examples = randomResults.map((result: any) => ({
        id: String(result.id),
        platform: result.platform || platform || 'unknown',
        content: truncateText(result.content || '', 500),
        imageUrl: undefined,
        author: result.source_account || undefined,
        date: result.created_at || undefined,
      }));

      log.info(`[Direct Examples Search] Found ${examples.length} random examples`);
      return {
        resultsCount: examples.length,
        examples,
      };
    }

    const examples = results.map((result: any) => ({
      id: String(result.id),
      platform: result.platform || platform || 'unknown',
      content: truncateText(result.content || '', 500),
      imageUrl: undefined,
      author: result.source_account || undefined,
      date: result.created_at || undefined,
    }));

    log.info(`[Direct Examples Search] Found ${examples.length} examples`);

    return {
      resultsCount: examples.length,
      examples,
    };
  } catch (error: any) {
    log.error(`[Direct Examples Search] Error:`, error.message);
    return {
      resultsCount: 0,
      examples: [],
      error: true,
      message: `Beispielsuche fehlgeschlagen: ${error.message}`,
    };
  }
}

/**
 * Execute a web search using SearXNG.
 * Provides access to current web content for queries about recent events or
 * topics not covered in the document collections.
 */
export async function executeDirectWebSearch(params: {
  query: string;
  searchType?: 'general' | 'news';
  maxResults?: number;
  timeRange?: string;
}): Promise<DirectWebSearchResult> {
  const { query, searchType = 'general', maxResults = 5, timeRange } = params;

  log.info(`[Direct Web Search] query="${query}" type="${searchType}" max=${maxResults}`);

  try {
    const searchOptions: Record<string, any> = {
      maxResults: Math.min(maxResults, 10),
      language: 'de-DE',
      safesearch: 0,
      categories: searchType === 'news' ? 'news' : 'general',
      page: 1,
    };

    if (timeRange) {
      searchOptions.time_range = timeRange;
    }

    const searchResults = await withRetry(
      () => searxngService.performWebSearch(query, searchOptions),
      { maxRetries: 1, delayMs: 500, label: 'DirectWebSearch' }
    );

    if (!searchResults.success || !searchResults.results || searchResults.results.length === 0) {
      log.info(`[Direct Web Search] No results found for: "${query}"`);
      return {
        query,
        searchType,
        resultsCount: 0,
        results: [],
        message: 'Keine Websuche-Ergebnisse gefunden.',
      };
    }

    const formattedResults = searchResults.results.slice(0, maxResults).map((result: any) => ({
      rank: result.rank,
      title: result.title || 'Unbekannt',
      url: result.url,
      snippet: truncateText(result.content || result.snippet || '', 300),
      domain: result.domain || extractDomain(result.url),
      publishedDate: result.publishedDate || null,
    }));

    log.info(`[Direct Web Search] Found ${formattedResults.length} results for "${query}"`);

    return {
      query,
      searchType,
      resultsCount: formattedResults.length,
      results: formattedResults,
      suggestions: searchResults.suggestions?.slice(0, 3),
    };
  } catch (error: any) {
    log.error(`[Direct Web Search] Error:`, error.message);
    return {
      query,
      searchType,
      resultsCount: 0,
      results: [],
      error: true,
      message: `Websuche fehlgeschlagen: ${error.message}`,
    };
  }
}

/**
 * Extract domain from URL.
 */
function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace('www.', '');
  } catch {
    return 'unknown';
  }
}

/**
 * Format a relevance score as a human-readable string.
 */
function formatRelevance(score: number): string {
  if (score >= 0.8) return 'Sehr hoch';
  if (score >= 0.6) return 'Hoch';
  if (score >= 0.4) return 'Mittel';
  if (score >= 0.2) return 'Niedrig';
  return 'Gering';
}

/**
 * Truncate text to a maximum length, adding ellipsis if needed.
 */
function truncateText(text: string, maxLength: number): string {
  if (!text) return '';
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.substring(0, maxLength).trim() + '...';
}

// ============================================================================
// RESEARCH AGENT - Perplexity-style structured research
// ============================================================================

export interface ResearchCitation {
  id: number;
  title: string;
  url: string;
  domain: string;
  snippet: string;
}

export interface ResearchResult {
  answer: string;
  citations: ResearchCitation[];
  followUpQuestions: string[];
  searchSteps: Array<{
    tool: string;
    query: string;
    resultsCount: number;
  }>;
  confidence: 'high' | 'medium' | 'low';
}

interface SearchPlan {
  queries: Array<{
    // DISABLED: gruenerator_person_search - not production ready
    tool: 'web_search' | 'gruenerator_search';
    query: string;
    priority: number;
    reason: string;
  }>;
  synthesisStrategy: string;
}

interface CollectedSource {
  id: number;
  title: string;
  url: string;
  domain: string;
  snippet: string;
  relevance: number;
  sourceType: 'web' | 'document' | 'person';
}

/**
 * Plan research by analyzing the question and determining search strategy.
 * Uses heuristics to decide which sources to query.
 */
function planResearch(question: string): SearchPlan {
  const q = question.toLowerCase();
  const queries: SearchPlan['queries'] = [];

  // Detect question type
  // DISABLED: Person search not production ready
  // const isPersonQuery = /\b(wer ist|wer war|politiker|abgeordnet|minister|kandidat)\b/i.test(q);
  const isPartyQuery = /\b(grüne|partei|programm|position|wahlprogramm|beschluss|antrag)\b/i.test(
    q
  );
  const isCurrentEvents = /\b(aktuell|heute|gestern|diese woche|kürzlich|news|nachricht)\b/i.test(
    q
  );
  const isLocalQuery = /\b(ort|stadt|stadtteil|region|gemeinde|kreis|wahlkreis)\b/i.test(q);

  // DISABLED: Person search not production ready
  // Extract potential person names (capitalized words that aren't at sentence start)
  // const personNameMatch = question.match(/\b[A-ZÄÖÜ][a-zäöüß]+\s+[A-ZÄÖÜ][a-zäöüß]+\b/g);
  // const hasPersonName = personNameMatch && personNameMatch.length > 0;

  // DISABLED: Person search not production ready
  // Priority 1: Person search if names detected or explicit person query
  // if (hasPersonName || isPersonQuery) {
  //   const personName = personNameMatch?.[0] || question.split(/\s+/).slice(0, 3).join(' ');
  //   queries.push({
  //     tool: 'gruenerator_person_search',
  //     query: personName,
  //     priority: 1,
  //     reason: 'Person name detected in query',
  //   });
  // }

  // Priority 2: Party documents for policy questions
  if (isPartyQuery && !isCurrentEvents) {
    queries.push({
      tool: 'gruenerator_search',
      query: question,
      priority: 2,
      reason: 'Query relates to party positions/programs',
    });
  }

  // Priority 3: Web search for current events or supplementary info
  if (isCurrentEvents || queries.length === 0) {
    queries.push({
      tool: 'web_search',
      query: question,
      priority: isCurrentEvents ? 1 : 3,
      reason: isCurrentEvents ? 'Query about current events' : 'General information search',
    });
  }

  // Add local/geographic web search if location mentioned
  if (isLocalQuery && !queries.some((q) => q.tool === 'web_search')) {
    queries.push({
      tool: 'web_search',
      query: question,
      priority: 2,
      reason: 'Local/geographic information needed',
    });
  }

  // Sort by priority
  queries.sort((a, b) => a.priority - b.priority);

  return {
    queries,
    // DISABLED: Person search not production ready - removed biographical_summary strategy
    synthesisStrategy: isPartyQuery ? 'policy_overview' : 'factual_synthesis',
  };
}

/**
 * Execute all planned searches and collect sources.
 */
async function executeSearches(
  plan: SearchPlan
): Promise<{ sources: CollectedSource[]; searchSteps: ResearchResult['searchSteps'] }> {
  const sources: CollectedSource[] = [];
  const searchSteps: ResearchResult['searchSteps'] = [];
  let sourceId = 1;

  for (const query of plan.queries) {
    try {
      switch (query.tool) {
        case 'web_search': {
          const webResults = await executeDirectWebSearch({
            query: query.query,
            searchType: 'general',
            maxResults: 5,
          });
          searchSteps.push({
            tool: 'web_search',
            query: query.query,
            resultsCount: webResults.resultsCount,
          });
          for (const result of webResults.results) {
            sources.push({
              id: sourceId++,
              title: result.title,
              url: result.url,
              domain: result.domain,
              snippet: result.snippet,
              relevance: 1 - (result.rank - 1) * 0.1,
              sourceType: 'web',
            });
          }
          break;
        }

        case 'gruenerator_search': {
          const docResults = await executeDirectSearch({
            query: query.query,
            collection: 'deutschland',
            limit: 5,
          });
          searchSteps.push({
            tool: 'gruenerator_search',
            query: query.query,
            resultsCount: docResults.resultsCount,
          });
          for (const result of docResults.results) {
            sources.push({
              id: sourceId++,
              title: result.source,
              url: result.url || '',
              domain: 'gruene.de',
              snippet: result.excerpt,
              relevance:
                result.relevance === 'Sehr hoch' ? 0.9 : result.relevance === 'Hoch' ? 0.7 : 0.5,
              sourceType: 'document',
            });
          }
          break;
        }

        // DISABLED: Person search not production ready
        // case 'gruenerator_person_search': {
        //   const personResults = await executeDirectPersonSearch({ query: query.query });
        //   searchSteps.push({
        //     tool: 'gruenerator_person_search',
        //     query: query.query,
        //     resultsCount: personResults.isPersonQuery ? personResults.results.length + 1 : 0,
        //   });
        //   if (personResults.isPersonQuery && personResults.person) {
        //     sources.push({
        //       id: sourceId++,
        //       title: `${personResults.person.name} - Bundestag`,
        //       url: `https://www.bundestag.de/abgeordnete`,
        //       domain: 'bundestag.de',
        //       snippet: personResults.person.biografie || `${personResults.person.fraktion || ''} · ${personResults.person.wahlkreis || ''}`,
        //       relevance: 0.95,
        //       sourceType: 'person',
        //     });
        //   }
        //   for (const result of personResults.results.slice(0, 3)) {
        //     sources.push({
        //       id: sourceId++,
        //       title: result.source,
        //       url: result.url || '',
        //       domain: result.url ? extractDomain(result.url) : 'bundestag.de',
        //       snippet: result.excerpt,
        //       relevance: result.relevance === 'Sehr hoch' ? 0.9 : result.relevance === 'Hoch' ? 0.7 : 0.5,
        //       sourceType: 'person',
        //     });
        //   }
        //   break;
        // }
      }
    } catch (error) {
      log.error(`[Research] Search failed for ${query.tool}:`, error);
      searchSteps.push({
        tool: query.tool,
        query: query.query,
        resultsCount: 0,
      });
    }
  }

  // Sort sources by relevance and deduplicate by URL
  const seenUrls = new Set<string>();
  const uniqueSources = sources.filter((s) => {
    if (!s.url || seenUrls.has(s.url)) return !s.url ? true : false;
    seenUrls.add(s.url);
    return true;
  });

  uniqueSources.sort((a, b) => b.relevance - a.relevance);

  // Re-number sources after deduplication
  return {
    sources: uniqueSources.slice(0, 10).map((s, i) => ({ ...s, id: i + 1 })),
    searchSteps,
  };
}

/**
 * Generate follow-up questions based on the original question and sources.
 */
function generateFollowUpQuestions(question: string, sources: CollectedSource[]): string[] {
  const followUps: string[] = [];
  const q = question.toLowerCase();

  // Person-related follow-ups
  if (/\b(wer|person|politiker)\b/i.test(q)) {
    followUps.push('Welche politischen Positionen vertritt diese Person?');
    followUps.push('Welche aktuellen Projekte oder Initiativen gibt es?');
  }

  // Policy-related follow-ups
  if (/\b(politik|position|programm|thema)\b/i.test(q)) {
    followUps.push('Wie hat sich diese Position in den letzten Jahren entwickelt?');
    followUps.push('Welche Beschlüsse gibt es zu diesem Thema?');
  }

  // Location-related follow-ups
  if (/\b(ort|stadt|region|wahlkreis)\b/i.test(q)) {
    followUps.push('Wer sind die lokalen Grünen-Vertreter*innen?');
    followUps.push('Welche lokalen Initiativen gibt es?');
  }

  // Generic follow-ups if nothing specific
  if (followUps.length === 0) {
    followUps.push('Gibt es aktuelle Entwicklungen zu diesem Thema?');
    followUps.push('Welche weiteren Informationen sind verfügbar?');
  }

  return followUps.slice(0, 3);
}

/**
 * Synthesize sources into a Perplexity-style answer with inline citations.
 * This is a template-based approach - for better results, use an LLM call.
 */
function synthesizeAnswer(
  question: string,
  sources: CollectedSource[],
  strategy: string
): { answer: string; confidence: 'high' | 'medium' | 'low' } {
  if (sources.length === 0) {
    return {
      answer: 'Zu dieser Anfrage konnten leider keine relevanten Informationen gefunden werden.',
      confidence: 'low',
    };
  }

  // Build answer from sources with inline citations
  const paragraphs: string[] = [];
  const usedSources = new Set<number>();

  // Group sources by type
  const personSources = sources.filter((s) => s.sourceType === 'person');
  const docSources = sources.filter((s) => s.sourceType === 'document');
  const webSources = sources.filter((s) => s.sourceType === 'web');

  // Lead with most relevant information
  if (personSources.length > 0 && strategy === 'biographical_summary') {
    const mainPerson = personSources[0];
    paragraphs.push(`${mainPerson.snippet} [${mainPerson.id}]`);
    usedSources.add(mainPerson.id);

    // Add additional person context
    for (const src of personSources.slice(1, 3)) {
      if (src.snippet && src.snippet.length > 50) {
        paragraphs.push(`${truncateText(src.snippet, 200)} [${src.id}]`);
        usedSources.add(src.id);
      }
    }
  }

  // Add document sources for policy context
  if (docSources.length > 0 && (strategy === 'policy_overview' || paragraphs.length === 0)) {
    for (const src of docSources.slice(0, 2)) {
      if (src.snippet) {
        paragraphs.push(`${truncateText(src.snippet, 250)} [${src.id}]`);
        usedSources.add(src.id);
      }
    }
  }

  // Add web sources for current/supplementary info
  if (webSources.length > 0) {
    const relevantWeb = webSources.slice(0, paragraphs.length === 0 ? 3 : 2);
    for (const src of relevantWeb) {
      if (src.snippet) {
        paragraphs.push(`${truncateText(src.snippet, 200)} [${src.id}]`);
        usedSources.add(src.id);
      }
    }
  }

  // Determine confidence based on source quality and quantity
  let confidence: 'high' | 'medium' | 'low' = 'medium';
  if (usedSources.size >= 3 && sources.some((s) => s.relevance > 0.8)) {
    confidence = 'high';
  } else if (usedSources.size < 2) {
    confidence = 'low';
  }

  return {
    answer: paragraphs.join('\n\n'),
    confidence,
  };
}

/**
 * Synthesize sources into a coherent answer using Mistral-small LLM.
 * Produces higher quality prose than template-based synthesis.
 *
 * @param question - The user's research question
 * @param sources - Collected sources from various searches
 * @param strategy - Synthesis strategy (policy_overview, factual_synthesis, etc.)
 * @returns Synthesized answer with confidence level
 */
async function synthesizeAnswerWithLLM(
  question: string,
  sources: CollectedSource[],
  strategy: string
): Promise<{ answer: string; confidence: 'high' | 'medium' | 'low' }> {
  if (sources.length === 0) {
    return {
      answer: 'Zu dieser Anfrage konnten leider keine relevanten Informationen gefunden werden.',
      confidence: 'low',
    };
  }

  const aiModel = getModel('mistral', 'mistral-small-latest');

  const systemPrompt = `Du bist ein Recherche-Assistent der Grünen Partei. Synthetisiere die gegebenen Quellen zu einer kohärenten, informativen Antwort auf Deutsch.

Regeln:
- Nutze NUR Informationen aus den gegebenen Quellen
- Verwende Inline-Zitate [1], [2] etc. für jede Aussage, die sich auf eine Quelle bezieht
- Schreibe 2-4 prägnante, gut strukturierte Absätze
- Keine Erfindungen oder externes Wissen hinzufügen
- Antworte immer auf Deutsch
- Fasse die wichtigsten Informationen zusammen und stelle Zusammenhänge her
- Strategie: ${strategy === 'policy_overview' ? 'Fokussiere auf politische Positionen und Beschlüsse' : 'Fasse die faktischen Informationen objektiv zusammen'}`;

  const sourcesText = sources
    .map((s, i) => `[${i + 1}] ${s.title} (${s.domain})\n${s.snippet}`)
    .join('\n\n');

  try {
    const result = await generateText({
      model: aiModel,
      messages: [
        {
          role: 'user',
          content: `Frage: ${question}\n\nQuellen:\n${sourcesText}`,
        },
      ],
      system: systemPrompt,
      temperature: 0.2,
      maxOutputTokens: sources.length > 6 ? 1500 : 500,
    });

    // Determine confidence based on source quality and quantity
    let confidence: 'high' | 'medium' | 'low' = 'medium';
    if (sources.length >= 3 && sources.some((s) => s.relevance > 0.8)) {
      confidence = 'high';
    } else if (sources.length < 2) {
      confidence = 'low';
    }

    return {
      answer: result.text,
      confidence,
    };
  } catch (error: any) {
    log.error('[Research] LLM synthesis failed:', error.message);
    throw error;
  }
}

/**
 * Synthesize answer with automatic fallback to template-based synthesis.
 * Uses LLM synthesis by default, falls back gracefully on errors.
 */
async function synthesizeWithFallback(
  question: string,
  sources: CollectedSource[],
  strategy: string,
  useLLM: boolean
): Promise<{ answer: string; confidence: 'high' | 'medium' | 'low' }> {
  if (!useLLM) {
    return synthesizeAnswer(question, sources, strategy);
  }

  try {
    return await synthesizeAnswerWithLLM(question, sources, strategy);
  } catch (error: any) {
    log.warn('[Research] LLM synthesis failed, falling back to template', {
      error: error.message,
    });
    return synthesizeAnswer(question, sources, strategy);
  }
}

/**
 * Execute a structured research workflow with planning, searching, and synthesis.
 * This is the main entry point for the research tool.
 *
 * @param params.question - The research question to answer
 * @param params.depth - Search depth: 'quick' (default) or 'thorough'
 * @param params.maxSources - Maximum number of sources to include (default: 8)
 * @param params.useLLMSynthesis - Use Mistral-small for coherent synthesis (default: true)
 */
export async function executeResearch(params: {
  question: string;
  depth?: 'quick' | 'thorough';
  maxSources?: number;
  useLLMSynthesis?: boolean;
}): Promise<ResearchResult> {
  const { question, depth = 'quick', maxSources = 8, useLLMSynthesis = true } = params;

  log.info(`[Research] Starting research for: "${truncateText(question, 100)}" (depth: ${depth})`);

  // Phase 1: Plan the research
  const plan = planResearch(question);

  // Limit queries based on depth
  const maxQueries = depth === 'thorough' ? 5 : 3;
  plan.queries = plan.queries.slice(0, maxQueries);

  // For thorough mode, ensure both web and document search are included per topic
  if (depth === 'thorough') {
    const hasWeb = plan.queries.some((q) => q.tool === 'web_search');
    const hasDoc = plan.queries.some((q) => q.tool === 'gruenerator_search');
    if (!hasWeb) {
      plan.queries.push({
        tool: 'web_search',
        query: question,
        priority: 3,
        reason: 'Thorough: supplementary web search',
      });
    }
    if (!hasDoc) {
      plan.queries.push({
        tool: 'gruenerator_search',
        query: question,
        priority: 3,
        reason: 'Thorough: supplementary document search',
      });
    }
    plan.queries = plan.queries.slice(0, maxQueries);
  }

  log.info(
    `[Research] Plan: ${plan.queries.length} queries (depth: ${depth}), strategy: ${plan.synthesisStrategy}`
  );

  // Phase 2: Execute searches
  const { sources, searchSteps } = await executeSearches(plan);
  log.info(`[Research] Collected ${sources.length} sources from ${searchSteps.length} searches`);

  // B3: Apply MMR diversity to sources before synthesis
  const diverseSources =
    sources.length > 3
      ? (applyMMR(
          sources.map((s) => ({ ...s, relevance: s.relevance, content: s.snippet })),
          0.7,
          2
        ).map((s, i) => ({ ...s, id: i + 1 })) as CollectedSource[])
      : sources;

  // Phase 3: Synthesize answer
  const limitedSources = diverseSources.slice(0, maxSources);
  log.info(`[Research] Synthesizing with ${useLLMSynthesis ? 'LLM (mistral-small)' : 'template'}`);
  let { answer, confidence } = await synthesizeWithFallback(
    question,
    limitedSources,
    plan.synthesisStrategy,
    useLLMSynthesis
  );

  // B4: Validate citation grounding
  if (useLLMSynthesis && answer) {
    const groundingResult = validateCitations(
      answer,
      limitedSources.map((s) => ({ id: s.id, content: s.snippet }))
    );

    if (groundingResult.ungroundedCitations.length > 0) {
      log.warn(
        `[Research] ${groundingResult.ungroundedCitations.length} ungrounded citations removed: [${groundingResult.ungroundedCitations.join(', ')}]`
      );
      answer = stripUngroundedCitations(answer, groundingResult.ungroundedCitations);

      // If >50% ungrounded, fall back to template synthesis
      if (groundingResult.confidence < 0.5 && groundingResult.totalCitations > 2) {
        log.warn('[Research] >50% citations ungrounded, falling back to template synthesis');
        const fallback = synthesizeAnswer(question, limitedSources, plan.synthesisStrategy);
        answer = fallback.answer;
        confidence = fallback.confidence;
      }
    }
  }

  // Generate follow-up questions
  const followUpQuestions = generateFollowUpQuestions(question, limitedSources);

  // Build citations list
  const citations: ResearchCitation[] = limitedSources.map((s) => ({
    id: s.id,
    title: s.title,
    url: s.url,
    domain: s.domain,
    snippet: truncateText(s.snippet, 150),
  }));

  log.info(`[Research] Complete: ${citations.length} citations, confidence: ${confidence}`);

  return {
    answer,
    citations,
    followUpQuestions,
    searchSteps,
    confidence,
  };
}
