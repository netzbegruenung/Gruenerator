import { toError } from '../../utils/errors/index.js';
import { createLogger } from '../../utils/logger.js';

import type { CollectedItem } from './types.js';

const log = createLogger('RSSService');

interface RSSItem {
  title?: string;
  link?: string;
  content?: string;
  contentSnippet?: string;
  pubDate?: string;
  isoDate?: string;
}

let parserInstance: any = null;

async function getParser() {
  if (!parserInstance) {
    const module = await import('rss-parser');
    parserInstance = new module.default({
      timeout: 10000,
      headers: { 'User-Agent': 'Gruenerator-Briefing/1.0' },
    });
  }
  return parserInstance;
}

export async function fetchNewItems(
  feedUrl: string,
  since: Date,
  keyword?: string
): Promise<CollectedItem[]> {
  try {
    const parser = await getParser();
    const feed = await parser.parseURL(feedUrl);
    const items: CollectedItem[] = [];

    for (const item of feed.items || []) {
      const rssItem = item as RSSItem;
      const pubDate = rssItem.isoDate || rssItem.pubDate;
      if (pubDate && new Date(pubDate) < since) continue;

      const title = rssItem.title || '';
      const excerpt = rssItem.contentSnippet || rssItem.content || '';

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase();
        if (
          !title.toLowerCase().includes(lowerKeyword) &&
          !excerpt.toLowerCase().includes(lowerKeyword)
        ) {
          continue;
        }
      }

      if (!rssItem.link) continue;

      items.push({
        url: rssItem.link,
        title,
        excerpt: excerpt.slice(0, 500),
        source: feed.title || new URL(feedUrl).hostname,
        sourceType: 'rss',
        publishedAt: pubDate || null,
      });
    }

    log.info(`RSS ${feedUrl}: ${items.length} new items since ${since.toISOString()}`);
    return items;
  } catch (error) {
    log.error(`RSS fetch failed for ${feedUrl}: ${toError(error).message}`);
    return [];
  }
}
