import { randomUUID } from 'crypto';

import { monitorSnapshotSchema } from '@gruenerator/contracts';

import { monitorSnapshots, type MonitorSnapshotRow } from '../../database/schema/monitor.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { toError } from '../../utils/errors/index.js';
import { createLogger } from '../../utils/logger.js';
import { getCachedJson, setCachedJson } from '../../utils/redis/jsonCache.js';
import { classifyArticles } from '../nlp/nlpClient.js';

import { getHotTopicAnalysis } from './HotTopicPipeline.js';
import { collectArticles } from './MonitorCollectorService.js';
import { getEntitySummary } from './MonitorSummaryService.js';
import { getPolls } from './PollScraper.js';
import { scrapeTwitterTrends } from './TwitterTrendsScraper.js';
import { TOPIC_CATEGORIES } from './types.js';
import { WATCHER_ENTITIES } from './watcherEntities.js';

import type {
  KeywordEntry,
  SocialTrend,
  MonitorArticle,
  MonitorLocale,
  MonitorSnapshot,
  TopicCategory,
  TopicScore,
  NlpClassificationResult,
} from './types.js';

const log = createLogger('MonitorService');

const REDIS_SNAPSHOT_KEY = 'monitor:latest';
const REDIS_TTL_SECONDS = 7200;

function db() {
  return getPostgresInstance();
}

// ─── Snapshot building (from classified articles only) ───────────────

function buildSnapshot(
  classifiedArticles: MonitorArticle[],
  allArticlesCount: number,
  sources: string[],
  keywords: KeywordEntry[] = [],
  socialTrends: SocialTrend[] = [],
  locale?: MonitorLocale
): MonitorSnapshot {
  const filtered = locale
    ? classifiedArticles.filter((a) => a.locale === locale)
    : classifiedArticles;

  const topicMap = new Map<TopicCategory, { score: number; articles: MonitorArticle[] }>();
  for (const cat of TOPIC_CATEGORIES) {
    topicMap.set(cat, { score: 0, articles: [] });
  }

  for (const article of filtered) {
    if (!article.primaryTopic) continue;
    const entry = topicMap.get(article.primaryTopic);
    if (entry) {
      entry.score += article.topics[article.primaryTopic] ?? 0;
      entry.articles.push(article);
    }
  }

  const topics: TopicScore[] = TOPIC_CATEGORIES.map((cat) => {
    const entry = topicMap.get(cat)!;
    const sorted = entry.articles.sort((a, b) => (b.topics[cat] ?? 0) - (a.topics[cat] ?? 0));
    return {
      topic: cat,
      score: Math.round(entry.score * 10) / 10,
      articleCount: entry.articles.length,
      topArticles: sorted.slice(0, 10),
    };
  }).sort((a, b) => b.score - a.score);

  const deCount = classifiedArticles.filter((a) => a.locale === 'de').length;
  const atCount = classifiedArticles.filter((a) => a.locale === 'at').length;

  return {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    topics,
    keywords,
    socialTrends,
    totalArticles: filtered.length,
    sources: [...new Set(locale ? filtered.map((a) => a.source) : sources)],
    articlesByLocale: { de: deCount, at: atCount },
  };
}

// ─── Refresh pipeline ────────────────────────────────────────────────

