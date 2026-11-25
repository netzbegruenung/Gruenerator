import { load } from 'cheerio';

import { toError } from '../../utils/errors/index.js';
import { createLogger } from '../../utils/logger.js';

import { scrapeBlueskyAccounts } from './BlueskyScraper.js';
import { fetchArticlesFromEventRegistry, fetchGrueneArticles } from './EventRegistryService.js';
import { decodeFeedBytes, fixDoubleEscapedEntities } from './feedDecoding.js';
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
    parserInstance = new module.default();
  }

  return parserInstance!;
}

/**
 * Feed-Bytes selbst fetchen. `fetch` entpackt gzip/br transparent — `parseURL`
 * nicht (vienna.at lieferte deshalb sporadisch „Non-whitespace before first
 * tag“, #6078). Danach mit erkanntem Charset dekodieren: parseURL dekodierte
 * stur als UTF-8, wenn der Content-Type keinen charset hatte, und ignorierte
 * die XML-Deklaration (nachrichten.at ist ISO-8859-15).
 */
async function fetchFeedXml(feedUrl: string): Promise<string> {
  const res = await fetch(feedUrl, {
    headers: {
      'User-Agent': 'Gruenerator-Monitor/1.0',
      Accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Status code ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  return decodeFeedBytes(bytes, res.headers.get('content-type'));
}

/**
 * Dekodierten Feed-XML parsen und auf Headline + Link reduzieren.
 * Exported für Tests (wie parseNewsSitemap).
 */
export async function parseFeedXml(
  xml: string,
  domain: string,
  since: Date
): Promise<CollectedMonitorItem[]> {
  const parser = await getParser();
  const feed = await parser.parseString(xml);
  const locale = getLocale(domain);
  // rss-parser kopiert channel.lastBuildDate auf feed.lastBuildDate
  // (lib/fields.js), der .d.ts-Output-Typ deklariert es aber nicht.
  const feedDate: string | null = (feed as { lastBuildDate?: string }).lastBuildDate ?? null;

  const items: CollectedMonitorItem[] = [];
  for (const item of feed.items || []) {
    const rssItem = item as RSSItem;
    // Undated Items (z. B. vienna.at RSS 0.92, 25 Items ohne pubDate) übernehmen
    // das lastBuildDate des Channels — sonst umgehen sie den since-Filter und
    // gelten downstream dauerhaft als frisch (#6078).
    const pubDate = rssItem.isoDate || rssItem.pubDate || feedDate;
    if (pubDate && new Date(pubDate) < since) continue;
    if (!rssItem.link) continue;

    items.push({
      url: rssItem.link,
      title: fixDoubleEscapedEntities(rssItem.title || ''),
      excerpt: '', // immer leer für RSS — Volltext/Auszug kommt nur aus lizenzierten Quellen (EventRegistry)
      source: fixDoubleEscapedEntities(feed.title || domain),
      publishedAt: pubDate || null,
      locale,
    });
  }
  return items;
}

async function fetchFeed(
  domain: string,
  feedUrl: string,
  since: Date
): Promise<CollectedMonitorItem[]> {
  try {
    const items = await parseFeedXml(await fetchFeedXml(feedUrl), domain, since);
    log.info(`RSS ${domain}: ${items.length} items (locale: ${getLocale(domain)})`);
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
