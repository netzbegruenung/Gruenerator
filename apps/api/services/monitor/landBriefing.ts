/**
 * One Land view of /briefing (`?land=`), assembled from data the monitor
 * already keeps — no model call:
 *
 * - Themen, Keywords, „Heute wichtig", „Über die Grünen": the last 25 hours of
 *   `monitor_articles` carrying the Land (`lands`, set at ingest by
 *   `laender.ts`), sport excluded. Same rules as the national view: topics via
 *   `scoreTopics`, keywords from the NLP nouns, „wichtig" = articles holding
 *   the most top keywords, Grüne = the locale's watcher patterns.
 * - Umfrage: PolitPro for the Land's parliament (ids are shared).
 * - Landesverband: party and faction posts of the last 30 days.
 * - Landtag: documents of the last seven days, where a current notebook exists.
 *
 * Each part falls back on its own, so a missing source costs its card, not the
 * view. 10 minutes in Redis per Land.
 */
import {
  landBriefingResponseSchema,
  type LandBriefing,
  type LandtagDocument,
  type MonitorKeywordEntry,
} from '@gruenerator/contracts';

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { getQdrantInstance } from '../../database/services/QdrantService/index.js';
import { toError } from '../../utils/errors/index.js';
import { createLogger } from '../../utils/logger.js';
import { getCachedJson, setCachedJson } from '../../utils/redis/jsonCache.js';

import { getRecentLvArticlesFor } from './ContentSyncEventsService.js';
import {
  isSport,
  landesverbandCodesOf,
  landLocale,
  landSelfNouns,
  landtagCollectionOf,
} from './laender.js';
import { scoreTopics } from './MonitorService.js';
import { getPolitProPolls } from './PolitProService.js';
import { getEntityForLocale } from './watcherEntities.js';

import type { MonitorArticle, MonitorLand, NounCount, TopicCategory } from './types.js';

const log = createLogger('LandBriefing');

const CACHE_TTL_SECONDS = 10 * 60;
const ARTICLE_LIMIT = 500;
const NEWS_LIMIT = 10;
const KEYWORD_LIMIT = 30;
/** As `getKeywordArticles`: top 10 keywords, an article must hold two of them. */
const TOP_KEYWORDS = 10;
const MIN_KEYWORD_MATCHES = 2;
const LV_DAYS = 30;
const LANDTAG_DAYS = 7;
/** Procedural documents that would crowd out the political ones. */
const LANDTAG_SKIP_TYPES = new Set(['Änderungsantrag', 'Übersicht', 'Beratungsergebnis']);

function cacheKey(land: MonitorLand): string {
  return `monitor:land:v1:${land}`;
}

async function safe<T>(label: string, fallback: T, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    log.warn(`${label} unavailable: ${toError(error).message}`);
    return fallback;
  }
}

async function loadLandArticles(land: MonitorLand): Promise<MonitorArticle[]> {
  const rows = await getPostgresInstance().query(
    `SELECT url, title, excerpt, source, locale, published_at, primary_topic, topic_scores, top_nouns
     FROM monitor_articles
     WHERE $1 = ANY(lands)
       AND (published_at > now() - interval '25 hours' OR (published_at IS NULL AND last_seen_at > now() - interval '25 hours'))
     ORDER BY published_at DESC NULLS LAST
     LIMIT $2`,
    [land, ARTICLE_LIMIT]
  );
  return rows
    .map((row: Record<string, unknown>): MonitorArticle => ({
      url: row.url as string,
      title: row.title as string,
      excerpt: (row.excerpt as string) || '',
      source: row.source as string,
      locale: row.locale as MonitorArticle['locale'],
      publishedAt: row.published_at ? String(row.published_at) : null,
      primaryTopic: (row.primary_topic as TopicCategory) || null,
      topics: (row.topic_scores as MonitorArticle['topics']) || {},
      topNouns: (row.top_nouns as NounCount[]) || [],
    }))
    .filter((a) => !isSport(a.title));
}

/** Noun counts summed over the Land's articles, without the nouns naming the Land itself. */
export function landKeywords(
  articles: MonitorArticle[],
  selfNouns: readonly string[]
): MonitorKeywordEntry[] {
  const skip = new Set(selfNouns);
  const totals = new Map<string, number>();
  for (const article of articles) {
    for (const { noun, count } of article.topNouns ?? []) {
      if (skip.has(noun)) continue;
      totals.set(noun, (totals.get(noun) ?? 0) + count);
    }
  }
  return [...totals]
    .sort((a, b) => b[1] - a[1])
    .slice(0, KEYWORD_LIMIT)
    .map(([keyword, count]) => ({ keyword, count, topic: null }));
}

/**
 * „Heute wichtig": articles holding the most top keywords, as `getKeywordArticles`
 * ranks them. On a thin day (fewer than three such articles) the newest
 * articles stand in, so the card shows the Land's news rather than nothing.
 */
