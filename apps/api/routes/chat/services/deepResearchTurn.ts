/**
 * The `@deepresearch` turn — the chat's only route to Linkup's `sourcedAnswer`
 * endpoint, where LINKUP writes the dossier instead of our own model.
 *
 * Three things make this path different from every other retrieval turn, and all
 * three are the reason it lives in its own module rather than as a branch inside
 * the search node:
 *
 * 1. **It is the most expensive call in the product.** `depth: 'deep'` plus a
 *    synthesis pass, 15–30s. So it is reachable only by the explicit mention and
 *    capped per user per day — the same shape as the image gate, because it is
 *    the same kind of problem. The cap itself lives in `deepResearchQuota.ts`,
 *    shared with the agent engine that sits in front of this one.
 * 2. **The answer already exists.** Nothing downstream may re-synthesise it: a
 *    model run over a finished text costs a second LLM pass, paraphrases what we
 *    paid for, and renumbers citations it does not understand.
 * 3. **The `[N]` are Linkup's, not ours.** This is precisely why the old research
 *    card was abandoned: Linkup numbered against a source list our registry had
 *    never seen. It works here only because `buildDeepResearchPrompt` pins the
 *    contract ("1-basiert, in der Reihenfolge der Quellenliste") and this module
 *    preserves that order all the way into the registry. See
 *    `toRegistryOrderedSources` — the ordering is load-bearing, not cosmetic.
 */

// `citationUtils` rather than the ChatGraph barrel on purpose: the barrel pulls in
// searchNode, which imports heavyweight services that break under Vitest — and the
// source-ordering logic below is exactly what needs a unit test.
import { buildCitations } from '../../../agents/langgraph/ChatGraph/nodes/citationUtils.js';
import { SOURCE_PREFIX } from '../../../agents/langgraph/ChatGraph/types.js';
import { getLinkupService } from '../../../services/search/LinkupService.js';
import { createLogger } from '../../../utils/logger.js';

import { stripOutOfRangeCitations } from './agenticLoop/citationStrip.js';
import { chargeDeepResearch } from './deepResearchQuota.js';
import { sendChatWarning } from './sseHelpers.js';

import type { SSEWriter } from './sseHelpers.js';
import type { ChatGraphState, SearchResult } from '../../../agents/langgraph/ChatGraph/types.js';
import type { LinkupSource } from '../../../services/search/LinkupService.js';

const log = createLogger('DeepResearch');

/**
 * Hard ceiling on sources handed to the registry.
 *
 * Must not exceed `MAX_SOURCES` in `citableSources.ts`: that module silently
 * drops the tail past its own cap, and a dropped source turns Linkup's `[21]`
 * into a marker pointing at nothing. Keeping the numbers equal makes the
 * truncation visible here, where it can be logged, instead of invisible there.
 */
const MAX_REGISTRY_SOURCES = 20;

/**
 * Linkup's sources in Linkup's own order, as `SearchResult[]` the registry will
 * number identically.
 *
 * Two hazards in `buildCitableSources`, both silent, both fatal to the `[N]`
 * mapping — this function neutralises each:
 *
 * - **It sorts by `relevance` descending.** Linkup returns no relevance score, so
 *   every source would default to 0 and the sort order would be whatever the
 *   engine's grouping happened to produce. A strictly decreasing synthetic score
 *   makes the sort a no-op that preserves the incoming order. The numbers carry
 *   no quality claim (they are positions, not scores) — hence `relevance` is set
 *   from the index alone and nothing reads it as a measurement.
 * - **It deduplicates by URL.** Two entries sharing a URL merge into one, which
 *   shifts every later number down by one and silently misattributes the rest of
 *   the dossier. So dedup happens HERE, before numbering, and the registry's own
 *   dedup then has nothing left to do.
 */
export function toRegistryOrderedSources(sources: LinkupSource[]): SearchResult[] {
  const seen = new Set<string>();
  const unique: LinkupSource[] = [];
  for (const source of sources) {
    // A source without a URL cannot collide with anything, so it is kept as-is
    // rather than dropped — the dossier may well cite it.
    const key = source.url?.trim() ?? '';
    if (key.length > 0) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    unique.push(source);
  }

  const kept = unique.slice(0, MAX_REGISTRY_SOURCES);
  if (kept.length < unique.length) {
    log.warn(
      `[DeepResearch] ${unique.length - kept.length} source(s) past the registry cap of ${MAX_REGISTRY_SOURCES} dropped — citations beyond [${kept.length}] will be stripped as out-of-range`
    );
  }

  return kept.map((source, i) => ({
    source: SOURCE_PREFIX.RESEARCH,
    title: source.name || source.url || 'Quelle',
    content: source.snippet ?? '',
    ...(source.url ? { url: source.url } : {}),
    // Strictly decreasing, so the registry's relevance sort keeps this order.
    relevance: 1 - i / (kept.length + 1),
  }));
}

