/**
 * Scrape URL Tool
 *
 * Fetches and extracts content from a given URL.
 * Wraps CrawlingService for single-URL content extraction.
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

import { selectAndCrawlTopUrls } from '../../../../services/search/CrawlingService.js';
import { createLogger } from '../../../../utils/logger.js';

import type { CrawledResult } from '../../../../services/search/CrawlingService.js';
import type { ToolDependencies } from './registry.js';

const log = createLogger('Tool:ScrapeUrl');

export function createScrapeUrlTool(_deps: ToolDependencies): DynamicStructuredTool {
    // @ts-expect-error - Zod schema type compatibility with LangChain ToolInputSchemaBase
  return new DynamicStructuredTool({
    name: 'scrape_url',
    description:
      'Lade den Inhalt einer URL herunter und extrahiere den Text. ' +
      'Nutze dieses Tool wenn der Nutzer eine URL teilt und den Inhalt lesen oder analysieren möchte.',
    schema: z.object({
      url: z.string().url().describe('Die URL die geladen werden soll'),
    }).describe('URL laden'),
    func: async (input: { url: string }) => {
      const { url } = input;
      log.info(`[ScrapeUrl] url="${url}"`);

      try {
        const results = await selectAndCrawlTopUrls(
          [{ source: 'user', title: '', content: '', url, relevance: 1.0 }],
          '',
          { maxUrls: 1, timeout: 8000 }
        );

        const crawled = (results as CrawledResult[]).find((r) => r.crawled);
        if (crawled && crawled.fullContent) {
          const content = crawled.fullContent;
          const truncated =
            content.length > 4000 ? content.slice(0, 4000) + '\n\n[...gekürzt]' : content;
          return `Inhalt von ${url}:\n\n${truncated}`;
        }

        return `URL konnte geladen werden, aber kein Textinhalt extrahiert: ${url}`;
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log.error('[ScrapeUrl] Error:', errorMessage);
        return `Fehler beim Laden der URL ${url}: ${errorMessage}`;
      }
    },
  });
}
