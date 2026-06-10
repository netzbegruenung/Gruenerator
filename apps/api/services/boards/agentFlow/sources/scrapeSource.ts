/**
 * Source: scrape a URL from the card. Uses the same crawler as the chat scrape
 * tool, guarded by validateUrlForFetch (SSRF protection — the URL is user-supplied).
 */
import { type BoardFlowCardContext, type BoardFlowSource } from '@gruenerator/contracts';

import { createLogger } from '../../../../utils/logger.js';
import { validateUrlForFetch } from '../../../../utils/validation/urlSecurity.js';
import { selectAndCrawlTopUrls } from '../../../search/CrawlingService.js';

import type { CrawledResult } from '../../../search/CrawlingService.js';

const log = createLogger('boardFlow:scrapeSource');

const MAX_SCRAPE_CHARS = 6000;

export async function scrapeSource(
  _source: Extract<BoardFlowSource, { type: 'scrape_url' }>,
  ctx: BoardFlowCardContext
): Promise<string> {
  const url = (ctx.url ?? '').trim();
  if (!url) {
    throw new Error('Keine URL auf der Karte gefunden (Quelle „URL scrapen").');
  }

  const validation = await validateUrlForFetch(url);
  if (!validation.isValid) {
    throw new Error(`URL kann nicht geladen werden: ${validation.error ?? 'ungültig'}`);
  }

  log.info(`Scraping URL for board flow: ${url}`);
  const results = await selectAndCrawlTopUrls(
    [{ source: 'user', title: '', content: '', url, relevance: 1.0 }],
    '',
    { maxUrls: 1, timeout: 8000 }
  );
  const crawled = (results as CrawledResult[]).find((r) => r.crawled);
  const content = crawled?.fullContent?.trim();
  if (!content) {
    throw new Error(`Inhalt der URL konnte nicht extrahiert werden: ${url}`);
  }

  const truncated =
    content.length > MAX_SCRAPE_CHARS
      ? `${content.slice(0, MAX_SCRAPE_CHARS)}\n\n[…gekürzt]`
      : content;
  return `Inhalt von ${url}:\n\n${truncated}`;
}
