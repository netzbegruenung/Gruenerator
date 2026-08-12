/**
 * Per-document NLP enrichment for notebook documents.
 *
 * Tags every notebook document with multi-theme labels (`themes`), a dominant
 * `primary_topic`, and `persons` (spaCy NER), stored in the Qdrant payload so
 * the existing filter/faceting machinery can filter by theme and person.
 *
 * Computed ONCE per document (from the head chunk's full_text) and written onto
 * EVERY chunk of that document via a `setPayload` filter, because notebook
 * search applies Qdrant filters at the chunk level — head-only tags would drop
 * non-head passages from filtered results.
 *
 * Decoupled from content-sync: run as a one-time backfill (`mode: 'all'`) and a
 * nightly job (`mode: 'missing'`) against NLP_SERVICE_URL. Never re-embeds.
 */
import { getQdrantInstance } from '../../database/services/QdrantService/index.js';
import { createLogger } from '../../utils/logger.js';
import { TOPIC_CATEGORIES, type TopicCategory } from '../monitor/types.js';
import { classifyArticlesBatched, extractPersons } from '../nlp/nlpClient.js';

const log = createLogger('notebookEnrichment');

/** Bump to force re-enrichment of all docs after a tagging-algorithm change. */
const NLP_VERSION = 2;
/** Per-mille noun-frequency floor for including a topic in `themes`. */
const THEME_MIN_SCORE = 30;
/** Cap themes per doc to bound facet noise on long programmatic docs. */
const THEME_TOP_K = 5;
const PERSON_TOP_N = 20;
const TEXT_CHARS_PER_DOC = 1500;
const SCROLL_BATCH = 100;
const NLP_BATCH_SIZE = 15;
/**
 * Documents a single request may enrich before it stops and reports the rest as
 * `pending`. The endpoint is synchronous behind a reverse proxy that cuts the
 * connection at ~5 min, so an unbounded run turns every `NLP_VERSION` bump into
 * a guaranteed 504 (#2559: bumping to 2 made all ~12,400 head docs due at once
 * and the nightly job spent 2×5 min before the proxy gave up — twice, because
 * the retry started a second overlapping full re-tag). Scrolling stays
 * unbounded: it costs ~10 s for the whole corpus and keeps `pending` honest.
 */
const DEFAULT_MAX_DOCS = 4000;

/** Qdrant collections to enrich: distinct system collections, minus dormant satzungen. */
export const ENRICHMENT_COLLECTIONS = [
  'grundsatz_documents',
  'bundestag_content',
  'oesterreich_gruene_documents',
  'gruene_de_documents',
  'kommunalwiki_documents',
  'gruene_at_documents',
  'gruenblog_documents',
  'boell_stiftung_documents',
  'landesverbaende_documents',
] as const;

export interface EnrichmentStats {
  collection: string;
  scanned: number;
  enriched: number;
  skipped: number;
  noId: number;
  nlpFailures: number;
  /** Due documents left untouched because the run's work budget ran out. */
  pending: number;
}

export type EnrichmentMode = 'missing' | 'all';

export interface EnrichmentOptions {
  mode?: EnrichmentMode;
  dryRun?: boolean;
  /**
   * Documents to enrich at most; `0` lifts the cap. Defaults to
   * DEFAULT_MAX_DOCS, and is ignored entirely when `mode` is `'all'`.
   */
  maxDocs?: number | null;
}

/** Shared across collections so one run's budget is a total, not a per-collection one. */
interface WorkBudget {
  remaining: number;
}

/**
 * `mode: 'all'` is deliberately uncapped. A budget only helps a caller that can
 * resume, and re-tagging cannot resume: it ignores the enrichment markers, so
 * every follow-up request would find the same documents due and redo the same
 * head of the list forever. Large re-tags belong in
 * `scripts/backfill-nlp-enrichment.ts`, which does not sit behind the proxy.
 */
function createBudget(options: EnrichmentOptions): WorkBudget {
  const { maxDocs } = options;
  if (options.mode === 'all' || maxDocs === 0) return { remaining: Number.POSITIVE_INFINITY };
  return { remaining: maxDocs && maxDocs > 0 ? maxDocs : DEFAULT_MAX_DOCS };
}