export async function refreshMonitor(): Promise<MonitorSnapshot> {
  log.info('Starting monitor refresh...');
  const startTime = Date.now();

  const collected = await collectArticles(24);
  if (collected.length === 0) {
    throw new Error('No articles collected from any source');
  }

  const nlpInput = collected.map((item) => ({
    id: item.url,
    title: item.title,
    text: item.excerpt,
  }));

  const [classifications, socialTrends] = await Promise.all([
    classifyArticles<TopicCategory>(nlpInput),
    scrapeTwitterTrends().catch(() => []),
  ]);
  if (classifications.length === 0) {
    throw new Error('NLP service returned no results');
  }

  const classMap = new Map<string, NlpClassificationResult>();
  for (const c of classifications) {
    classMap.set(c.id, c);
  }

  // Build all articles (for DB) and classified subset (for snapshot)
  const allArticles: MonitorArticle[] = [];
  const classifiedArticles: MonitorArticle[] = [];
  for (const item of collected) {
    const classification = classMap.get(item.url);
    const article: MonitorArticle = {
      url: item.url,
      title: item.title,
      source: item.source,
      publishedAt: item.publishedAt,
      excerpt: item.excerpt,
      locale: item.locale,
      topics: classification?.topics ?? {},
      primaryTopic: classification?.primaryTopic ?? null,
      topNouns: classification?.topNouns ?? [],
    };
    allArticles.push(article);
    if (classification?.primaryTopic) {
      classifiedArticles.push(article);
    }
  }

  // Aggregate keywords from per-article top nouns
  const nounAggregator = new Map<string, number>();
  for (const article of allArticles) {
    for (const { noun, count } of article.topNouns ?? []) {
      nounAggregator.set(noun, (nounAggregator.get(noun) ?? 0) + count);
    }
  }
  const keywords: KeywordEntry[] = [...nounAggregator.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([keyword, count]) => {
      const labels = classifiedArticles.find((a) => a.topNouns?.some((n) => n.noun === keyword));
      return { keyword, count, topic: labels?.primaryTopic ?? null };
    });

  const sources = [...new Set(collected.map((c) => c.source))];
  const snapshot = buildSnapshot(
    classifiedArticles,
    allArticles.length,
    sources,
    keywords,
    socialTrends
  );

  // Store articles in normalized table + snapshot aggregates
  await Promise.all([upsertArticles(allArticles), saveSnapshotAggregates(snapshot)]);

  // Cache snapshot in Redis. Non-fatal: DB still has canonical data, but a
  // failure here means /monitor/latest pays the rebuild cost on every request.
  await setCachedJson(REDIS_SNAPSHOT_KEY, snapshot, REDIS_TTL_SECONDS);

  const warmTasks: Array<{ name: string; run: () => Promise<unknown> }> = [];

  warmTasks.push({ name: 'polls', run: () => getPolls() });

  for (const locale of ['de', 'at'] as const) {
    warmTasks.push({
      name: `hot-topic:${locale}`,
      run: async () => {
        const snap = await getLatestSnapshot(locale);
        if (!snap) throw new Error('no snapshot available');
        // Cache is fingerprinted on the hot topic, so this regenerates exactly
        // when the dominant story changed.
        return getHotTopicAnalysis(locale, snap);
      },
    });
  }

  for (const entity of WATCHER_ENTITIES) {
    warmTasks.push({
      name: `entity-summary:${entity.id}/${entity.locale}`,
      run: async () => {
        const articles = await searchArticlesByKeywords(
          entity.keywords,
          entity.locale,
          50,
          entity.excludePatterns
        );
        return getEntitySummary(entity, articles, entity.locale);
      },
    });
  }

  // Run warmers in parallel, but don't block the refresh response. Aggregate
  // failures into a single structured ERROR so a single watch on logs catches
  // any background regression instead of 13 independent WARN lines.
  void Promise.allSettled(warmTasks.map((t) => t.run())).then((results) => {
    const failures = results
      .map((r, i) =>
        r.status === 'rejected' ? { name: warmTasks[i].name, reason: r.reason as unknown } : null
      )
      .filter((x): x is { name: string; reason: unknown } => x !== null);

    if (failures.length === 0) {
      log.info(`Background warm: ${warmTasks.length}/${warmTasks.length} succeeded`);
      return;
    }

    const detail = failures.map((f) => `${f.name}: ${toError(f.reason).message}`).join('; ');
    log.error(`Background warm: ${failures.length}/${warmTasks.length} failed — ${detail}`);
  });

  const durationMs = Date.now() - startTime;
  log.info(
    `Monitor refresh: ${allArticles.length} total, ${classifiedArticles.length} classified, ${keywords.length} keywords (${durationMs}ms)`
  );

  return snapshot;
}

