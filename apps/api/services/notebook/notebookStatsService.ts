import {
  getSystemCollectionConfig,
  applyDefaultFilter,
} from '../../config/systemCollectionsConfig.js';
import { getQdrantInstance } from '../../database/services/QdrantService/index.js';
import { createLogger } from '../../utils/logger.js';
import redisClient from '../../utils/redis/client.js';

import { getLatestKeywordSnapshot } from './notebookKeywordSnapshotService.js';

import type { ScrollPoint } from '../../database/services/QdrantService/operations/types.js';

const log = createLogger('notebookStats');

const CACHE_TTL_SECONDS = 24 * 60 * 60;
const MONTHLY_SCROLL_PAGE = 500;
const MONTHLY_SCROLL_MAX = 5000;
const CATEGORY_TOP_N = 10;
const MONTHLY_BUCKETS = 12;
const TOP_WORDS_LIMIT = 40;

export interface FacetBucket {
  value: string;
  count: number;
}

export interface MonthBucket {
  month: string;
  count: number;
}

export interface TopicCount {
  topic: string;
  count: number;
}

export interface NotebookStats {
  totalDocuments: number;
  categoryDistribution: FacetBucket[];
  sourceDistribution: FacetBucket[];
  dateRange: { min: string | null; max: string | null };
  monthlyActivity: MonthBucket[];
  topWords: Array<{ word: string; count: number }>;
  topicDistribution: TopicCount[];
  topicSampleSize: number;
}

function emptyStats(): NotebookStats {
  return {
    totalDocuments: 0,
    categoryDistribution: [],
    sourceDistribution: [],
    dateRange: { min: null, max: null },
    monthlyActivity: [],
    topWords: [],
    topicDistribution: [],
    topicSampleSize: 0,
  };
}

/**
 * Paginated unsorted scroll. Required because `landesverbaende_documents`
 * indexes `published_at` as `keyword` and Qdrant's `order_by` rejects that
 * with 400 Bad Request. We page through the collection and bucket dates
 * in Node — robust regardless of payload index type.
 */
async function scrollAllForMonthly(
  client: ReturnType<typeof getQdrantInstance>['client'],
  collection: string,
  filter: Record<string, unknown>
): Promise<ScrollPoint[]> {
  if (!client) return [];
  const hasFilter = Object.keys(filter).length > 0;
  const acc: ScrollPoint[] = [];
  let offset: string | number | null = null;
  let pages = 0;
  const maxPages = Math.ceil(MONTHLY_SCROLL_MAX / MONTHLY_SCROLL_PAGE);

  while (pages < maxPages && acc.length < MONTHLY_SCROLL_MAX) {
    const result = await client.scroll(collection, {
      ...(hasFilter && { filter }),
      limit: MONTHLY_SCROLL_PAGE,
      with_payload: true,
      with_vector: false,
      ...(offset != null && { offset }),
    });
    const points = result.points ?? [];
    for (const p of points) {
      acc.push({
        id: p.id,
        payload: (p.payload as Record<string, unknown>) ?? {},
        vector: null,
      });
    }
    const next = result.next_page_offset;
    offset = typeof next === 'string' || typeof next === 'number' ? next : null;
    if (!offset || points.length === 0) break;
    pages++;
  }

  return acc;
}

/**
 * Try multiple candidate fields and return the first non-empty result.
 * Different scrapers store the document category under different payload keys:
 *   gruene.de / bundestag / böll / grünblog → primary_category
 *   landesverbaende_documents               → content_type
 */
async function getCategoryDistribution(
  qdrant: ReturnType<typeof getQdrantInstance>,
  collection: string,
  filter: Record<string, unknown> | null,
  collectionId: string
): Promise<FacetBucket[]> {
  const candidates = ['primary_category', 'content_type'];
  for (const field of candidates) {
    try {
      const result = await qdrant.getFieldValueCounts(collection, field, CATEGORY_TOP_N, filter);
      if (result.length > 0) {
        log.debug(`[${collectionId}] category field hit: ${field} (${result.length} buckets)`);
        return result;
      }
    } catch (error) {
      log.warn(
        `[${collectionId}] facet ${field} failed: ${error instanceof Error ? error.message : error}`
      );
    }
  }
  return [];
}

function deriveDateRange(points: ScrollPoint[]): { min: string | null; max: string | null } {
  let min: string | null = null;
  let max: string | null = null;
  for (const p of points) {
    const payload = p.payload as Record<string, unknown>;
    const raw = payload.published_at ?? payload.indexed_at;
    if (typeof raw !== 'string') continue;
    if (min === null || raw < min) min = raw;
    if (max === null || raw > max) max = raw;
  }
  return { min, max };
}