interface HeadDoc {
  pointId: string | number;
  idField: 'source_url' | 'document_id';
  idValue: string;
  title: string;
  text: string;
  contentHash: string | null;
}

/** Keyword payload indexes so theme/person facets + filters stay fast. */
async function ensureNlpIndexes(
  client: NonNullable<ReturnType<typeof getQdrantInstance>['client']>,
  collection: string
): Promise<void> {
  for (const field of ['themes', 'persons', 'primary_topic']) {
    try {
      await client.createPayloadIndex(collection, { field_name: field, field_schema: 'keyword' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes('already exists')) {
        log.warn(`[${collection}] index ${field} failed: ${message}`);
      }
    }
  }
}

function alreadyEnriched(payload: Record<string, unknown>): boolean {
  if (!payload.nlp_enriched_at || payload.nlp_version !== NLP_VERSION) return false;
  // Re-enrich if the document content changed since the last enrichment.
  const contentHash = typeof payload.content_hash === 'string' ? payload.content_hash : null;
  const stamped = typeof payload.nlp_content_hash === 'string' ? payload.nlp_content_hash : null;
  return contentHash === stamped;
}

function toHeadDoc(point: {
  id: string | number;
  payload: Record<string, unknown>;
}): HeadDoc | null {
  const payload = point.payload;
  const sourceUrl = typeof payload.source_url === 'string' ? payload.source_url : '';
  const documentId = typeof payload.document_id === 'string' ? payload.document_id : '';
  const idField: 'source_url' | 'document_id' = sourceUrl ? 'source_url' : 'document_id';
  const idValue = sourceUrl || documentId;
  if (!idValue) return null;

  const fullText = typeof payload.full_text === 'string' ? payload.full_text : '';
  const chunkText = typeof payload.chunk_text === 'string' ? payload.chunk_text : '';
  const text = (fullText || chunkText).slice(0, TEXT_CHARS_PER_DOC);
  if (!text) return null;

  return {
    pointId: point.id,
    idField,
    idValue,
    title: typeof payload.title === 'string' ? payload.title : '',
    text,
    contentHash: typeof payload.content_hash === 'string' ? payload.content_hash : null,
  };
}

function deriveThemes(
  topics: Partial<Record<TopicCategory, number>>,
  primary: string | null
): string[] {
  const themes = (Object.entries(topics) as Array<[TopicCategory, number]>)
    .filter(([topic, score]) => TOPIC_CATEGORIES.includes(topic) && score >= THEME_MIN_SCORE)
    .sort((a, b) => b[1] - a[1])
    .slice(0, THEME_TOP_K)
    .map(([topic]) => topic);
  if (themes.length === 0 && primary) return [primary];
  return themes;
}

/**
 * Enrich one Qdrant collection. Paginates head chunks, classifies in batches,
 * extracts persons per document, and writes tags onto all chunks of each doc.
 */
export async function enrichCollection(
  collection: string,
  options: EnrichmentOptions = {},
  budget: WorkBudget = createBudget(options)
): Promise<EnrichmentStats> {
  const mode: EnrichmentMode = options.mode ?? 'missing';
  const dryRun = options.dryRun ?? false;
  let sampleLogged = 0;
  const stats: EnrichmentStats = {
    collection,
    scanned: 0,
    enriched: 0,
    skipped: 0,
    noId: 0,
    nlpFailures: 0,
    pending: 0,
  };

  const qdrant = getQdrantInstance();
  await qdrant.init();
  const client = qdrant.client;
  if (!client) {
    log.warn(`[${collection}] Qdrant client unavailable`);
    return stats;
  }

  try {
    await client.getCollection(collection);
  } catch {
    log.warn(`[${collection}] does not exist, skipping`);
    return stats;
  }

  await ensureNlpIndexes(client, collection);

  let offset: string | number | null = null;
  for (;;) {
    const scrollParams: Record<string, unknown> = {
      filter: { must: [{ key: 'chunk_index', match: { value: 0 } }] },
      limit: SCROLL_BATCH,
      with_payload: [
        'source_url',
        'document_id',
        'full_text',
        'chunk_text',
        'title',
        'content_hash',
        'nlp_enriched_at',
        'nlp_version',
        'nlp_content_hash',
      ],
      with_vector: false,
    };
    if (offset !== null) scrollParams.offset = offset;

    const result = await client.scroll(collection, scrollParams);
    const points = result.points ?? [];
    if (points.length === 0) break;

    // Select docs needing enrichment in this page.
    const pending: HeadDoc[] = [];
    for (const point of points) {
      stats.scanned++;
      const payload = (point.payload as Record<string, unknown>) ?? {};
      if (mode === 'missing' && alreadyEnriched(payload)) {
        stats.skipped++;
        continue;
      }
      const doc = toHeadDoc({ id: point.id, payload });
      if (!doc) {
        stats.noId++;
        continue;
      }
      pending.push(doc);
    }

    // Spend the run's budget on the head of this page; the tail is reported as
    // pending and picked up by the next request. Deducting up front (rather
    // than per successful write) can only make a run do less work, never more.
    const affordable = Math.min(pending.length, budget.remaining);
    stats.pending += pending.length - affordable;
    budget.remaining -= affordable;
    const due = pending.slice(0, affordable);

    // Classify in batches; persons are per-document (NER attribution).
    for (let i = 0; i < due.length; i += NLP_BATCH_SIZE) {
      const batch = due.slice(i, i + NLP_BATCH_SIZE);
      const classifications = await classifyArticlesBatched<TopicCategory>(
        batch.map((d) => ({ id: d.idValue, title: d.title, text: d.text })),
        { batchSize: NLP_BATCH_SIZE }
      );
      if (classifications.length === 0) {
        // NLP service failure/timeout — do NOT write empty tags or stamp markers.
        stats.nlpFailures += batch.length;
        log.warn(`[${collection}] classification returned 0 for a batch of ${batch.length}`);
        continue;
      }
      const byId = new Map(classifications.map((c) => [c.id, c]));

      for (const doc of batch) {
        const classification = byId.get(doc.idValue);
        if (!classification) {
          stats.nlpFailures++;
          continue;
        }
        const personEntries = await extractPersons(
          [{ id: doc.idValue, title: doc.title, text: doc.text }],
          PERSON_TOP_N
        );
        const themes = deriveThemes(classification.topics, classification.primaryTopic);
        const persons = personEntries.map((p) => p.person);

        if (dryRun) {
          if (sampleLogged < 5) {
            log.info(
              `[${collection}] would enrich ${doc.idValue} → themes=[${themes.join(', ')}] primary=${classification.primaryTopic ?? '–'} persons=[${persons.slice(0, 5).join(', ')}]`
            );
            sampleLogged++;
          }
          stats.enriched++;
          continue;
        }

        await client.setPayload(collection, {
          payload: {
            themes,
            primary_topic: classification.primaryTopic ?? null,
            persons,
            nlp_enriched_at: new Date().toISOString(),
            nlp_version: NLP_VERSION,
            nlp_content_hash: doc.contentHash,
          },
          filter: { must: [{ key: doc.idField, match: { value: doc.idValue } }] },
        });
        stats.enriched++;
      }
    }

    const next = result.next_page_offset;
    offset = typeof next === 'string' || typeof next === 'number' ? next : null;
    if (offset === null) break;
    log.info(
      `[${collection}] progress: scanned=${stats.scanned} enriched=${stats.enriched} skipped=${stats.skipped} pending=${stats.pending}`
    );
  }

  log.info(
    `[${collection}] done: scanned=${stats.scanned} enriched=${stats.enriched} skipped=${stats.skipped} noId=${stats.noId} nlpFailures=${stats.nlpFailures} pending=${stats.pending}`
  );
  return stats;
}

/**
 * Enrich all in-scope collections sequentially (NLP service is CPU-bound).
 * The work budget is shared across them, so a run that exhausts it in an early
 * collection still scans the rest and reports what they have left as `pending`.
 */
export async function enrichAllCollections(
  options: EnrichmentOptions = {}
): Promise<EnrichmentStats[]> {
  const budget = createBudget(options);
  const results: EnrichmentStats[] = [];
  for (const collection of ENRICHMENT_COLLECTIONS) {
    try {
      results.push(await enrichCollection(collection, options, budget));
    } catch (err) {
      log.error(`[${collection}] enrichment failed: ${err instanceof Error ? err.message : err}`);
    }
  }
  return results;
}
