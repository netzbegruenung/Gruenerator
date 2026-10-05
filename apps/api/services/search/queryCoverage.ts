/**
 * Does a document cover a multi-word query well enough to stay in the manual
 * search list although its fused score sits under the cut?
 *
 * `term_chunk_count` answers that for one word. For several words it demands
 * every word of three letters or more — function words included — inside one
 * chunk, so "Hitzeschutz in Berliner Schulen" kept 1 of 8 articles titled
 * after the topic. Requiring all content words *anywhere* in the document
 * barely helps (45 → 49 title hits over 12 queries); allowing one to be
 * missing doubles the hits but lets generic words carry a match ("Schulen in
 * Berlin am Strand bauen" → schulen + berlin + bauen).
 *
 * The rule: all content words but one, and the one the corpus has fewest of is
 * mandatory. "berliner" sits in 3 251 Berlin chunks, "hitzeschutz" in 36,
 * "strand" in 0. Measured 05.10.2026 over 22 queries in six LVs: title hits
 * 45 → 76, off-topic controls unchanged at 29 documents
 * (`evals/retrieval/manual-threshold-2026-10.md`). Rarity has to come from
 * the corpus: inside the retrieved candidates the topic words are the most
 * frequent ones, because retrieval found them.
 */
import { createLogger } from '../../utils/logger.js';
import { foldUmlauts, normalizeText } from '../text/normalization.js';

import { queryTerms } from './lexicalPassageScore.js';

import type { QdrantFilter } from '../../database/services/QdrantService/types.js';
import type { QdrantClient, Schemas } from '@qdrant/js-client-rest';

const log = createLogger('queryCoverage');

/** Distinct content words of a query (no function words, three letters or more). */
export function coverageTerms(query: string): string[] {
  return [...new Set(queryTerms(query))];
}

/**
 * The terms that occur in any of the texts, as substrings — so a compound
 * counts for its parts ("Hitzeschutzplan" carries "hitzeschutz").
 */
export function matchedQueryTerms(texts: readonly string[], terms: readonly string[]): string[] {
  if (terms.length === 0) return [];
  const haystack = normalizeText(texts.join('\n'));
  return terms.filter((term) => haystack.includes(foldUmlauts(term)));
}

/**
 * All terms but one (all of them for two terms), and the rarest one in the
 * corpus among them. Single-word queries are `term_chunk_count`'s job. A term
 * without a known frequency makes the answer `false` — unknown rarity is no
 * evidence.
 */
export function coversQuery(
  matched: readonly string[],
  terms: readonly string[],
  frequencies: ReadonlyMap<string, number>
): boolean {
  if (terms.length < 2) return false;
  let rarest: string | null = null;
  let rarestCount = Infinity;
  for (const term of terms) {
    const count = frequencies.get(term);
    if (count === undefined) return false;
    if (count < rarestCount) {
      rarest = term;
      rarestCount = count;
    }
  }
  if (rarest === null || !matched.includes(rarest)) return false;
  const allowedMissing = terms.length >= 3 ? 1 : 0;
  return matched.filter((term) => terms.includes(term)).length >= terms.length - allowedMissing;
}

const FREQUENCY_TTL_MS = 60 * 60 * 1000;
const FREQUENCY_CACHE_MAX = 5000;
const frequencyCache = new Map<string, { count: number; at: number }>();

/**
 * Chunks per term inside the collection slice the search runs on (a
 * Landesverband filter, say), via the `chunk_text` word index. Counts are
 * cached for an hour; a corpus moves far slower than that matters here.
 */
export async function fetchTermFrequencies(
  client: QdrantClient,
  collection: string,
  filter: QdrantFilter | undefined,
  terms: readonly string[]
): Promise<Map<string, number>> {
  const scope = `${collection}|${JSON.stringify(filter ?? null)}`;
  const now = Date.now();
  const entries = await Promise.all(
    terms.map(async (term): Promise<[string, number]> => {
      const key = `${scope}|${term}`;
      const cached = frequencyCache.get(key);
      if (cached && now - cached.at < FREQUENCY_TTL_MS) return [term, cached.count];
      const termFilter: QdrantFilter = {
        ...filter,
        must: [...(filter?.must ?? []), { key: 'chunk_text', match: { text: term } }],
      };
      const { count } = await client.count(collection, {
        filter: termFilter as Schemas['Filter'],
        exact: true,
      });
      if (frequencyCache.size >= FREQUENCY_CACHE_MAX) frequencyCache.clear();
      frequencyCache.set(key, { count, at: now });
      return [term, count];
    })
  );
  return new Map(entries);
}

/** What `loadTermFrequencies` needs of the Qdrant service: lazy init, then the client. */
interface QdrantAccess {
  init(): Promise<void>;
  client: QdrantClient | null;
}

/**
 * The search waits for the frequencies, so they get a deadline: warm counts
 * take ~100 ms for four words (05.10.2026); past this the rule is skipped.
 */
const FREQUENCY_TIMEOUT_MS = 1500;

/**
 * Frequencies for a multi-word query, or `null` for a single word, when Qdrant
 * cannot answer or misses the deadline. Never throws: without them a document
 * has to clear the score cut or match verbatim, as before.
 */
export async function loadTermFrequencies(
  qdrant: QdrantAccess,
  collection: string,
  filter: QdrantFilter | undefined,
  terms: readonly string[],
  timeoutMs = FREQUENCY_TIMEOUT_MS
): Promise<Map<string, number> | null> {
  if (terms.length < 2) return null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    await qdrant.init();
    const client = qdrant.client;
    if (!client) return null;
    const deadline = new Promise<null>((resolve) => {
      timer = setTimeout(() => {
        log.warn(`Term frequencies for ${collection} missed ${timeoutMs} ms, rule skipped`);
        resolve(null);
      }, timeoutMs);
    });
    return await Promise.race([fetchTermFrequencies(client, collection, filter, terms), deadline]);
  } catch (error: unknown) {
    log.warn(
      `Term frequencies for ${collection} failed: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Marks each result with `covers_query` for `rankManualSearchResults`. */
export function withQueryCoverage<T extends { matched_query_terms?: string[] | undefined }>(
  results: readonly T[],
  terms: readonly string[],
  frequencies: ReadonlyMap<string, number> | null
): Array<T & { covers_query: boolean }> {
  return results.map((result) => ({
    ...result,
    covers_query: frequencies
      ? coversQuery(result.matched_query_terms ?? [], terms, frequencies)
      : false,
  }));
}
