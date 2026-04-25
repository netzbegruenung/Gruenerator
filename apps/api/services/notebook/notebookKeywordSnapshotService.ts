import {
  getSystemCollectionConfig,
  applyDefaultFilter,
  getAllSystemCollectionIds,
} from '../../config/systemCollectionsConfig.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { getQdrantInstance } from '../../database/services/QdrantService/index.js';
import { createLogger } from '../../utils/logger.js';
import { TOPIC_CATEGORIES, type TopicCategory } from '../monitor/types.js';
import { classifyArticles, extractKeywordsBatched } from '../nlp/nlpClient.js';

const log = createLogger('notebookKeywords');

const SAMPLE_SIZE = 80;
const TEXT_CHARS_PER_DOC = 1500;
const TOP_N = 40;
const NLP_BATCH_SIZE = 15;
const NLP_TIMEOUT_MS = 30_000;

export type TopicCountMap = Partial<Record<TopicCategory, number>>;

export interface KeywordSnapshotRecord {
  collectionId: string;
  month: string;
  keywords: Array<{ keyword: string; count: number; topic: string | null }>;
  topicCounts: TopicCountMap;
  totalDocuments: number;
  sampleSize: number;
  computedAt: string;
}

function db() {
  return getPostgresInstance();
}

function currentMonth(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

async function sampleDocuments(
  qdrantCollection: string,
  filter: Record<string, unknown>
): Promise<Array<{ id: string; title: string; text: string }>> {
  const qdrant = getQdrantInstance();
  await qdrant.init();
  if (!qdrant.operations) return [];

  // Scroll a healthy multiple of the sample size and dedupe to first chunks.
  // Unsorted is fine: we want a representative slice, not "most recent"; the
  // monthly cron still gets fresh data because the collection grows over time.
  const points = await qdrant.operations.scrollDocuments(qdrantCollection, filter, {
    limit: SAMPLE_SIZE * 4,
    withPayload: true,
  });

  const docs: Array<{ id: string; title: string; text: string }> = [];
  const seen = new Set<string>();
  for (const p of points) {
    const payload = p.payload as Record<string, unknown>;
    const chunkIndex = payload.chunk_index;
    if (typeof chunkIndex === 'number' && chunkIndex !== 0) continue;
    const url = typeof payload.source_url === 'string' ? payload.source_url : null;
    const dedupeKey = url ?? String(p.id);
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const title = typeof payload.title === 'string' ? payload.title : '';
    const text = typeof payload.chunk_text === 'string' ? payload.chunk_text : '';
    if (!text) continue;

    docs.push({
      id: String(p.id),
      title,
      text: text.slice(0, TEXT_CHARS_PER_DOC),
    });
    if (docs.length >= SAMPLE_SIZE) break;
  }
  return docs;
}

export interface RefreshResult {
  collectionId: string;
  month: string;
  keywordCount: number;
  sampleSize: number;
  totalDocuments: number;
  durationMs: number;
}

/**
 * Compute and persist the keyword snapshot for a single system collection.
 * Replaces any existing row for the same (collection_id, month) pair.
 */
export async function refreshKeywordSnapshot(
  collectionId: string,
  month: string = currentMonth()
): Promise<RefreshResult | null> {
  const config = getSystemCollectionConfig(collectionId);
  if (!config) {
    log.warn(`Unknown system collection: ${collectionId} — skipping`);
    return null;
  }

  const t0 = Date.now();
  const filter = applyDefaultFilter(collectionId, undefined) ?? {};
  const filterRecord: Record<string, unknown> = filter as Record<string, unknown>;

  const qdrant = getQdrantInstance();
  await qdrant.init();
  let totalDocuments = 0;
  if (qdrant.client) {
    try {
      const filterForCount = Object.keys(filterRecord).length > 0 ? filterRecord : null;
      const result = await qdrant.client.count(config.qdrantCollection, {
        ...(filterForCount && { filter: filterForCount as Record<string, unknown> }),
        exact: true,
      });
      totalDocuments = result.count;
    } catch (err) {
      log.warn(`count failed for ${collectionId}: ${err instanceof Error ? err.message : err}`);
    }
  }

  const docs = await sampleDocuments(config.qdrantCollection, filterRecord);
  log.info(
    `[${collectionId}] sampled ${docs.length} docs (target ${SAMPLE_SIZE}); calling NLP /analyze/keywords`
  );

  if (docs.length === 0) {
    log.warn(`[${collectionId}] no sample docs — storing empty snapshot`);
    await db().query(
      `INSERT INTO notebook_keyword_snapshots
         (collection_id, month, keywords, topic_counts, total_documents, sample_size, computed_at)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, now())
       ON CONFLICT (collection_id, month) DO UPDATE
         SET keywords = EXCLUDED.keywords,
             topic_counts = EXCLUDED.topic_counts,
             total_documents = EXCLUDED.total_documents,
             sample_size = EXCLUDED.sample_size,
             computed_at = now()`,
      [collectionId, month, JSON.stringify([]), JSON.stringify({}), totalDocuments, 0]
    );
    return {
      collectionId,
      month,
      keywordCount: 0,
      sampleSize: 0,
      totalDocuments,
      durationMs: Date.now() - t0,
    };
  }

  // Both NLP calls operate on the SAME `docs` sample. Running them in parallel
  // halves wall-clock time on the cron compared to a sequential pipeline.
  // `classifyArticles` doesn't accept a batchSize today (one-shot per call),
  // so for very large samples we'd need a chunked variant — at SAMPLE_SIZE=80
  // it stays well under the 30s NLP timeout.
  const [keywords, classifications] = await Promise.all([
    extractKeywordsBatched(docs, TOP_N, {
      timeoutMs: NLP_TIMEOUT_MS,
      batchSize: NLP_BATCH_SIZE,
    }),
    classifyArticles<TopicCategory>(docs),
  ]);
  if (keywords.length === 0) {
    log.warn(`[${collectionId}] NLP returned 0 keywords (likely failure/timeout)`);
  }
  if (classifications.length === 0) {
    log.warn(`[${collectionId}] NLP topic classification returned 0 results`);
  }

  // Aggregate: count documents whose strongest topic falls in each category.
  // Mirrors MonitorService.buildSnapshot's articleCount semantics — easy
  // mental model: "X notebook documents are primarily about Y topic."
  const topicCounts: TopicCountMap = {};
  for (const cat of TOPIC_CATEGORIES) topicCounts[cat] = 0;
  for (const c of classifications) {
    if (c.primaryTopic && c.primaryTopic in topicCounts) {
      topicCounts[c.primaryTopic] = (topicCounts[c.primaryTopic] ?? 0) + 1;
    }
  }

  const payload = keywords.map((k) => ({
    keyword: k.keyword,
    count: k.count,
    topic: k.topic ?? null,
  }));

  await db().query(
    `INSERT INTO notebook_keyword_snapshots
       (collection_id, month, keywords, topic_counts, total_documents, sample_size, computed_at)
     VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, now())
     ON CONFLICT (collection_id, month) DO UPDATE
       SET keywords = EXCLUDED.keywords,
           topic_counts = EXCLUDED.topic_counts,
           total_documents = EXCLUDED.total_documents,
           sample_size = EXCLUDED.sample_size,
           computed_at = now()`,
    [
      collectionId,
      month,
      JSON.stringify(payload),
      JSON.stringify(topicCounts),
      totalDocuments,
      docs.length,
    ]
  );

  const dt = Date.now() - t0;
  const classifiedCount = classifications.filter((c) => c.primaryTopic).length;
  log.info(
    `[${collectionId}] snapshot stored: ${keywords.length} keywords, ${classifiedCount} classified docs, sample=${docs.length}, total=${totalDocuments}, ${dt}ms`
  );

  return {
    collectionId,
    month,
    keywordCount: keywords.length,
    sampleSize: docs.length,
    totalDocuments,
    durationMs: dt,
  };
}

/**
 * Compute snapshots for all system collections sequentially. Sequential is
 * intentional: the local NLP service is a CPU-bound microservice, and parallel
 * batches would queue up and time out. Total runtime ~ 14 collections × ~10-30s.
 */
export async function refreshAllKeywordSnapshots(
  month: string = currentMonth()
): Promise<RefreshResult[]> {
  const ids = getAllSystemCollectionIds();
  log.info(`Starting monthly snapshot refresh for ${ids.length} collections (month=${month})`);

  const results: RefreshResult[] = [];
  for (const id of ids) {
    try {
      const result = await refreshKeywordSnapshot(id, month);
      if (result) results.push(result);
    } catch (err) {
      log.error(`[${id}] snapshot refresh failed: ${err instanceof Error ? err.message : err}`);
    }
  }
  log.info(`Monthly snapshot refresh complete: ${results.length}/${ids.length} succeeded`);
  return results;
}

/**
 * Read the most recent snapshot for a collection. Used by the stats endpoint
 * so user-facing requests never make NLP calls.
 */
function parseTopicCounts(raw: unknown): TopicCountMap {
  if (!raw || typeof raw !== 'object') return {};
  const out: TopicCountMap = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'number' && (TOPIC_CATEGORIES as readonly string[]).includes(key)) {
      out[key as TopicCategory] = value;
    }
  }
  return out;
}

