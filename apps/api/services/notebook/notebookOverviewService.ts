/**
 * Übersicht page of a system notebook.
 *
 * One filtered scroll over the head chunks (chunk_index=0, one point per
 * document) with a handful of payload fields, aggregated in Node. Measured on
 * 27.09.2026 against production: every system notebook finishes in ≤450 ms
 * uncached (largest: KommunalWiki, 1655 documents). Facets were the other
 * option, but `content_type`/`source_id` carry no payload index outside the
 * LV collection (facet → 400), and a facet cannot cross topic with month.
 */

import {
  notebookOverviewResponseSchema,
  topicCategorySchema,
  type NotebookOverviewDocument,
  type NotebookOverviewResponse,
  type NotebookTopicTrend,
  type TopicCategory,
} from '@gruenerator/contracts';

import {
  applyDefaultFilter,
  getSystemCollectionConfig,
} from '../../config/systemCollectionsConfig.js';
import { getQdrantInstance } from '../../database/services/QdrantService/index.js';
import { toError } from '../../utils/errors/index.js';
import { createLogger } from '../../utils/logger.js';
import { getCachedJson, setCachedJson } from '../../utils/redis/jsonCache.js';

import { getLatestKeywordSnapshot } from './notebookKeywordSnapshotService.js';
import { dedupeByUrlOrTitle, toCard } from './notebookRecentService.js';

const log = createLogger('notebookOverview');

const CACHE_TTL_SECONDS = 12 * 60 * 60;
const SCROLL_PAGE = 1000;
const MONTHS = 24;
const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_WINDOW_DAYS = 90;
/** The trend compares the last 90 days against the 12 months before them. */
const PRIOR_WINDOW_DAYS = 365;
const TREND_MIN_RECENT = 15;
const TREND_MIN_PRIOR = 30;
/** Two-sided 95 % — a fixed percentage-point threshold flagged nearly every topic on ~60 recent documents. */
const TREND_Z = 1.96;
const TOP_PERSONS = 12;
const RECENT_DOCS = 6;
const TOP_TERMS = 40;
const LV_COLLECTION = 'landesverbaende_documents';

const HEAD_FIELDS = [
  'published_at',
  'primary_topic',
  'persons',
  'content_type',
  'content_type_label',
  'primary_category',
  'source_id',
  'source_name',
];

export interface HeadDoc {
  id: string | number;
  publishedAt: string | null;
  primaryTopic: TopicCategory | null;
  persons: string[];
  contentType: string | null;
  contentTypeLabel: string | null;
  sourceId: string | null;
  sourceName: string | null;
}

export type OverviewAggregate = Omit<
  NotebookOverviewResponse,
  'collectionId' | 'computedAt' | 'recent' | 'terms'
> & {
  /** Newest dated documents first; the caller loads their full payload. */
  recentIds: Array<string | number>;
};

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function toHeadDoc(id: string | number, payload: Record<string, unknown>): HeadDoc {
  const topic = topicCategorySchema.safeParse(payload.primary_topic);
  const persons = Array.isArray(payload.persons)
    ? payload.persons.filter((p): p is string => typeof p === 'string')
    : [];
  return {
    id,
    publishedAt: str(payload.published_at),
    primaryTopic: topic.success ? topic.data : null,
    persons,
    // LV and gruene.de carry `content_type`; Bundestag only `primary_category`.
    contentType: str(payload.content_type) ?? str(payload.primary_category),
    contentTypeLabel: str(payload.content_type_label),
    sourceId: str(payload.source_id),
    sourceName: str(payload.source_name),
  };
}

/** Timestamp of a usable publication date, else null (missing, unparseable, future). */
function publishedTime(doc: HeadDoc, now: number): number | null {
  if (!doc.publishedAt) return null;
  const t = Date.parse(doc.publishedAt);
  if (!Number.isFinite(t) || t > now + DAY_MS) return null;
  return t;
}

