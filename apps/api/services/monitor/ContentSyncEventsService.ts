/**
 * The "Was ist passiert" feed: recently *published* Landesverband articles,
 * read live from the Qdrant corpus and grouped by publish day.
 *
 * The feed used to read a sync-event log (`content_sync_articles`) recording
 * only newly stored/changed articles. That made it dominated by whichever
 * Landesverband was last freshly (re)scraped — a single LV's full backfill
 * would flood the feed while already-indexed LVs (no new sync events) stayed
 * invisible. Sourcing it from the `landesverbaende_documents` corpus by publish
 * date instead means every Landesverband always shows its latest content
 * regardless of sync churn. The feed is Landesverband-only by design.
 *
 * The sync-event ingestion below (`upsertSyncEvents`) is retained — it still
 * records run provenance via POST /api/internal/monitor/sync-events — but the
 * read path no longer depends on it.
 */
import {
  whatHappenedArticleSchema,
  whatHappenedSummaryResponseSchema,
  type MonitorLocale,
  type SyncArticleSourceGroup,
  type SyncEventInput,
  type WhatHappenedArticle,
  type WhatHappenedDay,
  type WhatHappenedQuery,
  type WhatHappenedResult,
  type WhatHappenedSummaryResult,
} from '@gruenerator/contracts';
import { z } from 'zod';

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { getQdrantInstance } from '../../database/services/QdrantService/index.js';
import { toError } from '../../utils/errors/index.js';
import { createLogger } from '../../utils/logger.js';
import { deleteCachedKey, getCachedJson, setCachedJson } from '../../utils/redis/jsonCache.js';

import { generateDayDigest, type DigestArticle } from './SummaryGraph.js';

const log = createLogger('ContentSyncEvents');

const RETENTION_DAYS = 90;
const INSERT_CHUNK_SIZE = 500;
const DIGEST_ARTICLE_LIMIT = 15;
const EXCERPT_CHARS = 500;
/** Past days are final; today may still gain articles, so refresh its digest hourly. */
const SUMMARY_TTL_PAST_SECONDS = 7 * 24 * 3600;
const SUMMARY_TTL_TODAY_SECONDS = 3600;

/** The feed surfaces at most the last 30 days (the query schema's `days` ceiling). */
const FEED_WINDOW_DAYS = 30;
/** Short-circuits the two filtered scrolls (one page each) — a convenience, not load-bearing. */
const RECENT_CACHE_TTL_SECONDS = 15 * 60;
const SCROLL_PAGE = 1000;
/**
 * Safety bound per scroll call (chunk_index=0 points = articles). Warns if hit.
 * loadRecentLvArticles runs two scrolls, so its combined ceiling is twice this.
 */
const SCROLL_MAX_PER_SCROLL = 40_000;

/**
 * All Landesverbände share one Qdrant collection, partitioned by the payload
 * `landesverband` short code (e.g. 'BY', 'BY-F', 'HE'). The feed reads only
 * this collection — Landesverband-only by design.
 */
const LV_COLLECTION = 'landesverbaende_documents';
const LV_SOURCE_GROUP: SyncArticleSourceGroup = 'landesverbaende';
/** Fallback when a point carries no `source_name`. */
const LV_FALLBACK_NAME = 'Landesverband';

const recentArticlesSchema = z.array(whatHappenedArticleSchema);

function summaryCacheKey(date: string, locale: MonitorLocale): string {
  return `monitor:what-happened-summary:${date}:${locale}`;
}

/** The LV feed is locale-independent (all Landesverbände are German), so one key. */
const RECENT_CACHE_KEY = 'monitor:what-happened-lv';

