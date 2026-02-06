/**
 * Search Node
 *
 * Executes the appropriate search tool based on the classified intent.
 * Uses the direct search functions from the chat agents module.
 */

import type { ChatGraphState, SearchResult, Citation } from '../types.js';
import {
  executeDirectSearch,
  executeDirectPersonSearch,
  executeDirectExamplesSearch,
  executeDirectWebSearch,
  executeResearch,
} from '../../../../routes/chat/agents/directSearch.js';
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

    switch (intent) {
      case 'research': {
        // Multi-source research using the Perplexity-style research function
        const researchResult = await executeResearch({
          question: searchQuery || '',
          depth: 'quick',
          maxSources: 6,
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
        // Gruenerator document search (party programs, positions)
        const collection = agentConfig.toolRestrictions?.defaultCollection || 'deutschland';
        const searchResult = await executeDirectSearch({
          query: searchQuery || '',
          collection,
          limit: 5,
        });

        results = searchResult.results?.map((r: any) => ({
          source: 'gruenerator',
          title: r.source || r.title || collection,
          content: r.excerpt || r.snippet || '',
          url: r.url || undefined,
          relevance: r.relevance === 'Sehr hoch' ? 0.9 : r.relevance === 'Hoch' ? 0.7 : 0.5,
        })) || [];

        citations = buildCitations(results);
        break;
      }

      case 'person': {
        // Person search (Green politicians, MdB)
        const personResult = await executeDirectPersonSearch({
          query: searchQuery || '',
        });

        if (personResult.isPersonQuery && personResult.person) {
          // Add person info as first result
          results.push({
            source: 'person_info',
            title: personResult.person.name,
            content: [
              personResult.person.fraktion && `Fraktion: ${personResult.person.fraktion}`,
              personResult.person.wahlkreis && `Wahlkreis: ${personResult.person.wahlkreis}`,
              personResult.person.biografie,
            ]
              .filter(Boolean)
              .join('\n'),
            relevance: 1.0,
          });
        }

        // Add related content
        results.push(
          ...personResult.results?.map((r: any) => ({
            source: 'person_content',
            title: r.source || r.title,
            content: r.excerpt || '',
            url: r.url || undefined,
            relevance: r.relevance === 'Sehr hoch' ? 0.9 : r.relevance === 'Hoch' ? 0.7 : 0.5,
          })) || []
        );

        citations = buildCitations(results);
        break;
      }

      case 'web': {
        // Web search for current events and external content
        const webResult = await executeDirectWebSearch({
          query: searchQuery || '',
          searchType: 'general',
          maxResults: 5,
        });

        results = webResult.results?.map((r: any) => ({
          source: 'web',
          title: r.title,
          content: r.snippet || '',
          url: r.url,
          relevance: 1 - (r.rank - 1) * 0.15,
        })) || [];

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
