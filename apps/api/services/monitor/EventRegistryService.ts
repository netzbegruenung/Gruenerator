import { createLogger } from '../../utils/logger.js';
import redisClient from '../../utils/redis/client.js';

import type { CollectedMonitorItem } from './MonitorCollectorService.js';
import type { MonitorLocale } from './types.js';

const log = createLogger('EventRegistry');

const ER_API_URL = 'https://eventregistry.org/api/v1/article/getArticles';
const ER_CACHE_TTL = 4 * 3600;
const ER_TIMEOUT = 30000;

const BLOCKED_SOURCES = new Set([
  'politically incorrect',
  'pi-news',
  'pinews',
  'compact-online',
  'jungefreiheit',
  'junge freiheit',
  'auf1',
  'auf1.tv',
  'report24',
  'reitschuster',
]);

const GRUENE_CONCEPTS: Record<MonitorLocale, string> = {
  de: "http://en.wikipedia.org/wiki/Alliance_'90/The_Greens",
  at: 'http://en.wikipedia.org/wiki/The_Greens_(Austria)',
};

interface ERArticle {
  uri: string;
  url: string;
  title: string;
  body: string;
  source: { uri: string; title: string };
  dateTimePub: string;
  lang: string;
  sentiment?: number;
}

interface ERResponse {
  articles?: {
    results?: ERArticle[];
    totalResults?: number;
  };
}

async function fetchER(
  params: Record<string, unknown>,
  cacheKey: string,
  label: string,
  locale: MonitorLocale,
  includeSentiment = false
): Promise<CollectedMonitorItem[]> {
  const apiKey = process.env.EVENT_REGISTRY_API_KEY;
  if (!apiKey) {
    log.info('EVENT_REGISTRY_API_KEY not set, skipping');
    return [];
  }

  try {
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      const articles = JSON.parse(cached) as CollectedMonitorItem[];
      log.info(`${label} cache hit (${locale}): ${articles.length} articles`);
      return articles;
    }
  } catch {
    // Fall through
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ER_TIMEOUT);

    const response = await fetch(ER_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ ...params, apiKey }),
    });

    clearTimeout(timeout);

    if (!response.ok) {
      log.error(`${label} API error: ${response.status} ${response.statusText}`);
      return [];
    }

    const data = (await response.json()) as ERResponse;
    const erArticles = data?.articles?.results ?? [];

    const items: CollectedMonitorItem[] = erArticles
      .filter((a) => a.url && a.title && !BLOCKED_SOURCES.has((a.source?.title || '').toLowerCase()))
      .map((a) => ({
        url: a.url,
        title: a.title,
        excerpt: (a.body || '').slice(0, 2000),
        source: a.source?.title || 'Unknown',
        publishedAt: a.dateTimePub || null,
        locale,
        ...(includeSentiment && a.sentiment != null ? { erSentiment: a.sentiment } : {}),
      }));

    log.info(`${label} (${locale}): ${items.length} articles fetched`);

    try {
      await redisClient.set(cacheKey, JSON.stringify(items), { EX: ER_CACHE_TTL });
    } catch {
      // Non-critical
    }

    return items;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      log.error(`${label} timeout (${locale})`);
    } else {
      log.error(`${label} fetch failed (${locale}): ${error}`);
    }
    return [];
  }
}

export async function fetchArticlesFromEventRegistry(
  locale: MonitorLocale
): Promise<CollectedMonitorItem[]> {
  const sourceLocation =
    locale === 'at'
      ? 'http://en.wikipedia.org/wiki/Austria'
      : 'http://en.wikipedia.org/wiki/Germany';

  return fetchER(
    {
      action: 'getArticles',
      lang: 'deu',
      sourceLocationUri: sourceLocation,
      categoryUri: 'news/Politics',
      ignoreSourceGroupUri: 'paywall/paywalled_sources',
      ignoreSourceUri: ['pi-news.net', 'compact-online.de', 'jungefreiheit.de', 'auf1.tv', 'report24.news', 'reitschuster.de'],
      isDuplicateFilter: 'skipDuplicates',
      forceMaxDataTimeWindow: 7,
      articlesCount: 100,
      articlesSortBy: 'date',
      articlesSortByAsc: false,
      articleBodyLen: 2000,
      dataType: ['news'],
      resultType: 'articles',
      includeArticleBody: true,
      includeArticleTitle: true,
      includeArticleConcepts: false,
      includeArticleCategories: false,
      includeArticleImage: false,
      includeArticleVideos: false,
      includeArticleLinks: false,
    },
    `monitor:eventregistry:${locale}`,
    'EventRegistry',
    locale
  );
}

export async function fetchGrueneArticles(locale: MonitorLocale): Promise<CollectedMonitorItem[]> {
  return fetchER(
    {
      action: 'getArticles',
      lang: 'deu',
      conceptUri: GRUENE_CONCEPTS[locale],
      ignoreSourceGroupUri: 'paywall/paywalled_sources',
      ignoreSourceUri: ['pi-news.net', 'compact-online.de', 'jungefreiheit.de', 'auf1.tv', 'report24.news', 'reitschuster.de'],
      isDuplicateFilter: 'skipDuplicates',
      forceMaxDataTimeWindow: 7,
      articlesCount: 50,
      articlesSortBy: 'date',
      articlesSortByAsc: false,
      articleBodyLen: 2000,
      dataType: ['news'],
      resultType: 'articles',
      includeArticleBody: true,
      includeArticleTitle: true,
      includeArticleSentiment: true,
      includeArticleConcepts: false,
      includeArticleCategories: false,
      includeArticleImage: false,
      includeArticleVideos: false,
      includeArticleLinks: false,
    },
    `monitor:eventregistry-gruene:${locale}`,
    'EventRegistry-Gruene',
    locale,
    true
  );
}