function buildMonthlyActivity(points: ScrollPoint[]): MonthBucket[] {
  const now = new Date();
  const buckets = new Map<string, number>();
  for (let i = MONTHLY_BUCKETS - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    buckets.set(key, 0);
  }

  for (const p of points) {
    const payload = p.payload as Record<string, unknown>;
    const raw = payload.published_at ?? payload.indexed_at;
    if (typeof raw !== 'string') continue;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (buckets.has(key)) {
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
  }

  return Array.from(buckets.entries()).map(([month, count]) => ({ month, count }));
}

interface SnapshotData {
  topWords: Array<{ word: string; count: number }>;
  topicDistribution: TopicCount[];
  topicSampleSize: number;
}

const EMPTY_SNAPSHOT: SnapshotData = {
  topWords: [],
  topicDistribution: [],
  topicSampleSize: 0,
};

/**
 * Read the most recent precomputed monthly snapshot for this collection.
 * Snapshots are computed by `refreshAllKeywordSnapshots()` on the 1st of each
 * month via a GitHub Actions cron — never inline on a stats request.
 *
 * Both the keyword cloud and topic ranking come from the same row, so we read
 * once and split the data here.
 */
async function readSnapshotData(collectionId: string): Promise<SnapshotData> {
  try {
    const snapshot = await getLatestKeywordSnapshot(collectionId);
    if (!snapshot) return EMPTY_SNAPSHOT;

    const topWords = snapshot.keywords.map((k) => ({ word: k.keyword, count: k.count }));
    const topicDistribution: TopicCount[] = Object.entries(snapshot.topicCounts)
      .filter(([, count]) => typeof count === 'number' && count > 0)
      .map(([topic, count]) => ({ topic, count: count as number }))
      .sort((a, b) => b.count - a.count);

    return {
      topWords,
      topicDistribution,
      topicSampleSize: snapshot.sampleSize,
    };
  } catch (error) {
    log.warn(
      `readSnapshotData failed for ${collectionId}: ${error instanceof Error ? error.message : String(error)}`
    );
    return EMPTY_SNAPSHOT;
  }
}

async function fetchStatsForCollection(collectionId: string): Promise<NotebookStats> {
  const config = getSystemCollectionConfig(collectionId);
  if (!config) {
    log.debug(`Unknown system collection: ${collectionId}`);
    return emptyStats();
  }

  const qdrant = getQdrantInstance();
  await qdrant.init();
  if (!qdrant.client) {
    log.warn('Qdrant client unavailable');
    return emptyStats();
  }

  const baseFilter = applyDefaultFilter(collectionId, undefined) ?? {};
  // Each notebook document is split into multiple Qdrant points (chunks).
  // For user-facing counts we want UNIQUE DOCUMENTS, so we filter to chunk_index=0
  // (the first/only "head" chunk per document). chunk_index isn't indexed, so this
  // does a payload scan — ~3x slower than the indexed path but still <200ms per
  // call, and the result is cached in Redis for 24h.
  const baseMustRaw = baseFilter.must;
  const baseMust = Array.isArray(baseMustRaw) ? (baseMustRaw as unknown[]) : [];
  const filterRecord: Record<string, unknown> = {
    ...(baseFilter as unknown as Record<string, unknown>),
    must: [...baseMust, { key: 'chunk_index', match: { value: 0 } }],
  };
  const filterForCount = filterRecord;

  log.info(
    `[${collectionId}] qdrantCollection=${config.qdrantCollection} filter=${JSON.stringify(filterRecord)}`
  );

  const [totalDocuments, categoryDistribution, sourceDistribution, monthlyPoints, snapshotData] =
    await Promise.all([
      qdrant.client
        .count(config.qdrantCollection, {
          ...(filterForCount && { filter: filterForCount as Record<string, unknown> }),
          exact: true,
        })
        .then((r) => r.count)
        .catch((err: unknown) => {
          log.warn(`count failed for ${collectionId}: ${err instanceof Error ? err.message : err}`);
          return 0;
        }),
      getCategoryDistribution(qdrant, config.qdrantCollection, filterForCount, collectionId),
      qdrant
        .getFieldValueCounts(config.qdrantCollection, 'source_id', CATEGORY_TOP_N, filterForCount)
        .catch((err: unknown) => {
          log.warn(
            `source_id facet failed for ${collectionId}: ${err instanceof Error ? err.message : err}`
          );
          return [];
        }),
      scrollAllForMonthly(qdrant.client, config.qdrantCollection, filterRecord).catch(
        (err: unknown) => {
          log.warn(
            `monthly scroll failed for ${collectionId}: ${err instanceof Error ? err.message : err}`
          );
          return [] as ScrollPoint[];
        }
      ),
      readSnapshotData(collectionId),
    ]);

  const monthlyActivity = buildMonthlyActivity(monthlyPoints);
  const monthlyTotal = monthlyActivity.reduce((s, m) => s + m.count, 0);
  const dateRange = deriveDateRange(monthlyPoints);

  log.info(
    `[${collectionId}] total=${totalDocuments} categories=${categoryDistribution.length} ` +
      `sources=${sourceDistribution.length} dateRange=${dateRange.min ?? '–'}..${dateRange.max ?? '–'} ` +
      `monthlyPoints=${monthlyPoints.length} monthlyTotal=${monthlyTotal} ` +
      `topWords=${snapshotData.topWords.length} topics=${snapshotData.topicDistribution.length}`
  );

  if (monthlyPoints.length > 0 && monthlyTotal === 0) {
    const samplePayload = monthlyPoints[0]?.payload as Record<string, unknown> | undefined;
    const sampleKeys = samplePayload ? Object.keys(samplePayload).slice(0, 15) : [];
    log.warn(
      `[${collectionId}] monthly scroll returned ${monthlyPoints.length} points but none fell in last-12-months window. Sample payload keys: ${JSON.stringify(sampleKeys)}; sample published_at=${JSON.stringify(samplePayload?.published_at)}; sample indexed_at=${JSON.stringify(samplePayload?.indexed_at)}`
    );
  }

  return {
    totalDocuments,
    categoryDistribution,
    sourceDistribution,
    dateRange,
    monthlyActivity,
    topWords: snapshotData.topWords,
    topicDistribution: snapshotData.topicDistribution,
    topicSampleSize: snapshotData.topicSampleSize,
  };
}

function mergeStats(parts: NotebookStats[]): NotebookStats {
  if (parts.length === 0) return emptyStats();
  if (parts.length === 1) return parts[0];

  const mergedCategories = new Map<string, number>();
  const mergedSources = new Map<string, number>();
  const mergedMonths = new Map<string, number>();
  const mergedWords = new Map<string, number>();
  const mergedTopics = new Map<string, number>();
  let totalDocuments = 0;
  let topicSampleSize = 0;
  let min: string | null = null;
  let max: string | null = null;

  for (const p of parts) {
    totalDocuments += p.totalDocuments;
    topicSampleSize += p.topicSampleSize;
    for (const { value, count } of p.categoryDistribution) {
      mergedCategories.set(value, (mergedCategories.get(value) ?? 0) + count);
    }
    for (const { value, count } of p.sourceDistribution) {
      mergedSources.set(value, (mergedSources.get(value) ?? 0) + count);
    }
    for (const { month, count } of p.monthlyActivity) {
      mergedMonths.set(month, (mergedMonths.get(month) ?? 0) + count);
    }
    for (const { word, count } of p.topWords) {
      mergedWords.set(word, (mergedWords.get(word) ?? 0) + count);
    }
    for (const { topic, count } of p.topicDistribution) {
      mergedTopics.set(topic, (mergedTopics.get(topic) ?? 0) + count);
    }
    if (p.dateRange.min && (!min || p.dateRange.min < min)) min = p.dateRange.min;
    if (p.dateRange.max && (!max || p.dateRange.max > max)) max = p.dateRange.max;
  }

  const toFacet = (m: Map<string, number>, n: number): FacetBucket[] =>
    [...m.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, n);

  return {
    totalDocuments,
    categoryDistribution: toFacet(mergedCategories, CATEGORY_TOP_N),
    sourceDistribution: toFacet(mergedSources, CATEGORY_TOP_N),
    dateRange: { min, max },
    monthlyActivity: [...mergedMonths.entries()]
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-MONTHLY_BUCKETS),
    topWords: [...mergedWords.entries()]
      .map(([word, count]) => ({ word, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, TOP_WORDS_LIMIT),
    topicDistribution: [...mergedTopics.entries()]
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count),
    topicSampleSize,
  };
}

function cacheKey(collectionIds: string[]): string {
  const sorted = [...collectionIds].sort();
  return `notebook:stats:${sorted.join(',')}`;
}

async function readCache(key: string): Promise<NotebookStats | null> {
  try {
    const raw = await redisClient.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as NotebookStats;
  } catch (error) {
    log.warn(`Redis cache read failed: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

async function writeCache(key: string, value: NotebookStats): Promise<void> {
  try {
    await redisClient.set(key, JSON.stringify(value), { EX: CACHE_TTL_SECONDS });
  } catch (error) {
    log.warn(`Redis cache write failed: ${error instanceof Error ? error.message : error}`);
  }
}

export async function getNotebookStats(
  collectionIds: string[],
  options: { refresh?: boolean } = {}
): Promise<NotebookStats> {
  if (collectionIds.length === 0) return emptyStats();

  const key = cacheKey(collectionIds);
  if (!options.refresh) {
    const cached = await readCache(key);
    if (cached) {
      log.debug(`cache hit for ${key}`);
      return cached;
    }
  } else {
    log.info(`cache bypass (refresh=true) for ${key}`);
  }

  log.info(`fetching fresh stats for ${key}`);
  const parts = await Promise.all(collectionIds.map((id) => fetchStatsForCollection(id)));
  const merged = mergeStats(parts);
  await writeCache(key, merged);
  return merged;
}