export async function getLatestKeywordSnapshot(
  collectionId: string
): Promise<KeywordSnapshotRecord | null> {
  const rows = await db().query(
    `SELECT collection_id, month, keywords, topic_counts, total_documents, sample_size, computed_at
       FROM notebook_keyword_snapshots
      WHERE collection_id = $1
      ORDER BY month DESC
      LIMIT 1`,
    [collectionId]
  );
  if (rows.length === 0) return null;
  const r = rows[0] as Record<string, unknown>;
  return {
    collectionId: r.collection_id as string,
    month: r.month as string,
    keywords: r.keywords as KeywordSnapshotRecord['keywords'],
    topicCounts: parseTopicCounts(r.topic_counts),
    totalDocuments: r.total_documents as number,
    sampleSize: r.sample_size as number,
    computedAt: r.computed_at instanceof Date ? r.computed_at.toISOString() : String(r.computed_at),
  };
}

/**
 * Read the last `months` snapshots for a collection. Used by month-over-month
 * comparison views (planned).
 */
export async function getKeywordHistory(
  collectionId: string,
  months: number = 6
): Promise<KeywordSnapshotRecord[]> {
  const rows = await db().query(
    `SELECT collection_id, month, keywords, topic_counts, total_documents, sample_size, computed_at
       FROM notebook_keyword_snapshots
      WHERE collection_id = $1
      ORDER BY month DESC
      LIMIT $2`,
    [collectionId, months]
  );
  return rows.map((r: Record<string, unknown>) => ({
    collectionId: r.collection_id as string,
    month: r.month as string,
    keywords: r.keywords as KeywordSnapshotRecord['keywords'],
    topicCounts: parseTopicCounts(r.topic_counts),
    totalDocuments: r.total_documents as number,
    sampleSize: r.sample_size as number,
    computedAt: r.computed_at instanceof Date ? r.computed_at.toISOString() : String(r.computed_at),
  }));
}
