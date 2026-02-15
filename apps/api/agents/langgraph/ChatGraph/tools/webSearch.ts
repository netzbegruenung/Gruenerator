/**
 * Web Search Tool
 *
 * Searches the web via SearXNG with query expansion and content crawling.
 * Wraps executeDirectWebSearch() + expandQuery() + selectAndCrawlTopUrls().
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

import { executeDirectWebSearch } from '../../../../routes/chat/agents/directSearch.js';
import { selectAndCrawlTopUrls } from '../../../../services/search/CrawlingService.js';
import { expandQuery } from '../../../../services/search/QueryExpansionService.js';
import { analyzeTemporality } from '../../../../services/search/TemporalAnalyzer.js';
import { createLogger } from '../../../../utils/logger.js';

import type { ToolDependencies } from './registry.js';

const log = createLogger('Tool:WebSearch');

export function createWebSearchTool(deps: ToolDependencies): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'web_search',
    description:
      'Suche aktuelle Informationen im Web. ' +
      'Nutze dieses Tool bei Fragen zu aktuellen Ereignissen, Nachrichten, ' +
      'externen Fakten oder wenn der Nutzer explizit eine Websuche anfragt.',
    schema: z.object({
      query: z.string().describe('Die Suchanfrage'),
      time_range: z
        .enum(['day', 'week', 'month', 'year'])
        .optional()
        .describe('Zeitraum-Filter (z.B. "day" für heute, "week" für diese Woche)'),
      max_results: z
        .number()
        .min(1)
        .max(10)
        .optional()
        .describe('Anzahl gewünschter Ergebnisse (Standard: 5, max: 10)'),
    }),
    func: async ({ query, time_range, max_results }) => {
      const effectiveMaxResults = max_results ?? 5;
      // Auto-detect temporal expressions if agent didn't set time_range
      let effectiveTimeRange = time_range;
      if (!effectiveTimeRange) {
        const temporal = analyzeTemporality(query);
        if (temporal.suggestedTimeRange) {
          effectiveTimeRange = temporal.suggestedTimeRange as typeof time_range;
          log.info(`[WebSearch] Auto-detected time_range="${effectiveTimeRange}" (urgency=${temporal.urgency})`);
        }
      }

      log.info(`[WebSearch] query="${query.slice(0, 60)}" time_range=${effectiveTimeRange || 'none'}`);

      // Query expansion for broader coverage
      let allQueries = [query];
      try {
        const expanded = await expandQuery(query, deps.aiWorkerPool);
        if (expanded.alternatives.length > 0) {
          allQueries = [query, ...expanded.alternatives];
          log.info(`[WebSearch] Expanded to ${allQueries.length} variants`);
        }
      } catch (err: any) {
        log.warn(`[WebSearch] Query expansion failed: ${err.message}`);
      }

      // Search all variants in parallel
      const webPromises = allQueries.map((q) =>
        executeDirectWebSearch({ query: q, searchType: 'general', maxResults: effectiveMaxResults, timeRange: effectiveTimeRange }).catch(
          (err: any) => {
            log.warn(`[WebSearch] Failed for variant "${q}": ${err.message}`);
            return null;
          }
        )
      );
      const webResults = await Promise.all(webPromises);

      // Merge and deduplicate
      const seenUrls = new Set<string>();
      const allResults: Array<{
        title: string;
        url: string;
        snippet: string;
        domain: string;
        relevance: number;
        content: string;
      }> = [];

      for (const result of webResults) {
        if (!result?.results) continue;
        for (const r of result.results) {
          if (r.url && seenUrls.has(r.url)) continue;
          if (r.url) seenUrls.add(r.url);
          allResults.push({
            title: r.title,
            url: r.url,
            snippet: r.snippet,
            domain: r.domain,
            relevance: 1 - (r.rank - 1) * 0.15,
            content: r.snippet,
          });
        }
      }

      allResults.sort((a, b) => b.relevance - a.relevance);
      let results = allResults.slice(0, effectiveMaxResults + 3);

      // Crawl top results for full content
      const maxCrawl = Math.min(2, Math.ceil(effectiveMaxResults / 4));
      try {
        const crawled = await selectAndCrawlTopUrls(
          results.map((r) => ({ ...r, source: 'web' })),
          query,
          { maxUrls: maxCrawl, timeout: 3000 }
        );
        results = crawled.map((r) => ({
          ...r,
          title: r.title || '',
          url: r.url || '',
          snippet: r.content,
          domain: (r as any).domain || '',
          relevance: (r as any).relevance || 0.5,
          content: (r as any).fullContent || r.content,
        }));
      } catch (err: any) {
        log.warn(`[WebSearch] Crawling failed: ${err.message}`);
      }

      if (results.length === 0) {
        return 'Keine Websuche-Ergebnisse gefunden.';
      }

      const formatted = results
        .map((r, i) => `[${i + 1}] ${r.title} (${r.url})\n${r.content.slice(0, 500)}`)
        .join('\n\n');

      return `${results.length} Web-Ergebnisse gefunden:\n\n${formatted}`;
    },
  });
}
