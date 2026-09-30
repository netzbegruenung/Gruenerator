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
import { createLogger } from '../../utils/logger.js';
import { getCachedJson, setCachedJson } from '../../utils/redis/jsonCache.js';

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
const TOP_RISING_TERMS = 8;
/** The z-test alone flags a word seen three times recently and never before. */
const RISING_MIN_RECENT = 5;
const TOP_SIGNATURE_TERMS = 8;
const SIGNATURE_MIN_DOCS = 5;
const SIGNATURE_MIN_LIFT = 2;
/** Thousands of words are tested per notebook — 1.96 would let dozens through by chance. */
const SIGNATURE_Z = 3;
const LV_COLLECTION = 'landesverbaende_documents';

const HEAD_FIELDS = [
  'published_at',
  'primary_topic',
  'persons',
  'keywords',
  'content_type',
  'content_type_label',
  'primary_category',
  'source_id',
  'source_name',
  'source_type',
];

export interface HeadDoc {
  id: string | number;
  publishedAt: string | null;
  primaryTopic: TopicCategory | null;
  persons: string[];
  /** NLP enrichment from version 4 on; empty on documents not yet re-tagged. */
  keywords: string[];
  contentType: string | null;
  contentTypeLabel: string | null;
  sourceId: string | null;
  sourceName: string | null;
  /** `landesverband` or `fraktion` in the LV collection. */
  sourceType: string | null;
}

export type OverviewAggregate = Omit<
  NotebookOverviewResponse,
  'collectionId' | 'computedAt' | 'recent'
> & {
  /** Newest dated documents first; the caller loads their full payload. */
  recentIds: Array<string | number>;
};

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