/**
 * Month key as written in the payload ("2023-11-14T15:31:42+01:00" → "2023-11"),
 * so a post published at 00:30 local time is not shifted into the previous
 * month by a UTC conversion.
 */
function monthKey(publishedAt: string, t: number): string {
  return /^\d{4}-\d{2}/.test(publishedAt)
    ? publishedAt.slice(0, 7)
    : new Date(t).toISOString().slice(0, 7);
}

function monthWindow(now: Date): string[] {
  const keys: string[] = [];
  for (let i = MONTHS - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    keys.push(d.toISOString().slice(0, 7));
  }
  return keys;
}

function increment<K>(map: Map<K, number>, key: K): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function topOf<K>(map: Map<K, number>): K | null {
  let best: K | null = null;
  let bestCount = 0;
  for (const [key, count] of map) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return best;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Single-token names are what the NER cleanup (#2741) could not attach to a
 * full name: "Link", "Unsplash", "Schwarz-Rot", a bare "Merz". None belongs in
 * a list of people.
 */
function isFullName(name: string): boolean {
  return name.trim().split(/\s+/).length >= 2;
}

export function trendOf(
  recentCount: number,
  recentTotal: number,
  priorCount: number,
  priorTotal: number
): NotebookTopicTrend | null {
  if (recentTotal < TREND_MIN_RECENT || priorTotal < TREND_MIN_PRIOR) return null;
  // Two-proportion z-test: is the recent share distinguishable from the prior one?
  const pooled = (recentCount + priorCount) / (recentTotal + priorTotal);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / recentTotal + 1 / priorTotal));
  if (se === 0) return 'flat';
  const z = (recentCount / recentTotal - priorCount / priorTotal) / se;
  if (z >= TREND_Z) return 'up';
  if (z <= -TREND_Z) return 'down';
  return 'flat';
}

