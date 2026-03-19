import { toError } from '../../utils/errors/index.js';
import { createLogger } from '../../utils/logger.js';
import { KNOWN_RSS_FEEDS } from '../briefing/BriefingConfigParser.js';

import { scrapeTableMedia } from './TableMediaScraper.js';

import type { MonitorLocale } from './types.js';

const log = createLogger('MonitorCollector');

export interface CollectedMonitorItem {
  url: string;
  title: string;
  excerpt: string;
  source: string;
  publishedAt: string | null;
  locale: MonitorLocale;
}

const AT_DOMAINS = new Set([
  'orf.at',
  'derstandard.at',
  'diepresse.com',
  'kleinezeitung.at',
  'nachrichten.at',
  'tt.com',
  'news.at',
  'meinbezirk.at',
  'noen.at',
  'vienna.at',
  'ots.at',
  'moment.at',
  'kontrast.at',
  'exxpress.at',
  'brandaktuell.at',
  'krone.at',
  'kurier.at',
  'profil.at',
  'vol.at',
]);

function getLocale(domain: string): MonitorLocale {
  return AT_DOMAINS.has(domain) ? 'at' : 'de';
}

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
      timeout: 15000,
      headers: { 'User-Agent': 'Gruenerator-Monitor/1.0' },
    });
  }
  return parserInstance;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractBestContent(item: RSSItem): string {
  const snippet = item.contentSnippet || '';
  const rawContent = item.content || '';
  const strippedContent = rawContent ? stripHtml(rawContent) : '';

  // Use whichever is longer — some feeds have richer content in HTML
  return strippedContent.length > snippet.length ? strippedContent : snippet;
}

async function fetchFeed(
  domain: string,
  feedUrl: string,
  since: Date
): Promise<CollectedMonitorItem[]> {
  try {
    const parser = await getParser();
    const feed = await parser.parseURL(feedUrl);
    const items: CollectedMonitorItem[] = [];
    const locale = getLocale(domain);

    for (const item of feed.items || []) {
      const rssItem = item as RSSItem;
      const pubDate = rssItem.isoDate || rssItem.pubDate;
      if (pubDate && new Date(pubDate) < since) continue;
      if (!rssItem.link) continue;

      const title = rssItem.title || '';
      const excerpt = extractBestContent(rssItem);

      items.push({
        url: rssItem.link,
        title,
        excerpt,
        source: feed.title || domain,
        publishedAt: pubDate || null,
        locale,
      });
    }

    log.info(`RSS ${domain}: ${items.length} items (locale: ${locale})`);
    return items;
  } catch (error) {
    log.error(`RSS fetch failed for ${domain}: ${toError(error).message}`);
    return [];
  }
}

export async function collectArticles(hoursBack = 24): Promise<CollectedMonitorItem[]> {
  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
  const allDomains = Object.keys(KNOWN_RSS_FEEDS);

  const feedPromises = allDomains.map((domain) => {
    const feedUrl = KNOWN_RSS_FEEDS[domain];
    return fetchFeed(domain, feedUrl, since);
  });

  const results = await Promise.allSettled(feedPromises);

  const allItems: CollectedMonitorItem[] = [];
  const seenUrls = new Set<string>();
  let deCount = 0;
  let atCount = 0;

  for (const result of results) {
    if (result.status === 'fulfilled') {
      for (const item of result.value) {
        if (!seenUrls.has(item.url)) {
          seenUrls.add(item.url);
          allItems.push(item);
          if (item.locale === 'de') deCount++;
          else atCount++;
        }
      }
    }
  }

  // Also scrape Table.Media Berlin (full-text political analysis)
  try {
    const tableArticles = await scrapeTableMedia();
    for (const item of tableArticles) {
      if (!seenUrls.has(item.url)) {
        seenUrls.add(item.url);
        allItems.push(item);
        deCount++;
      }
    }
  } catch (error) {
    log.error(`Table.Media scrape failed: ${toError(error).message}`);
  }

  log.info(
    `Collected ${allItems.length} unique articles from ${allDomains.length} feeds + scrape sources (DE: ${deCount}, AT: ${atCount}, since ${since.toISOString()})`
  );
  return allItems;
}