export function importantArticles(
  articles: MonitorArticle[],
  keywords: MonitorKeywordEntry[]
): MonitorArticle[] {
  const top = new Set(keywords.slice(0, TOP_KEYWORDS).map((k) => k.keyword));
  const ranked = articles
    .map((article) => {
      const matched = (article.topNouns ?? []).filter((n) => top.has(n.noun));
      return {
        article,
        distinct: new Set(matched.map((n) => n.noun)).size,
        weight: matched.reduce((sum, n) => sum + n.count, 0),
      };
    })
    .filter((r) => r.distinct >= MIN_KEYWORD_MATCHES)
    .sort((a, b) => b.distinct - a.distinct || b.weight - a.weight)
    .map((r) => r.article);
  return (ranked.length >= 3 ? ranked : articles).slice(0, NEWS_LIMIT);
}

/** The locale's watcher patterns (`watcherEntities.ts`), applied as `searchArticlesByKeywords` does. */
export function greensArticles(land: MonitorLand, articles: MonitorArticle[]): MonitorArticle[] {
  const entity = getEntityForLocale(landLocale(land));
  return articles
    .filter((a) => {
      const text = `${a.title} ${a.excerpt}`.toLowerCase();
      return (
        entity.keywords.some((k) => text.includes(k)) &&
        !entity.excludePatterns.some((p) => text.includes(p))
      );
    })
    .slice(0, NEWS_LIMIT);
}

function asStrings(value: unknown): string[] {
  if (typeof value === 'string' && value.trim()) return [value];
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

async function loadLandtag(collection: string): Promise<LandtagDocument[]> {
  const qdrant = getQdrantInstance();
  await qdrant.init();
  if (!qdrant.isContentAvailable()) return [];
  const since = new Date(Date.now() - LANDTAG_DAYS * 864e5).toISOString().slice(0, 10);
  const result = await qdrant.readClient(collection).scroll(collection, {
    filter: {
      must: [
        { key: 'chunk_index', match: { value: 0 } },
        { key: 'published_at', range: { gte: since } },
      ],
    },
    limit: 200,
    with_payload: ['title', 'source_url', 'doc_type', 'party', 'document_number', 'published_at'],
    with_vector: false,
  });
  return (result.points ?? [])
    .map((p) => (p.payload ?? {}) as Record<string, unknown>)
    .map((p): LandtagDocument => ({
      title: typeof p.title === 'string' ? p.title : '',
      url: typeof p.source_url === 'string' ? p.source_url : '',
      docType: asStrings(p.doc_type)[0] ?? 'Drucksache',
      parties: asStrings(p.party),
      documentNumber: typeof p.document_number === 'string' ? p.document_number : null,
      publishedAt: typeof p.published_at === 'string' ? p.published_at : null,
    }))
    .filter((d) => d.title && d.url && !LANDTAG_SKIP_TYPES.has(d.docType))
    .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))
    .slice(0, NEWS_LIMIT);
}

export async function getLandBriefing(land: MonitorLand): Promise<LandBriefing> {
  const cached = await getCachedJson(cacheKey(land), landBriefingResponseSchema);
  if (cached) return cached;

  const codes = landesverbandCodesOf(land);
  const landtagCollection = landtagCollectionOf(land);
  const [articles, poll, landesverband, landtag] = await Promise.all([
    safe('articles', [] as MonitorArticle[], () => loadLandArticles(land)),
    safe('poll', null, () => getPolitProPolls(land)),
    codes
      ? safe('landesverband', [], () => getRecentLvArticlesFor(codes, LV_DAYS, NEWS_LIMIT))
      : Promise.resolve(null),
    landtagCollection
      ? safe('landtag', [], () => loadLandtag(landtagCollection))
      : Promise.resolve(null),
  ]);

  const keywords = landKeywords(articles, landSelfNouns(land));
  // The response carries what the cards show; nouns and full topic article lists stay server-side.
  const slim = ({ topNouns: _nouns, ...article }: MonitorArticle): MonitorArticle => article;
  const briefing: LandBriefing = {
    land,
    createdAt: new Date().toISOString(),
    totalArticles: articles.length,
    classifiedArticles: articles.filter((a) => a.primaryTopic).length,
    sources: [...new Set(articles.map((a) => a.source))],
    topics: scoreTopics(articles)
      .filter((t) => t.articleCount > 0)
      .map((t) => ({ ...t, topArticles: [] })),
    keywords,
    important: importantArticles(articles, keywords).map(slim),
    greens: greensArticles(land, articles).map(slim),
    poll,
    landesverband,
    landtag,
  };

  await setCachedJson(cacheKey(land), briefing, CACHE_TTL_SECONDS);
  return briefing;
}