// ─── Daily scrape jobs (Instagram, run separately from hourly refresh) ──

export async function refreshInstagram(): Promise<number> {
  const { scrapeInstagramAccounts } = await import('./SocialMediaScraper.js');
  log.info('Starting Instagram scrape (daily)...');
  const startTime = Date.now();

  const allPosts = await scrapeInstagramAccounts();
  // Only store posts from the last 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const posts = allPosts.filter((p) => {
    if (!p.publishedAt) return true;
    return new Date(p.publishedAt) > sevenDaysAgo;
  });
  if (posts.length > 0) {
    const articles = posts.map((p) => ({
      url: p.url,
      title: p.title,
      source: p.source,
      publishedAt: p.publishedAt,
      excerpt: p.excerpt,
      locale: p.locale,
      topics: {},
      primaryTopic: null,
    }));
    await upsertArticles(articles);
  }

  log.info(`Instagram scrape done: ${posts.length} posts (${Date.now() - startTime}ms)`);
  return posts.length;
}

// ─── Article storage (normalized table) ──────────────────────────────

async function upsertArticles(articles: MonitorArticle[]): Promise<void> {
  if (articles.length === 0) return;

  try {
    // Batch upsert: insert new articles, update last_seen_at for existing ones
    const values = articles.map((a) => [
      a.url,
      a.title,
      a.excerpt,
      a.source,
      a.locale,
      a.publishedAt,
      a.primaryTopic,
      JSON.stringify(a.topics),
      JSON.stringify(a.topNouns ?? []),
    ]);

    // Build batch VALUES clause
    const placeholders: string[] = [];
    const params: unknown[] = [];
    for (let i = 0; i < values.length; i++) {
      const offset = i * 9;
      placeholders.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}::timestamptz, $${offset + 7}, $${offset + 8}::jsonb, $${offset + 9}::jsonb)`
      );
      params.push(...values[i]);
    }

    await db().query(
      `INSERT INTO monitor_articles (url, title, excerpt, source, locale, published_at, primary_topic, topic_scores, top_nouns)
       VALUES ${placeholders.join(', ')}
       ON CONFLICT (url) DO UPDATE SET
         title = EXCLUDED.title,
         excerpt = EXCLUDED.excerpt,
         primary_topic = EXCLUDED.primary_topic,
         topic_scores = EXCLUDED.topic_scores,
         top_nouns = EXCLUDED.top_nouns,
         last_seen_at = now()`,
      params
    );

    log.info(`Upserted ${articles.length} articles into monitor_articles`);
  } catch (error) {
    log.error(`Failed to upsert articles: ${toError(error).message}`);
    throw error;
  }
}

async function saveSnapshotAggregates(snapshot: MonitorSnapshot): Promise<void> {
  try {
    // Drizzle typed insert: the column set is checked against the schema, so a
    // reference to a non-existent column (the bug that broke this table before)
    // is now a compile error rather than a runtime PG 42703.
    await getDrizzleInstance().insert(monitorSnapshots).values({
      id: snapshot.id,
      created_at: snapshot.createdAt,
      total_articles: snapshot.totalArticles,
      sources: snapshot.sources,
      topic_scores: snapshot.topics,
      keywords: snapshot.keywords,
      social_trends: snapshot.socialTrends,
    });
  } catch (error) {
    log.error(`Failed to save snapshot: ${toError(error).message}`);
    throw error;
  }
}

// ─── Read: snapshot (cached) ─────────────────────────────────────────

export async function getLatestSnapshot(locale?: MonitorLocale): Promise<MonitorSnapshot | null> {
  // Try Redis cache first
  if (!locale) {
    const cached = await getCachedJson(REDIS_SNAPSHOT_KEY, monitorSnapshotSchema);
    if (cached) return cached;
  }

  // Rebuild from DB
  try {
    const rows = await db().query<MonitorSnapshotRow>(
      'SELECT * FROM monitor_snapshots ORDER BY created_at DESC LIMIT 1'
    );
    const row = rows[0];
    if (!row) return null;

    const snapshot: MonitorSnapshot = {
      id: row.id,
      createdAt: row.created_at,
      topics: row.topic_scores,
      keywords: row.keywords ?? [],
      socialTrends: row.social_trends ?? [],
      totalArticles: row.total_articles,
      sources: row.sources,
      articlesByLocale: { de: 0, at: 0 },
    };

    // Get locale counts from articles table
    try {
      const counts = await db().query(
        `SELECT locale, count(*)::int as count FROM monitor_articles
         WHERE last_seen_at > now() - interval '25 hours'
         GROUP BY locale`
      );
      for (const r of counts) {
        const loc = r.locale as string;
        const cnt = r.count as number;
        if (loc === 'de') snapshot.articlesByLocale.de = cnt;
        if (loc === 'at') snapshot.articlesByLocale.at = cnt;
      }
    } catch (error) {
      log.warn(`Failed to load locale article counts: ${toError(error).message}`);
    }

    if (locale) {
      // Rebuild filtered: get classified articles for this locale from DB
      const localeArticles = await db().query(
        `SELECT url, title, excerpt, source, locale, published_at, primary_topic, topic_scores
         FROM monitor_articles
         WHERE locale = $1 AND primary_topic IS NOT NULL AND last_seen_at > now() - interval '25 hours'
         ORDER BY published_at DESC NULLS LAST`,
        [locale]
      );
      const articles = localeArticles.map(rowToArticle);
      const localeKeywords = await getKeywordsByLocale(locale);
      return buildSnapshot(
        articles,
        articles.length,
        snapshot.sources,
        localeKeywords,
        snapshot.socialTrends || [],
        locale
      );
    }

    // Cache for next time
    await setCachedJson(REDIS_SNAPSHOT_KEY, snapshot, REDIS_TTL_SECONDS);

    return snapshot;
  } catch (error) {
    log.error(`Failed to fetch snapshot: ${toError(error).message}`);
    return null;
  }
}

// ─── Read: keywords by locale (aggregated from per-article nouns) ────

export async function getKeywordsByLocale(
  locale: MonitorLocale,
  limit = 50
): Promise<KeywordEntry[]> {
  try {
    const rows = await db().query(
      `SELECT
         noun->>'noun' as keyword,
         SUM((noun->>'count')::int) as total_count
       FROM monitor_articles,
            jsonb_array_elements(top_nouns) as noun
       WHERE locale = $1
         AND (published_at > now() - interval '25 hours' OR (published_at IS NULL AND last_seen_at > now() - interval '25 hours'))
         AND jsonb_array_length(top_nouns) > 0
       GROUP BY noun->>'noun'
       ORDER BY total_count DESC
       LIMIT $2`,
      [locale, limit]
    );

    return rows.map((r: Record<string, unknown>) => ({
      keyword: r.keyword as string,
      count: Number(r.total_count),
      topic: null,
    }));
  } catch (error) {
    log.error(`Failed to get keywords by locale: ${error}`);
    return [];
  }
}

// ─── Read: history ───────────────────────────────────────────────────

export async function getHistory(days = 7): Promise<Array<{ date: string; topics: TopicScore[] }>> {
  try {
    const rows = await db().query(
      `SELECT DISTINCT ON (date_trunc('day', created_at))
         created_at, topic_scores
       FROM monitor_snapshots
       WHERE created_at > now() - make_interval(days => $1)
       ORDER BY date_trunc('day', created_at) DESC, created_at DESC`,
      [days]
    );

    return rows.map((row: Record<string, unknown>) => ({
      date: new Date(row.created_at as string).toISOString().slice(0, 10),
      topics: row.topic_scores as TopicScore[],
    }));
  } catch (error) {
    log.error(`Failed to fetch history: ${error}`);
    return [];
  }
}

// ─── Read: topic articles ────────────────────────────────────────────

export async function getTopicArticles(
  topic: TopicCategory,
  limit = 20,
  locale?: MonitorLocale
): Promise<MonitorArticle[]> {
  try {
    const conditions = [
      'primary_topic = $1',
      "(published_at > now() - interval '25 hours' OR (published_at IS NULL AND last_seen_at > now() - interval '25 hours'))",
    ];
    const params: unknown[] = [topic];

    if (locale) {
      params.push(locale);
      conditions.push(`locale = $${params.length}`);
    }

    params.push(limit);
    const rows = await db().query(
      `SELECT url, title, excerpt, source, locale, published_at, primary_topic, topic_scores
       FROM monitor_articles
       WHERE ${conditions.join(' AND ')}
       ORDER BY (topic_scores->>$1)::float DESC NULLS LAST
       LIMIT $${params.length}`,
      params
    );

    return rows.map(rowToArticle);
  } catch (error) {
    log.error(`Failed to fetch topic articles: ${error}`);
    return [];
  }
}

// ─── Read: search (watcher) ──────────────────────────────────────────

export async function searchArticles(
  query: string,
  locale?: MonitorLocale,
  limit = 50
): Promise<MonitorArticle[]> {
  try {
    const pattern = `%${query}%`;
    const conditions = [
      '(title ILIKE $1 OR excerpt ILIKE $1)',
      "(published_at > now() - interval '25 hours' OR (published_at IS NULL AND last_seen_at > now() - interval '25 hours'))",
    ];
    const params: unknown[] = [pattern];

    if (locale) {
      params.push(locale);
      conditions.push(`locale = $${params.length}`);
    }

    params.push(limit);
    const rows = await db().query(
      `SELECT url, title, excerpt, source, locale, published_at, primary_topic, topic_scores
       FROM monitor_articles
       WHERE ${conditions.join(' AND ')}
       ORDER BY published_at DESC NULLS LAST
       LIMIT $${params.length}`,
      params
    );

    return rows.map(rowToArticle);
  } catch (error) {
    log.error(`Failed to search articles: ${error}`);
    return [];
  }
}

// ─── Read: search by keyword array (entity watcher) ─────────────────

export async function searchArticlesByKeywords(
  keywords: string[],
  locale?: MonitorLocale,
  limit = 50,
  excludePatterns: string[] = []
): Promise<MonitorArticle[]> {
  if (keywords.length === 0) return [];

  try {
    const patterns = keywords.map((k) => `%${k}%`);
    const conditions = [
      `(title ILIKE ANY($1) OR excerpt ILIKE ANY($1))`,
      "(published_at > now() - interval '25 hours' OR (published_at IS NULL AND last_seen_at > now() - interval '25 hours'))",
    ];
    const params: unknown[] = [patterns];

    // Exclude false-positive patterns (e.g. "grünes Licht", "grünen Tisch")
    if (excludePatterns.length > 0) {
      const excludeIlike = excludePatterns.map((p) => `%${p}%`);
      params.push(excludeIlike);
      conditions.push(
        `NOT (title ILIKE ANY($${params.length}) OR excerpt ILIKE ANY($${params.length}))`
      );
    }

    if (locale) {
      params.push(locale);
      conditions.push(`locale = $${params.length}`);
    }

    params.push(limit);
    const rows = await db().query(
      `SELECT url, title, excerpt, source, locale, published_at, primary_topic, topic_scores
       FROM monitor_articles
       WHERE ${conditions.join(' AND ')}
       ORDER BY published_at DESC NULLS LAST
       LIMIT $${params.length}`,
      params
    );

    return rows.map(rowToArticle);
  } catch (error) {
    log.error(`Failed to search by keywords: ${error}`);
    return [];
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

function rowToArticle(row: Record<string, unknown>): MonitorArticle {
  return {
    url: row.url as string,
    title: row.title as string,
    excerpt: (row.excerpt as string) || '',
    source: row.source as string,
    locale: row.locale as MonitorLocale,
    publishedAt: row.published_at ? (row.published_at as string) : null,
    primaryTopic: (row.primary_topic as TopicCategory) || null,
    topics: (row.topic_scores as Record<string, number>) || {},
  };
}