export function aggregateOverview(
  docs: HeadDoc[],
  now: Date,
  baselineShares: Map<TopicCategory, number> | null
): OverviewAggregate {
  const nowMs = now.getTime();
  const recentStart = nowMs - RECENT_WINDOW_DAYS * DAY_MS;
  const priorStart = recentStart - PRIOR_WINDOW_DAYS * DAY_MS;

  const months = monthWindow(now);
  const monthCounts = new Map<string, number>(months.map((m) => [m, 0]));
  const monthTopics = new Map<string, Map<TopicCategory, number>>();
  const topicCounts = new Map<TopicCategory, number>();
  const topicRecent = new Map<TopicCategory, number>();
  const topicPrior = new Map<TopicCategory, number>();
  const personCounts = new Map<string, number>();
  const personRecent = new Map<string, number>();
  const typeCounts = new Map<string, number>();
  const typeLabels = new Map<string, string>();
  const sourceCounts = new Map<string, number>();
  const sourceLabels = new Map<string, string>();
  const dated: Array<{ id: string | number; t: number }> = [];

  let undated = 0;
  let classified = 0;
  let recentClassified = 0;
  let priorClassified = 0;
  let last30Days = 0;
  let previous30Days = 0;
  let first: { t: number; raw: string } | null = null;
  let last: { t: number; raw: string } | null = null;

  for (const doc of docs) {
    const t = publishedTime(doc, nowMs);
    const isRecent = t !== null && t >= recentStart;
    const isPrior = t !== null && t >= priorStart && t < recentStart;

    if (t === null || !doc.publishedAt) {
      undated++;
    } else {
      dated.push({ id: doc.id, t });
      if (!first || t < first.t) first = { t, raw: doc.publishedAt };
      if (!last || t > last.t) last = { t, raw: doc.publishedAt };
      if (t >= nowMs - 30 * DAY_MS) last30Days++;
      else if (t >= nowMs - 60 * DAY_MS) previous30Days++;

      const month = monthKey(doc.publishedAt, t);
      if (monthCounts.has(month)) {
        increment(monthCounts, month);
        if (doc.primaryTopic) {
          const perTopic = monthTopics.get(month) ?? new Map<TopicCategory, number>();
          increment(perTopic, doc.primaryTopic);
          monthTopics.set(month, perTopic);
        }
      }
    }

    if (doc.primaryTopic) {
      classified++;
      increment(topicCounts, doc.primaryTopic);
      if (isRecent) {
        recentClassified++;
        increment(topicRecent, doc.primaryTopic);
      } else if (isPrior) {
        priorClassified++;
        increment(topicPrior, doc.primaryTopic);
      }
    }

    for (const person of new Set(doc.persons.filter(isFullName))) {
      increment(personCounts, person);
      if (isRecent) increment(personRecent, person);
    }

    if (doc.contentType) {
      increment(typeCounts, doc.contentType);
      if (doc.contentTypeLabel) typeLabels.set(doc.contentType, doc.contentTypeLabel);
    }
    if (doc.sourceId) {
      increment(sourceCounts, doc.sourceId);
      if (doc.sourceName) sourceLabels.set(doc.sourceId, doc.sourceName);
    }
  }

  const byCountDesc = <T extends { count: number }>(a: T, b: T) => b.count - a.count;

  return {
    totals: {
      documents: docs.length,
      undated,
      last30Days,
      previous30Days,
      firstPublished: first?.raw ?? null,
      lastPublished: last?.raw ?? null,
    },
    monthly: months.map((month) => ({
      month,
      count: monthCounts.get(month) ?? 0,
      topTopic: topOf(monthTopics.get(month) ?? new Map<TopicCategory, number>()),
    })),
    topics: [...topicCounts.entries()]
      .map(([topic, count]) => ({
        topic,
        count,
        share: count / classified,
        trend: trendOf(
          topicRecent.get(topic) ?? 0,
          recentClassified,
          topicPrior.get(topic) ?? 0,
          priorClassified
        ),
        baselineShare: baselineShares ? (baselineShares.get(topic) ?? 0) : null,
      }))
      .sort(byCountDesc),
    persons: [...personCounts.entries()]
      .map(([person, count]) => ({ person, count, recentCount: personRecent.get(person) ?? 0 }))
      .sort(byCountDesc)
      .slice(0, TOP_PERSONS),
    contentTypes: [...typeCounts.entries()]
      .map(([value, count]) => ({
        value,
        label: typeLabels.get(value) ?? capitalize(value),
        count,
      }))
      .sort(byCountDesc),
    sources: [...sourceCounts.entries()]
      .map(([value, count]) => ({ value, label: sourceLabels.get(value) ?? value, count }))
      .sort(byCountDesc),
    // Twice the page size: the dedupe below drops TYPO3 alias duplicates.
    recentIds: dated
      .sort((a, b) => b.t - a.t)
      .slice(0, RECENT_DOCS * 2)
      .map((d) => d.id),
  };
}

type QdrantClient = NonNullable<ReturnType<typeof getQdrantInstance>['client']>;

async function scrollHeadDocs(
  client: QdrantClient,
  collection: string,
  filter: Record<string, unknown>
): Promise<HeadDoc[]> {
  const docs: HeadDoc[] = [];
  let offset: string | number | null = null;
  do {
    const page = await client.scroll(collection, {
      filter,
      limit: SCROLL_PAGE,
      with_payload: HEAD_FIELDS,
      with_vector: false,
      ...(offset !== null && { offset }),
    });
    for (const point of page.points) {
      docs.push(toHeadDoc(point.id, (point.payload ?? {}) as Record<string, unknown>));
    }
    const next = page.next_page_offset;
    offset = typeof next === 'string' || typeof next === 'number' ? next : null;
  } while (offset !== null);
  return docs;
}

function headFilter(collectionId: string | null): Record<string, unknown> {
  const base = collectionId ? (applyDefaultFilter(collectionId, undefined) ?? {}) : {};
  return { ...base, must: [...(base.must ?? []), { key: 'chunk_index', match: { value: 0 } }] };
}

