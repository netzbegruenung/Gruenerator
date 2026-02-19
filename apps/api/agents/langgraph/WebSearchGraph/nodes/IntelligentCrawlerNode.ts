/**
 * Intelligent Crawler Node for WebSearchGraph
 * AI decides which URLs to crawl for full content
 */

import { parseAIJsonResponse } from '../../../../services/search/index.js';

import type { WebSearchState, CrawlDecision } from '../types.js';

/**
 * Intelligent Crawler Agent Node: AI decides which URLs to crawl
 */
export async function intelligentCrawlerNode(
  state: WebSearchState
): Promise<Partial<WebSearchState>> {
  console.log('[WebSearchGraph] Running intelligent crawler agent');

  try {
    // Check if we have web results to analyze
    if (!state.webResults || state.webResults.length === 0 || !state.webResults[0].success) {
      console.log('[IntelligentCrawler] No web results available for analysis');
      return {
        crawlDecisions: [],
        crawlMetadata: { noResultsToAnalyze: true },
      };
    }

    const firstWebSearch = state.webResults[0];
    const results = firstWebSearch.results || [];

    if (results.length === 0) {
      console.log('[IntelligentCrawler] No individual results to analyze');
      return {
        crawlDecisions: [],
        crawlMetadata: { emptyResults: true },
      };
    }

    // Configuration based on mode
    const maxCrawls = state.mode === 'deep' ? 5 : 2;
    const timeout = state.mode === 'deep' ? 5000 : 3000;

    // Build the analysis prompt
    const analysisContent = results
      .map(
        (r, i) => `
[${i + 1}] ${r.title}
URL: ${r.url}
Domain: ${r.domain || 'unknown'}
Snippet: ${r.snippet || r.content || 'No preview available'}
`
      )
      .join('\n');

    console.log(
      `[IntelligentCrawler] Analyzing ${results.length} results to select max ${maxCrawls} for crawling`
    );

    // AI analyzes snippets and decides which URLs to crawl
    const crawlDecision = await state.aiWorkerPool.processRequest(
      {
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

        messages: [
          {
            role: 'user',
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
}`,
          },
        ],
        options: {
          provider: 'litellm',
          model: 'gpt-oss:120b',
          max_tokens: 600,
          temperature: 0.1,
        },
      },
      state.req
    );

    if (!crawlDecision.success) {
      throw new Error(`AI crawler agent failed: ${crawlDecision.error}`);
    }

    // Parse AI decision with fallback
    const fallbackDecision = {
      selections: results.slice(0, maxCrawls).map((r, i) => ({
        index: i + 1,
        url: r.url,
        reason: 'Fallback selection - top ranked result',
        expectedValue: 'medium',
        priority: i,
        shouldCrawl: true,
      })),
      reasoning: 'Fallback due to JSON parsing error',
    };
    const decision = parseAIJsonResponse(crawlDecision.content, fallbackDecision) as any;

    const crawlDecisions: CrawlDecision[] = decision.selections.map((sel: any) => ({
      url: sel.url,
      shouldCrawl: true,
      reason: sel.reason,
      priority: sel.index,
    }));

    console.log(
      `[IntelligentCrawler] Selected ${crawlDecisions.length} URLs to crawl: ${decision.reasoning}`
    );

    // Log selected URLs for debugging
    decision.selections.forEach((sel: any) => {
      console.log(`[IntelligentCrawler] Will crawl [${sel.index}]: ${sel.url} - ${sel.reason}`);
    });

    return {
      crawlDecisions,
      crawlMetadata: {
        strategy: decision.reasoning,
        totalResultsAnalyzed: results.length,
        maxCrawlsAllowed: maxCrawls,
        selectedCount: crawlDecisions.length,
        timeout,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[WebSearchGraph] Intelligent crawler agent error:', errorMessage);
    return {
      crawlDecisions: [],
      error: `Crawler agent failed: ${errorMessage}`,
      crawlMetadata: { failed: true },
    };
  }
}
