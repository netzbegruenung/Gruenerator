/**
 * MistralWebSearchService Result Extraction
 * Handles extraction and formatting of search results from Mistral conversation outputs
 */

import type { SearchResults, SearchSource, AgentType } from './types.js';

/**
 * Extract domain from URL for display purposes
 * @param url - Full URL
 * @returns Domain name
 */
export function extractDomainFromUrl(url: string): string {
  try {
    const urlObject = new URL(url);
    return urlObject.hostname.replace('www.', '');
  } catch (error) {
    return url;
  }
}

/**
 * Extract relevant snippet from text content
 * @param fullText - Full text content
 * @param title - Reference title for context
 * @returns Relevant snippet
 */
export function extractSnippetFromContent(fullText: string, title: string): string {
  if (!fullText || fullText.length < 50) {
    return fullText || 'No content available';
  }

  // Try to find content around the title or just return first 200 chars
  const maxLength = 200;
  if (fullText.length <= maxLength) {
    return fullText.trim();
  }

  // Return first 200 characters with proper word boundary
  const snippet = fullText.substring(0, maxLength);
  const lastSpace = snippet.lastIndexOf(' ');

  if (lastSpace > maxLength * 0.8) {
    return snippet.substring(0, lastSpace).trim() + '...';
  }

  return snippet.trim() + '...';
}

/**
 * Extract and format search results from Mistral conversation outputs
 * @param outputs - Conversation outputs from Mistral
 * @param originalQuery - Original search query
 * @param agentType - Type of agent used for search
 * @returns Formatted search results
 */
export function extractSearchResults(
  outputs: any[],
  originalQuery: string,
  agentType: AgentType = 'withSources'
): SearchResults {
  const results: any[] = [];
  const sources: SearchSource[] = [];
  let textContent = '';

  // Process conversation outputs - extract both content and sources
  for (const output of outputs) {
    if (output.type === 'message.output' && output.content) {
      for (const contentItem of output.content) {
        if (contentItem && contentItem.type === 'text' && contentItem.text) {
          textContent += contentItem.text + ' ';
        }
      }
    }

    // Extract sources from tool calls if available
    if (output.type === 'tool.output' && output.content) {
      for (const contentItem of output.content) {
        if (contentItem && contentItem.type === 'web_search') {
          // Extract source information from web search results
          if (contentItem.results && Array.isArray(contentItem.results)) {
            contentItem.results.forEach((result: any) => {
              if (result.url && result.title) {
                sources.push({
                  url: result.url,
                  title: result.title,
                  snippet: result.snippet || result.content || '',
                  relevance: result.score || 1.0,
                  domain: extractDomainFromUrl(result.url),
                });
              }
            });
          }
        }
      }
    }

    // Also check for web search results in different output structures
    if (output.web_search_results && Array.isArray(output.web_search_results)) {
      output.web_search_results.forEach((result: any) => {
        if (result.url && result.title) {
          sources.push({
            url: result.url,
            title: result.title,
            snippet: result.snippet || result.content || '',
            relevance: result.score || 1.0,
            domain: extractDomainFromUrl(result.url),
          });
        }
      });
    }
  }

  // Remove duplicate sources based on URL
  const uniqueSources = sources.filter(
    (source, index, self) => index === self.findIndex((s) => s.url === source.url)
  );

  const result: SearchResults = {
    success: true,
    query: originalQuery,
    results: results,
    resultCount: results.length,
    searchEngine: 'mistral-websearch',
    agentType: agentType,
    textContent: textContent.trim(),
    sources: uniqueSources,
    sourcesCount: uniqueSources.length,
    timestamp: new Date().toISOString(),
  };

  return result;
}