/**
 * Run the gated dossier path.
 *
 * Returns a state patch when the dossier was produced, and `null` in every case
 * where the turn should fall through to the ordinary research path — no API key,
 * no user, or a failed call. Falling through is deliberate: a user who asked for
 * depth still gets a researched answer, one tier down, rather than an error. The
 * caller has already set `explicitDeepRequest`, so that fallback lands on
 * `tiefenrecherche` rather than being clamped. The daily allowance is not one of
 * these cases: the caller settles it for both engines before either starts.
 *
 * On success the caller MUST skip both the search node and the rerank node —
 * reranking reorders `searchResults`, which is exactly the coupling above.
 */
export async function runDeepResearchTurn(params: {
  state: ChatGraphState;
  sse: SSEWriter;
}): Promise<Partial<ChatGraphState> | null> {
  const { state, sse } = params;
  const question = state.searchQuery?.trim() ?? '';
  const userId = state.agentConfig?.userId ?? '';

  const linkup = getLinkupService();
  if (!linkup) {
    log.info('[DeepResearch] No LINKUP_API_KEY — falling through to the ordinary research path');
    return null;
  }
  if (question.length === 0) {
    log.warn('[DeepResearch] No research question — falling through');
    return null;
  }
  // No user means no counter, and an uncounted call to the most expensive
  // endpoint in the product is worse than a slightly cheaper answer.
  if (!userId) {
    log.warn('[DeepResearch] No userId — cannot meter the call, falling through');
    return null;
  }

  sse.send('search_start', {
    message: 'Tiefenrecherche läuft — Linkup liest mehrere Quellen (dauert bis zu 30s)…',
  });

  const start = Date.now();
  let result;
  try {
    result = await linkup.deepResearch({ question, locale: linkupLocale(state.userLocale) });
  } catch (error) {
    log.error(
      `[DeepResearch] Linkup deep research failed: ${error instanceof Error ? error.message : String(error)}`
    );
    sendChatWarning(
      sse,
      'deep_research_quota_spent',
      'Die Tiefenrecherche ist fehlgeschlagen — ich habe stattdessen normal recherchiert. Dein Tageskontingent ist noch frei.'
    );
    return null;
  }

  // Counted only now: a failed call must not cost the user a run.
  await chargeDeepResearch(userId);

  const searchResults = toRegistryOrderedSources(result.sources);
  const citations = buildCitations(searchResults);

  /**
   * Only OUT-OF-RANGE markers are removed, and deliberately not the word-overlap
   * grounding (`validateCitations`) the single-pass synth path uses.
   *
   * That heuristic compares the sentence around `[N]` against the source CONTENT,
   * and here the content is Linkup's short teaser snippet — Linkup read the whole
   * page, we only receive a couple of hundred characters of it. A low overlap
   * would therefore mean "our snippet is short", not "the claim is unsupported",
   * and stripping on that basis would delete correct attributions from a dossier
   * we just paid for. What must not survive is a marker pointing at nothing, and
   * that check is exact rather than statistical.
   */
  const clamped = stripOutOfRangeCitations(result.answer, citations.length);
  if (clamped.changed) {
    log.warn(
      `[DeepResearch] Stripped citation marker(s) beyond the ${citations.length} available sources`
    );
  }

  log.info(
    `[DeepResearch] Dossier for user ${userId}: ${clamped.text.length} chars, ${citations.length} source(s), ${Date.now() - start}ms`
  );

  return {
    deepResearchAnswer: clamped.text,
    searchResults,
    citations,
    searchCount: searchResults.length,
    searchTimeMs: Date.now() - start,
  };
}

/** Chat locale → the source-region hint `buildDeepResearchPrompt` understands. */
function linkupLocale(userLocale: string | null | undefined): 'de' | 'at' {
  return userLocale === 'de-AT' ? 'at' : 'de';
}