export function toHeadDoc(id: string | number, payload: Record<string, unknown>): HeadDoc {
  const topic = topicCategorySchema.safeParse(payload.primary_topic);
  return {
    id,
    publishedAt: str(payload.published_at),
    primaryTopic: topic.success ? topic.data : null,
    persons: strings(payload.persons),
    keywords: strings(payload.keywords),
    // LV and gruene.de carry `content_type`; Bundestag only `primary_category`.
    contentType: str(payload.content_type) ?? str(payload.primary_category),
    contentTypeLabel: str(payload.content_type_label),
    sourceId: str(payload.source_id),
    sourceName: str(payload.source_name),
    sourceType: str(payload.source_type),
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

type Stratum = { docs: number; terms: Map<string, number> };

/** Tagged documents and keyword document counts per `source_type`. */
function termStrata(docs: HeadDoc[]): Map<string, Stratum> {
  const strata = new Map<string, Stratum>();
  for (const doc of docs) {
    if (doc.keywords.length === 0) continue;
    const key = doc.sourceType ?? 'unknown';
    const stratum = strata.get(key) ?? { docs: 0, terms: new Map<string, number>() };
    stratum.docs++;
    for (const term of new Set(doc.keywords)) increment(stratum.terms, term);
    strata.set(key, stratum);
  }
  return strata;
}

export interface SignatureInput {
  /** Every head chunk of the LV collection, this notebook's included. */
  lvDocs: HeadDoc[];
  /** The notebook's own region name; words starting with it are trivially typical. */
  region: ReadonlySet<string>;
}

/** Scraped markup (`href="https://…`) is not a word. */
const WORD = /^\p{L}[\p{L}*-]*$/u;
/** The party's own label in regional form: "landtags-grün", "saargrüne". */
const SELF_LABEL = /grün(e|en|er)?$/;

/** "Kommandantenstr." from the press-release footer is an address, not a topic. */
const STREET_ABBREVIATION = /\p{L}{3}str$/u;
/** The role in a signature block: "Landesvorsitzende Nina Stahr", "Landessprecherin". */
const ROLE = /(vorsitzend(e|er)?|sprecher(in)?)$/;
/** A region or format prefix shorter than this would also catch unrelated words. */
const PREFIX_MIN = 4;
/** A plural or inflection of a format name: "wahlprüfstein" → "wahlprüfsteine". */
const CATEGORY_SUFFIX_MAX = 2;
/** A full name has to be found this often before its parts count as a name without the NER. */
const KNOWN_NAME_MIN_DOCS = 2;

/** A name part as the lemmatiser may have written it: "Erben" → erben, erbe. */
function nameForms(part: string): string[] {
  const stem = part.replace(/(?<=\p{L}{3})[ns]$/u, '');
  return stem === part ? [part] : [part, stem];
}

/** Tokens of the full names the NER found in this document. */
function nameTokens(doc: HeadDoc): Set<string> {
  const tokens = new Set<string>();
  for (const person of doc.persons.filter(isFullName)) {
    for (const part of person.toLowerCase().split(/\s+/)) {
      for (const form of nameForms(part)) tokens.add(form);
      for (const piece of part.split('-')) for (const form of nameForms(piece)) tokens.add(form);
    }
  }
  return tokens;
}

/** Full names the NER found in several documents, as the forms of each part. */
function knownNames(docs: HeadDoc[]): string[][][] {
  const counts = new Map<string, number>();
  for (const doc of docs) {
    for (const person of new Set(doc.persons.filter(isFullName).map((p) => p.toLowerCase()))) {
      increment(counts, person);
    }
  }
  return [...counts]
    .filter(([, n]) => n >= KNOWN_NAME_MIN_DOCS)
    .map(([person]) => person.split(/\s+/).map(nameForms));
}

/**
 * The keyword lemmatiser splits names into nouns ("bohm", "ann-sophie"), and
 * nothing is more typical of one Landesverband than its own politicians — they
 * filled every list in the measurement. A word counts as a name fragment when
 * most of its documents name a person containing it; a collection-wide name
 * list would also drop "fischer" or "wolf" wherever they are the plain noun.
 *
 * The NER misses names in signature blocks ("Landesvorsitzende … Philmon
 * Ghirmai, Kommandantenstr. 80" named him in 4 of 40 documents), so a document
 * also names a person whose full name is known from elsewhere in the notebook
 * when every part of it is among its keywords. Single parts do not count: the
 * NER's spans carry role words ("Chaos-Minister Mansoori"), and their parts
 * would drop "minister" or "wahl".
 */
function nameFragments(docs: HeadDoc[]): Set<string> {
  const known = knownNames(docs);
  const total = new Map<string, number>();
  const asName = new Map<string, number>();
  for (const doc of docs) {
    const keywords = new Set(doc.keywords);
    const names = nameTokens(doc);
    for (const parts of known) {
      const matched = parts.map((forms) => forms.find((form) => keywords.has(form)));
      if (matched.every((form): form is string => form !== undefined)) {
        for (const form of matched) names.add(form);
      }
    }
    for (const word of keywords) {
      increment(total, word);
      if (names.has(word)) increment(asName, word);
    }
  }
  return new Set(
    [...asName].filter(([word, n]) => n * 2 >= (total.get(word) ?? 0)).map(([word]) => word)
  );
}

/** Words of the notebook's own format labels ("Wahlprüfstein", "Beschluss/Resolution"). */
function categoryTerms(docs: HeadDoc[]): Set<string> {
  const terms = new Set<string>();
  for (const doc of docs) {
    for (const label of [doc.contentType, doc.contentTypeLabel]) {
      for (const word of (label ?? '').toLowerCase().split(/[^\p{L}]+/u)) {
        if (word.length >= PREFIX_MIN) terms.add(word);
      }
    }
  }
  return terms;
}

/**
 * Which keywords stand for a topic. Names, the notebook's formats, its region
 * ("saar", "bayer" included), the party's own label and signature blocks (role,
 * address) fill every list otherwise — frequent and distinctive, but they say
 * nothing about what the notebook covers. People have their own card.
 */
function topicTermFilter(docs: HeadDoc[], region: ReadonlySet<string>): (word: string) => boolean {
  const names = nameFragments(docs);
  const categories = [...categoryTerms(docs)];
  return (word) => {
    if (!WORD.test(word) || SELF_LABEL.test(word) || names.has(word)) return false;
    if (ROLE.test(word) || STREET_ABBREVIATION.test(word)) return false;
    for (const name of region) {
      if (word.startsWith(name)) return false;
      if (word.length >= PREFIX_MIN && name.startsWith(word)) return false;
    }
    return !categories.some(
      (category) =>
        word.startsWith(category) && word.length - category.length <= CATEGORY_SUFFIX_MAX
    );
  };
}

/**
 * Words that set this Landesverband apart from all the others. Reference is
 * every other LV document (this notebook's own are subtracted), standardised by
 * `source_type`: Fraktion texts outnumber party texts ~3:1 and some notebooks
 * have no Fraktion at all, so a raw comparison would call "Landtag" typical.
 * Per stratum the expected document count is the reference share (smoothed so
 * an unseen word is not infinitely typical); observed vs. expected gives a
 * binomial z-score.
 */
export function signatureTerms(
  docs: HeadDoc[],
  input: SignatureInput,
  isTopic: (word: string) => boolean = topicTermFilter(docs, input.region)
): Array<{ word: string; count: number; lift: number }> {
  const target = termStrata(docs);
  const all = termStrata(input.lvDocs);
  const observed = new Map<string, number>();
  for (const stratum of target.values()) {
    for (const [term, n] of stratum.terms) observed.set(term, (observed.get(term) ?? 0) + n);
  }

  const hits: Array<{ word: string; count: number; lift: number; z: number }> = [];
  for (const [word, count] of observed) {
    if (count < SIGNATURE_MIN_DOCS || !isTopic(word)) continue;
    let expected = 0;
    let variance = 0;
    for (const [key, stratum] of target) {
      const reference = all.get(key);
      const refDocs = (reference?.docs ?? 0) - stratum.docs;
      const refHits = (reference?.terms.get(word) ?? 0) - (stratum.terms.get(word) ?? 0);
      const p = (refHits + 0.5) / (refDocs + 1);
      expected += stratum.docs * p;
      variance += stratum.docs * p * (1 - p);
    }
    const lift = count / expected;
    const z = (count - expected) / Math.sqrt(variance);
    if (lift >= SIGNATURE_MIN_LIFT && z >= SIGNATURE_Z) hits.push({ word, count, lift, z });
  }
  return hits
    .sort((a, b) => b.z - a.z)
    .slice(0, TOP_SIGNATURE_TERMS)
    .map(({ word, count, lift }) => ({ word, count, lift: Math.round(lift * 10) / 10 }));
}

export function aggregateOverview(
  docs: HeadDoc[],
  now: Date,
  baselineShares: Map<TopicCategory, number> | null,
  signature: SignatureInput | null = null
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
  const termCounts = new Map<string, number>();
  const termRecent = new Map<string, number>();
  const termPrior = new Map<string, number>();
  const typeCounts = new Map<string, number>();
  const typeLabels = new Map<string, string>();
  const sourceCounts = new Map<string, number>();
  const sourceLabels = new Map<string, string>();
  const dated: Array<{ id: string | number; t: number }> = [];

  let undated = 0;
  let classified = 0;
  let recentClassified = 0;
  let priorClassified = 0;
  let tagged = 0;
  let recentTagged = 0;
  let priorTagged = 0;
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

    if (doc.keywords.length > 0) {
      tagged++;
      if (isRecent) recentTagged++;
      else if (isPrior) priorTagged++;
      for (const term of new Set(doc.keywords)) {
        increment(termCounts, term);
        if (isRecent) increment(termRecent, term);
        else if (isPrior) increment(termPrior, term);
      }
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
  const isTopic = tagged === 0 ? null : topicTermFilter(docs, signature?.region ?? new Set());

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
    terms:
      isTopic === null
        ? null
        : {
            documents: tagged,
            words: [...termCounts.entries()]
              .filter(([word]) => isTopic(word))
              .map(([word, count]) => ({ word, count }))
              .sort(byCountDesc)
              .slice(0, TOP_TERMS),
            // Over every word, not just the top list: a new term is rarely frequent yet.
            rising: [...termRecent.entries()]
              .filter(
                ([word, recent]) =>
                  recent >= RISING_MIN_RECENT &&
                  isTopic(word) &&
                  trendOf(recent, recentTagged, termPrior.get(word) ?? 0, priorTagged) === 'up'
              )
              .map(([word, recentCount]) => ({
                word,
                count: termCounts.get(word) ?? 0,
                recentCount,
              }))
              .sort((a, b) => b.recentCount - a.recentCount)
              .slice(0, TOP_RISING_TERMS),
            signature: signature ? signatureTerms(docs, signature, isTopic) : null,
          },
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

/** "Grüne Mecklenburg-Vorpommern" → mecklenburg-vorpommern, mecklenburg, vorpommern. */
export function regionTerms(notebookName: string): Set<string> {
  const region = notebookName
    .replace(/^Grüne\s+/i, '')
    .trim()
    .toLowerCase();
  return new Set([region, ...region.split('-')].filter((term) => term.length > 0));
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
  const [docs, baseline, lvDocs] = await Promise.all([
    scrollHeadDocs(client, collection, headFilter(collectionId)),
    isLv ? loadLvBaseline(client) : Promise.resolve(null),
    isLv ? scrollHeadDocs(client, LV_COLLECTION, headFilter(null)) : Promise.resolve(null),
  ]);

  const now = new Date();
  const signature = lvDocs ? { lvDocs, region: regionTerms(config.name) } : null;
  const { recentIds, ...aggregate } = aggregateOverview(docs, now, baseline, signature);
  const recent = await loadRecent(client, collection, collectionId, config.name, recentIds);
  log.info(`[${collectionId}] overview over ${docs.length} documents in ${Date.now() - t0}ms`);

  return {
    collectionId,
    computedAt: now.toISOString(),
    ...aggregate,
    recent,
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