function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Shift a 'YYYY-MM-DD' day by `delta` days, staying in UTC. */
function utcDayOffset(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/**
 * Reduce a payload date string to its UTC calendar day, or null if it isn't a
 * real `YYYY-MM-DD[...]` date. Scrapers store published_at inconsistently
 * (date-only for LVs, full ISO with offset for gruene.at), so we key off the
 * leading date and reject impossible dates like 2024-02-31.
 */
function toUtcDay(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const day = `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== day) return null;
  return day;
}

/** The day an article is bucketed under: publish day, else index day. */
function dayOf(article: WhatHappenedArticle): string | null {
  return toUtcDay(article.publishedAt) ?? toUtcDay(article.indexedAt);
}

function pickString(payload: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const v = payload[key];
    if (typeof v === 'string' && v.trim().length > 0) return v;
  }
  return null;
}

function localeOfSourceGroup(sourceGroupId: string): MonitorLocale {
  return sourceGroupId === 'gruene-at' ? 'at' : 'de';
}

function db() {
  return getPostgresInstance();
}

export interface SyncRunContext {
  runId: string | null;
  runUrl: string | null;
}

/**
 * Batch-upsert article events. One row per article per UTC day: a retried POST
 * is a no-op, and an article stored and later updated on the same day keeps
 * its 'stored' badge (new today beats updated today).
 */
export async function upsertSyncEvents(
  events: SyncEventInput[],
  run: SyncRunContext
): Promise<number> {
  if (events.length === 0) return 0;

  // A URL recorded twice in one batch would hit the same conflict target twice
  // within one INSERT, which Postgres rejects. Keep one event per URL ('stored'
  // wins over 'updated', mirroring the upsert's CASE).
  const byUrl = new Map<string, SyncEventInput>();
  for (const e of events) {
    const prev = byUrl.get(e.sourceUrl);
    if (!prev || prev.eventType !== 'stored') byUrl.set(e.sourceUrl, e);
  }
  const deduped = [...byUrl.values()];

  let upserted = 0;
  for (let start = 0; start < deduped.length; start += INSERT_CHUNK_SIZE) {
    const chunk = deduped.slice(start, start + INSERT_CHUNK_SIZE);
    const placeholders: string[] = [];
    const params: unknown[] = [];
    for (let i = 0; i < chunk.length; i++) {
      const e = chunk[i];
      const o = i * 12;
      placeholders.push(
        `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6}, $${o + 7}, $${o + 8}, ` +
          `$${o + 9}::timestamptz, $${o + 10}::timestamptz, ` +
          `($${o + 10}::timestamptz AT TIME ZONE 'UTC')::date, $${o + 11}, $${o + 12})`
      );
      params.push(
        e.title,
        e.sourceUrl,
        e.sourceGroupId,
        e.sourceName,
        e.excerpt,
        e.landesverband,
        e.collection,
        e.eventType,
        e.publishedAt,
        e.indexedAt,
        run.runId,
        run.runUrl
      );
    }

    const result = await db().query(
      `INSERT INTO content_sync_articles
         (title, source_url, source_group_id, source_name, excerpt, landesverband, collection,
          event_type, published_at, indexed_at, event_date, sync_run_id, sync_run_url)
       VALUES ${placeholders.join(', ')}
       ON CONFLICT (source_url, event_date) DO UPDATE SET
         title = EXCLUDED.title,
         excerpt = COALESCE(EXCLUDED.excerpt, content_sync_articles.excerpt),
         event_type = CASE
           WHEN content_sync_articles.event_type = 'stored' THEN 'stored'
           ELSE EXCLUDED.event_type
         END,
         published_at = EXCLUDED.published_at,
         indexed_at = EXCLUDED.indexed_at,
         sync_run_id = EXCLUDED.sync_run_id,
         sync_run_url = EXCLUDED.sync_run_url
       RETURNING id`,
      params
    );
    upserted += result.length;
  }

  try {
    await db().query(
      `DELETE FROM content_sync_articles
       WHERE event_date < (now() AT TIME ZONE 'UTC')::date - $1::int`,
      [RETENTION_DAYS]
    );
  } catch (error) {
    log.warn(`Retention prune failed (non-fatal): ${toError(error).message}`);
  }

  // New events land on today's bucket — drop its cached AI digest per locale.
  try {
    const locales = new Set(deduped.map((e) => localeOfSourceGroup(e.sourceGroupId)));
    await Promise.all(
      [...locales].map((locale) => deleteCachedKey(summaryCacheKey(utcToday(), locale)))
    );
  } catch (error) {
    log.warn(`Digest cache invalidation failed (non-fatal): ${toError(error).message}`);
  }

  log.info(`Upserted ${upserted} content-sync article events`);
  return upserted;
}

/** Sort key: publish date if known, else index date. */
function sortKey(a: WhatHappenedArticle): string {
  return a.publishedAt ?? a.indexedAt;
}

/** Build a feed article from a Qdrant LV point, or null if it has no URL/date. */
function toCorpusArticle(payload: Record<string, unknown>): WhatHappenedArticle | null {
  const sourceUrl = pickString(payload, 'source_url', 'url', 'external_url');
  if (!sourceUrl) return null;
  const publishedAt = pickString(payload, 'published_at', 'publishedAt', 'date');
  const indexedAt = pickString(payload, 'indexed_at', 'indexedAt') ?? publishedAt;
  if (!indexedAt) return null; // no date at all → can't place it on the feed

  const fullText = pickString(payload, 'full_text', 'chunk_text', 'description', 'summary');
  const excerpt = fullText ? fullText.replace(/\s+/g, ' ').trim().slice(0, EXCERPT_CHARS) : null;

  return {
    title: pickString(payload, 'title', 'name', 'headline') ?? 'Ohne Titel',
    sourceUrl,
    sourceGroupId: LV_SOURCE_GROUP,
    sourceName: pickString(payload, 'source_name') ?? LV_FALLBACK_NAME,
    excerpt,
    landesverband: pickString(payload, 'landesverband'),
    collection: LV_COLLECTION,
    // Every corpus article is a published item; there is no stored/updated
    // distinction here. Kept as 'stored' for response-shape compatibility.
    eventType: 'stored',
    publishedAt,
    indexedAt,
    syncRunUrl: null,
  };
}

/**
 * One filtered, paginated scroll over the LV corpus, returning the point
 * payloads. Bounded by SCROLL_MAX_PER_SCROLL (warns if hit).
 */
async function scrollLvPayloads(
  client: NonNullable<ReturnType<typeof getQdrantInstance>['client']>,
  must: Record<string, unknown>[]
): Promise<Record<string, unknown>[]> {
  const payloads: Record<string, unknown>[] = [];
  let offset: string | number | null = null;
  let scanned = 0;
  while (scanned < SCROLL_MAX_PER_SCROLL) {
    const result = await client.scroll(LV_COLLECTION, {
      filter: { must },
      limit: SCROLL_PAGE,
      with_payload: true,
      with_vector: false,
      ...(offset != null && { offset }),
    });
    const points = result.points ?? [];
    for (const p of points) payloads.push((p.payload as Record<string, unknown>) ?? {});
    scanned += points.length;
    const next = result.next_page_offset;
    offset = typeof next === 'string' || typeof next === 'number' ? next : null;
    if (!offset || points.length === 0) break;
  }
  if (scanned >= SCROLL_MAX_PER_SCROLL) {
    log.warn(
      `what-happened scan hit the ${SCROLL_MAX_PER_SCROLL}-article cap; some recent LV articles may be omitted`
    );
  }
  return payloads;
}

/**
 * Build the recent-article set (published within FEED_WINDOW_DAYS) from the
 * Landesverband corpus. published_at is keyword-indexed in Qdrant, which rules
 * out `order_by` (400, see #3190) but not a datetime `range` filter: Qdrant
 * evaluates that against the raw payload, and both stored formats
 * ("2025-02-21", "2025-02-17T09:18:18.000Z") parse. Two filtered scrolls
 * (chunk_index=0 = one point per article) mirror `dayOf`: an article is recent
 * if its published_at day is in the window, or, lacking published_at, its
 * indexed_at day is. One page each instead of walking the whole corpus
 * (~9 000 points, ~1 s). The Node-side day check stays as a cheap guard, the
 * Redis cache as a short-circuit.
 */
async function loadRecentLvArticles(): Promise<WhatHappenedArticle[]> {
  const cached = await getCachedJson(RECENT_CACHE_KEY, recentArticlesSchema);
  if (cached) return cached;

  const today = utcToday();
  const cutoffDay = utcDayOffset(today, -(FEED_WINDOW_DAYS - 1));

  const qdrant = getQdrantInstance();
  await qdrant.init();
  const client = qdrant.client;
  if (!client) {
    log.warn('Qdrant client unavailable for the what-happened feed');
    return [];
  }

  const chunkZero = { key: 'chunk_index', match: { value: 0 } };
  const publishedInWindow = [chunkZero, { key: 'published_at', range: { gte: cutoffDay } }];
  const indexedInWindow = [
    chunkZero,
    { is_empty: { key: 'published_at' } },
    { key: 'indexed_at', range: { gte: cutoffDay } },
  ];

  const articles: WhatHappenedArticle[] = [];
  try {
    const payloads = [
      ...(await scrollLvPayloads(client, publishedInWindow)),
      ...(await scrollLvPayloads(client, indexedInWindow)),
    ];
    for (const payload of payloads) {
      const article = toCorpusArticle(payload);
      if (!article) continue;
      const day = dayOf(article);
      if (!day || day < cutoffDay || day > today) continue;
      articles.push(article);
    }
  } catch (error) {
    log.warn(`what-happened corpus scroll failed: ${toError(error).message}`);
    return [];
  }

  // Newest first, then dedupe by URL (the same article can be re-indexed or
  // aliased under multiple paths). The first (newest) occurrence wins.
  articles.sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
  const seen = new Set<string>();
  const deduped = articles.filter((a) => (seen.has(a.sourceUrl) ? false : seen.add(a.sourceUrl)));

  await setCachedJson(RECENT_CACHE_KEY, deduped, RECENT_CACHE_TTL_SECONDS);
  return deduped;
}

/**
 * Day-grouped feed of recently published Landesverband articles. The
 * landesverbaende facet is computed before the expert-mode filters so the
 * filter options stay stable while a filter is active. The `locale` query is
 * accepted but does not narrow results — all Landesverbände are German.
 */
export async function getWhatHappened(query: WhatHappenedQuery): Promise<WhatHappenedResult> {
  const days = query.days ?? 7;
  const recent = await loadRecentLvArticles();

  const today = utcToday();
  const cutoffDay = utcDayOffset(today, -(days - 1));
  const inWindow = recent.filter((a) => {
    const day = dayOf(a);
    return day !== null && day >= cutoffDay && day <= today;
  });

  const sourceGroups = [...new Set(inWindow.map((a) => a.sourceGroupId))].sort();
  const landesverbaende = [
    ...new Set(inWindow.map((a) => a.landesverband).filter((lv): lv is string => lv !== null)),
  ].sort();

  const filtered = inWindow.filter(
    (a) =>
      (!query.sourceGroup || a.sourceGroupId === query.sourceGroup) &&
      (!query.landesverband || a.landesverband === query.landesverband) &&
      (!query.eventType || a.eventType === query.eventType)
  );

  const dayBuckets = new Map<string, WhatHappenedDay>();
  for (const article of filtered) {
    const date = dayOf(article);
    if (!date) continue;
    let bucket = dayBuckets.get(date);
    if (!bucket) {
      bucket = { date, counts: { stored: 0, updated: 0 }, articles: [] };
      dayBuckets.set(date, bucket);
    }
    bucket.counts.stored += 1;
    bucket.articles.push(article);
  }

  // Newest day first; articles within a day already arrive newest-first.
  const dayList = [...dayBuckets.values()].sort((a, b) => b.date.localeCompare(a.date));

  return {
    days: dayList,
    totalCount: filtered.length,
    sourceGroups: sourceGroups as SyncArticleSourceGroup[],
    landesverbaende,
  };
}

/**
 * Lazy AI digest of one feed day, drawn from the same recent LV set as the
 * feed. Returns null when the day has no articles (handler → 404).
 */
export async function getWhatHappenedDaySummary(
  date: string,
  locale: MonitorLocale
): Promise<WhatHappenedSummaryResult | null> {
  const key = summaryCacheKey(date, locale);
  const cached = await getCachedJson(key, whatHappenedSummaryResponseSchema);
  if (cached) return cached;

  const recent = await loadRecentLvArticles();
  const dayArticles = recent.filter((a) => dayOf(a) === date);
  if (dayArticles.length === 0) return null;

  const digestArticles: DigestArticle[] = dayArticles.slice(0, DIGEST_ARTICLE_LIMIT).map((a) => ({
    title: a.title,
    url: a.sourceUrl,
    source: a.sourceName,
    excerpt: a.excerpt ?? '',
  }));
  const summary = await generateDayDigest(digestArticles);

  const result: WhatHappenedSummaryResult = {
    date,
    summary,
    articleCount: dayArticles.length,
    generatedAt: new Date().toISOString(),
  };

  const ttl = date === utcToday() ? SUMMARY_TTL_TODAY_SECONDS : SUMMARY_TTL_PAST_SECONDS;
  await setCachedJson(key, result, ttl);
  return result;
}