/** Topic shares over every Landesverband — the yardstick for one LV's profile. */
async function loadLvBaseline(client: QdrantClient): Promise<Map<TopicCategory, number>> {
  const result = await client.facet(LV_COLLECTION, {
    key: 'primary_topic',
    limit: 50,
    exact: true,
    filter: headFilter(null),
  });
  const counts = new Map<TopicCategory, number>();
  for (const hit of result.hits) {
    const topic = topicCategorySchema.safeParse(hit.value);
    if (topic.success) counts.set(topic.data, hit.count);
  }
  const total = [...counts.values()].reduce((sum, n) => sum + n, 0);
  return new Map([...counts].map(([topic, n]) => [topic, total > 0 ? n / total : 0]));
}

async function loadRecent(
  client: QdrantClient,
  collection: string,
  collectionId: string,
  collectionName: string,
  ids: Array<string | number>
): Promise<NotebookOverviewDocument[]> {
  if (ids.length === 0) return [];
  const points = await client.retrieve(collection, { ids, with_payload: true, with_vector: false });
  const rank = new Map(ids.map((id, i) => [String(id), i]));
  const docs = points
    .sort((a, b) => (rank.get(String(a.id)) ?? 0) - (rank.get(String(b.id)) ?? 0))
    .map((point) => {
      const payload = (point.payload ?? {}) as Record<string, unknown>;
      const themes = Array.isArray(payload.themes)
        ? payload.themes.flatMap((t) => {
            const parsed = topicCategorySchema.safeParse(t);
            return parsed.success ? [parsed.data] : [];
          })
        : [];
      return {
        ...toCard(payload, collectionId, collectionName, point.id),
        contentTypeLabel: str(payload.content_type_label),
        themes,
      };
    });
  return dedupeByUrlOrTitle(docs).slice(0, RECENT_DOCS);
}

async function loadTerms(collectionId: string): Promise<NotebookOverviewResponse['terms']> {
  try {
    const snapshot = await getLatestKeywordSnapshot(collectionId);
    if (!snapshot || snapshot.keywords.length === 0) return null;
    return {
      words: snapshot.keywords
        .slice(0, TOP_TERMS)
        .map((k) => ({ word: k.keyword, count: k.count })),
      sampleSize: snapshot.sampleSize,
      month: snapshot.month,
    };
  } catch (error) {
    log.warn(`keyword snapshot unavailable for ${collectionId}: ${toError(error).message}`);
    return null;
  }
}

async function computeOverview(collectionId: string): Promise<NotebookOverviewResponse | null> {
  const config = getSystemCollectionConfig(collectionId);
  if (!config) return null;

  const qdrant = getQdrantInstance();
  await qdrant.init();
  const client = qdrant.client;
  if (!client) throw new Error('Qdrant client unavailable');

  const collection = config.qdrantCollection;
  const isLv = collection === LV_COLLECTION;
  const t0 = Date.now();
  const [docs, baseline, terms] = await Promise.all([
    scrollHeadDocs(client, collection, headFilter(collectionId)),
    isLv ? loadLvBaseline(client) : Promise.resolve(null),
    loadTerms(collectionId),
  ]);

  const now = new Date();
  const { recentIds, ...aggregate } = aggregateOverview(docs, now, baseline);
  const recent = await loadRecent(client, collection, collectionId, config.name, recentIds);
  log.info(`[${collectionId}] overview over ${docs.length} documents in ${Date.now() - t0}ms`);

  return {
    collectionId,
    computedAt: now.toISOString(),
    ...aggregate,
    recent,
    terms,
  };
}

/** `null` for an unknown collection id. */
export async function getNotebookOverview(
  collectionId: string,
  options: { refresh?: boolean } = {}
): Promise<NotebookOverviewResponse | null> {
  const key = `notebook:overview:${collectionId}`;
  if (!options.refresh) {
    const cached = await getCachedJson(key, notebookOverviewResponseSchema);
    if (cached) return cached;
  }
  const overview = await computeOverview(collectionId);
  if (overview) await setCachedJson(key, overview, CACHE_TTL_SECONDS);
  return overview;
}
