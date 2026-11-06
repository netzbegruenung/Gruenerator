import { load } from 'cheerio';

import { toError } from '../../utils/errors/index.js';
import { createLogger } from '../../utils/logger.js';

import { scrapeBlueskyAccounts } from './BlueskyScraper.js';
import { fetchArticlesFromEventRegistry, fetchGrueneArticles } from './EventRegistryService.js';
import { KNOWN_NEWS_SITEMAPS, KNOWN_RSS_FEEDS } from './rssFeeds.js';

import type { MonitorLocale } from './types.js';
import type RSSParser from 'rss-parser';

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

// LSR-konform: nur Headline + Link aus RSS übernehmen. content/contentSnippet
// werden bewusst NICHT gelesen — Textauszüge aus Presse-Feeds fallen unter das
// Leistungsschutzrecht (§ 87f-h UrhG), Überschrift + Hyperlink sind ausgenommen.
interface RSSItem {
  title?: string;
  link?: string;
  pubDate?: string;
  isoDate?: string;
}

let parserInstance: RSSParser | null = null;

async function getParser(): Promise<RSSParser> {
  if (!parserInstance) {
    const module = await import('rss-parser');
    parserInstance = new module.default({
      timeout: 15000,
      headers: { 'User-Agent': 'Gruenerator-Monitor/1.0' },
    });
  }

  return parserInstance!;
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

      items.push({
        url: rssItem.link,
        title: rssItem.title || '',
        excerpt: '', // immer leer für RSS — Volltext/Auszug kommt nur aus lizenzierten Quellen (EventRegistry)
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

/**
 * Google News sitemap → items. Same LSR rule as RSS: headline + link only.
 * Exported for tests.
 */
export function parseNewsSitemap(xml: string, domain: string, since: Date): CollectedMonitorItem[] {
  const $ = load(xml, { xml: true });
  const locale = getLocale(domain);
  const items: CollectedMonitorItem[] = [];

  $('url').each((_, el) => {
    const entry = $(el);
    const url = entry.children('loc').first().text().trim();
    const title = entry.find('news\\:title').first().text().trim();
    const publishedAt = entry.find('news\\:publication_date').first().text().trim() || null;
    if (!url || !title) return;
    if (publishedAt && new Date(publishedAt) < since) return;

    items.push({
      url,
      title,
      excerpt: '',
      source: entry.find('news\\:name').first().text().trim() || domain,
      publishedAt,
      locale,
    });
  });

  return items;
}

async function fetchNewsSitemap(
  domain: string,
  sitemapUrl: string,
  since: Date
): Promise<CollectedMonitorItem[]> {
  try {
    const res = await fetch(sitemapUrl, {
      headers: { 'User-Agent': 'Gruenerator-Monitor/1.0' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Status code ${res.status}`);
    const items = parseNewsSitemap(await res.text(), domain, since);
    log.info(`News sitemap ${domain}: ${items.length} items (locale: ${getLocale(domain)})`);
    return items;
  } catch (error) {
    log.error(`News sitemap fetch failed for ${domain}: ${toError(error).message}`);
    return [];
  }
}

export async function collectArticles(hoursBack = 24): Promise<CollectedMonitorItem[]> {
  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
  const allDomains = Object.keys(KNOWN_RSS_FEEDS);

  const [rssResults, erDe, erAt, grueneDe, grueneAt, bskyPosts] = await Promise.all([
    Promise.allSettled([
      ...allDomains.map((domain) => fetchFeed(domain, KNOWN_RSS_FEEDS[domain], since)),
      ...Object.entries(KNOWN_NEWS_SITEMAPS).map(([domain, url]) =>
        fetchNewsSitemap(domain, url, since)
      ),
    ]),
    fetchArticlesFromEventRegistry('de'),
    fetchArticlesFromEventRegistry('at'),
    fetchGrueneArticles('de'),
    fetchGrueneArticles('at'),
    scrapeBlueskyAccounts().catch((e: unknown) => {
      log.error(`Bluesky scrape failed: ${toError(e).message}`);
      return [] as CollectedMonitorItem[];
    }),
  ]);

  const urlMap = new Map<string, CollectedMonitorItem>();

  // RSS first (title+link only)
  for (const result of rssResults) {
    if (result.status === 'fulfilled') {
      for (const item of result.value) {
        urlMap.set(item.url, item);
      }
    }
  }

  // EventRegistry political articles overwrite RSS (have body text)
  for (const item of [...erDe, ...erAt]) {
    urlMap.set(item.url, item);
  }

  // Grüne-specific articles overwrite (have body text)
  for (const item of [...grueneDe, ...grueneAt]) {
    urlMap.set(item.url, item);
  }

  // Bluesky (own content, always overwrite)
  for (const item of bskyPosts) {
    urlMap.set(item.url, item);
  }

  const allItems = [...urlMap.values()];
  const deCount = allItems.filter((a) => a.locale === 'de').length;
  const atCount = allItems.filter((a) => a.locale === 'at').length;
  const erCount = erDe.length + erAt.length;

  log.info(
    `Collected ${allItems.length} unique articles (DE: ${deCount}, AT: ${atCount}, EventRegistry: ${erCount}, RSS: ${allItems.length - erCount}, since ${since.toISOString()})`
  );
  return allItems;
}
