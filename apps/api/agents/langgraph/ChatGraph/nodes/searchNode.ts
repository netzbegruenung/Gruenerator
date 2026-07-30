/**
 * Search Node
 *
 * Executes the appropriate search tool based on the classified intent.
 * Uses the direct search functions from the chat agents module.
 */

import { dipSearchUrl, btpProtokollPdfUrl as btpPdfUrl } from '@gruenerator/contracts';
import { isIntentAllowedForLocale, intentDeclineNote } from '@gruenerator/shared/chat-intents';

import { vectorConfig } from '../../../../config/vectorConfig.js';
import {
  executeDirectSearch,
  // executeDirectPersonSearch, // DISABLED: Person search not production ready
  executeDirectExamplesSearch,
  executeDirectWebSearch,
} from '../../../../routes/chat/agents/directSearch.js';
import { resolveExamplesLvScope } from '../../../../routes/chat/agents/lvScope.js';
import { relevanceLabelToScore } from '../../../../routes/chat/agents/searchFormatting.js';
import { resolveReferentialQuery } from '../../../../routes/chat/services/referentialTopic.js';
import { getEnrichedPoliticianService } from '../../../../services/abgeordnetenwatch/index.js';
import { type AwEnrichedResult } from '../../../../services/abgeordnetenwatch/types.js';
import { getBundestagEnrichedService } from '../../../../services/bundestag/BundestagEnrichedService.js';
import {
  type BtEnrichedResult,
  type BtDrucksache,
  type BtSpeech,
} from '../../../../services/bundestag/types.js';
import {
  searchExamples,
  type ExampleKind,
} from '../../../../services/examples/exampleSearchService.js';
import {
  selectAndCrawlTopUrls,
  type CrawlableResult,
} from '../../../../services/search/CrawlingService.js';
import { LOW_VALUE_DOMAINS } from '../../../../services/search/domainFilters.js';
import { expandQuery } from '../../../../services/search/QueryExpansionService.js';
import { DEFAULT_RELEVANCE } from '../../../../services/search/rerankPipeline.js';
import {
  resolveSearchTier,
  resolveTier,
  type SearchTier,
} from '../../../../services/search/searchDepth.js';
import { createLogger } from '../../../../utils/logger.js';
import {
  SOURCE_PREFIX,
  type ChatGraphState,
  type DocumentSource,
  type SearchResult,
  type Citation,
  type ExamplesToolResult,
  type SearchErrorEntry,
} from '../types.js';

import {
  COLLECTION_LABELS,
  CONTENT_TYPE_LABELS,
  buildCitations,
  deriveCitationTitle,
  extractDomain,
  resolveCollectionName,
} from './citationUtils.js';
import { retrieveConnectFile } from './connectRetrieval.js';
import { retrieveWolkeFile } from './wolkeRetrieval.js';

import type { SubcategoryFilters } from '../../../../config/systemCollectionsConfig.js';
import type { AgentConfig } from '../../../../routes/chat/agents/types.js';

// Re-export for backward compatibility and reuse by SearchGraph
export {
  COLLECTION_LABELS,
  buildCitations,
  CONTENT_TYPE_LABELS,
  deriveCitationTitle,
  extractDomain,
  resolveCollectionName,
};

const log = createLogger('ChatGraph:Search');

/**
 * How many candidates a fan-in hands downstream, BEFORE reranking.
 *
 * This used to be 8 — below the reranker's own input budget
 * (RERANK_INPUT_LIMIT = 16, or 20 when notebook-scoped), so the cross-encoder
 * could only reorder what the weaker retrieval score had already picked. Its
 * entire value is promoting a result that scored low on the cheap metric, which
 * a pre-cut of 8 makes impossible. Sized above the largest rerank input so the
 * reranker is the thing that decides, not the fan-in.
 */
const FANIN_CANDIDATE_LIMIT = 24;

// ── Abgeordnetenwatch → SearchResult mapping ──────────────────────────────────
const AW_VOTE_LABELS: Record<string, string> = {
  yes: 'Ja',
  no: 'Nein',
  abstain: 'Enthaltung',
  no_show: 'nicht abgestimmt',
};

function awVoteLabel(vote: string): string {
  return AW_VOTE_LABELS[vote] ?? vote;
}

function awEuro(amount: number | null): string | null {
  if (amount == null) return null;
  return `${amount.toLocaleString('de-DE', { maximumFractionDigits: 0 })} €`;
}

/**
 * Flatten the compact enrichment result into ranked SearchResult[] for the
 * respond node. Everything here is already trimmed by the client — this only
 * formats German prose and assigns relevance; no raw API shapes leak through.
 */
function buildAbgeordnetenwatchResults(enriched: AwEnrichedResult): SearchResult[] {
  const results: SearchResult[] = [];

  if (enriched.kind === 'person' && enriched.person) {
    const { politician, mandate, topicVotes, recentVotes, sideJobs } = enriched.person;
    results.push({
      source: 'abgeordnetenwatch',
      title: politician.party ? `${politician.name} (${politician.party})` : politician.name,
      content: mandate
        ? `Mandat: ${mandate.parliamentPeriod}${mandate.fraction ? ` · Fraktion: ${mandate.fraction}` : ''}`
        : 'Kein aktuelles Mandat gefunden.',
      url: politician.url,
      relevance: 1,
    });

    const seenPolls = new Set<number>();
    const pushVote = (v: (typeof recentVotes)[number], relevance: number) => {
      if (seenPolls.has(v.pollId)) return;
      seenPolls.add(v.pollId);
      results.push({
        source: 'abgeordnetenwatch',
        title: `Abstimmung: ${v.pollLabel}`,
        content: `Stimme: ${awVoteLabel(v.vote)}${v.fraction ? ` · Fraktion: ${v.fraction}` : ''}`,
        url: v.url || politician.url,
        relevance,
      });
    };
    topicVotes.forEach((v) => pushVote(v, 0.95));
    recentVotes.forEach((v) => pushVote(v, 0.6));

    sideJobs.forEach((s, i) => {
      const parts = [
        s.organization,
        s.incomeLevel != null ? `Einkommensstufe ${s.incomeLevel}/10` : null,
        awEuro(s.income),
        s.interval,
        s.year,
      ].filter(Boolean);
      results.push({
        source: 'abgeordnetenwatch',
        title: `Nebentätigkeit: ${s.label}`,
        content: parts.join(' · ') || 'Keine weiteren Angaben.',
        url: politician.url,
        relevance: 0.7 - i * 0.01,
      });
    });
  } else if (enriched.kind === 'poll') {
    const { tally, relatedPolls } = enriched;
    if (tally) {
      const fractionLine = tally.byFraction
        .slice(0, 6)
        .map((f) => `${f.fraction}: Ja ${f.yes}/Nein ${f.no}`)
        .join('; ');
      results.push({
        source: 'abgeordnetenwatch',
        title: `Abstimmung: ${tally.label}`,
        content:
          `Ergebnis: ${tally.accepted == null ? 'unbekannt' : tally.accepted ? 'angenommen' : 'abgelehnt'}` +
          ` · Ja ${tally.total.yes}, Nein ${tally.total.no}, Enthaltung ${tally.total.abstain}, nicht abgestimmt ${tally.total.no_show}.` +
          (fractionLine ? ` Nach Fraktion: ${fractionLine}.` : ''),
        url: tally.url,
        relevance: 1,
      });
    }
    (relatedPolls ?? []).forEach((p, i) => {
      if (tally && p.pollId === tally.pollId) return;
      results.push({
        source: 'abgeordnetenwatch',
        title: `Abstimmung: ${p.label}`,
        content: [p.date, p.intro].filter(Boolean).join(' · ') || 'Namentliche Abstimmung.',
        url: p.url,
        relevance: 0.6 - i * 0.02,
      });
    });
  }

  if (enriched.notes.length > 0) {
    results.push({
      source: 'abgeordnetenwatch',
      title: 'Hinweis',
      content: enriched.notes.join(' '),
      relevance: 0.2,
    });
  }

  if (results.length === 0) {
    results.push({
      source: 'abgeordnetenwatch',
      title: 'Keine Daten gefunden',
      content:
        'Zu dieser Anfrage konnten bei Abgeordnetenwatch keine passenden Abgeordneten oder Abstimmungen gefunden werden.',
      relevance: 0.2,
    });
  }

  return results;
}

// ── Bundestag (DIP) → SearchResult mapping ────────────────────────────────────
// dipSearchUrl / btpPdfUrl link helpers live in @gruenerator/contracts
// (imported at the top of this file). Titles double as citation labels
// ("Drucksache 21/123 · Antrag") in the standard sources footer.
function btDrucksacheResult(d: BtDrucksache, relevance: number): SearchResult {
  const content =
    [d.titel, d.datum, d.urheber.length > 0 ? `Urheber: ${d.urheber.join(', ')}` : null]
      .filter(Boolean)
      .join(' · ') || 'Bundestagsdrucksache.';
  return {
    source: 'bundestag',
    title: `Drucksache ${d.dokumentnummer}${d.drucksachetyp ? ` · ${d.drucksachetyp}` : ''}`,
    content,
    url: d.pdfUrl ?? dipSearchUrl(d.dokumentnummer || d.titel),
    relevance,
  };
}

function btSpeechResult(s: BtSpeech, title: string, relevance: number): SearchResult {
  const url = btpPdfUrl(s.protokollNummer, s.herausgeber);
  return {
    source: 'bundestag',
    title,
    content: `${s.excerpt}${s.protokollNummer ? ` — Plenarprotokoll ${s.protokollNummer}` : ''}`,
    url: url ?? dipSearchUrl(s.topTitle ?? s.speaker),
    relevance,
  };
}

/**
 * Flatten the compact enrichment result into ranked SearchResult[] for the
 * respond node. Everything here is already trimmed by the client — this only
 * formats German prose and assigns relevance; no raw DIP shapes leak through.
 */
function buildBundestagResults(enriched: BtEnrichedResult): SearchResult[] {
  const results: SearchResult[] = [];

  if (enriched.kind === 'person' && enriched.person) {
    const { person, aktivitaeten, speeches } = enriched.person;
    results.push({
      source: 'bundestag',
      title: person.fraktion ? `${person.name} (${person.fraktion})` : person.name,
      content:
        person.wahlperiode != null
          ? `MdB · Wahlperiode ${person.wahlperiode}`
          : 'Mitglied des Bundestags (DIP-Eintrag).',
      url: dipSearchUrl(person.name),
      relevance: 1,
    });
    speeches.forEach((s, i) => {
      const title = `Rede: ${s.topTitle ?? 'Plenardebatte'}${s.date ? ` (${s.date})` : ''}`;
      results.push(btSpeechResult(s, title, 0.9 - i * 0.02));
    });
    aktivitaeten.forEach((a, i) => {
      const details = [a.datum, a.dokumentnummer ? `Dokument ${a.dokumentnummer}` : null]
        .filter(Boolean)
        .join(' · ');
      results.push({
        source: 'bundestag',
        title: `Aktivität: ${a.typ ? `${a.typ}: ` : ''}${a.titel}`,
        content: details || 'Parlamentarische Aktivität.',
        relevance: 0.6 - i * 0.01,
      });
    });
  } else if (enriched.kind === 'document' && enriched.document) {
    const { drucksache, siblings, vorgang } = enriched.document;
    results.push(btDrucksacheResult(drucksache, 1));
    if (vorgang) {
      const details = [
        `Stand: ${vorgang.beratungsstand ?? 'unbekannt'}`,
        vorgang.vorgangstyp,
        vorgang.datum,
      ]
        .filter(Boolean)
        .join(' · ');
      results.push({
        source: 'bundestag',
        title: `Verfahren: ${vorgang.titel}`,
        content: details,
        url: dipSearchUrl(vorgang.titel),
        relevance: 0.8,
      });
    }
    siblings.forEach((d) => results.push(btDrucksacheResult(d, 0.7)));
  } else if (enriched.kind === 'topic' && enriched.topic) {
    enriched.topic.hits.forEach((h, i) => {
      const fallbackDetails = [h.dokumentnummer ? `Dokument ${h.dokumentnummer}` : null, h.date]
        .filter(Boolean)
        .join(' · ');
      results.push({
        source: 'bundestag',
        title: `${h.entityType ?? h.docType}: ${h.title}`,
        content: h.abstract ?? (fallbackDetails || 'Treffer im DIP.'),
        url: dipSearchUrl(h.dokumentnummer || h.title),
        relevance: 0.9 - i * 0.03,
      });
    });
    enriched.topic.speeches.forEach((s, i) => {
      const title = `Rede von ${s.speaker}${s.party ? ` (${s.party})` : ''}${s.date ? `, ${s.date}` : ''}`;
      results.push(btSpeechResult(s, title, 0.85 - i * 0.02));
    });
    // DIP-title-search fallback results (semantic layer empty/unavailable)
    enriched.topic.documents.forEach((d, i) => results.push(btDrucksacheResult(d, 0.8 - i * 0.02)));
    enriched.topic.vorgaenge.forEach((v, i) => {
      const details = [`Stand: ${v.beratungsstand ?? 'unbekannt'}`, v.vorgangstyp, v.datum]
        .filter(Boolean)
        .join(' · ');
      results.push({
        source: 'bundestag',
        title: `Verfahren: ${v.titel}`,
        content: details,
        url: dipSearchUrl(v.titel),
        relevance: 0.7 - i * 0.02,
      });
    });
  }

  if (enriched.notes.length > 0) {
    results.push({
      source: 'bundestag',
      title: 'Hinweis',
      content: enriched.notes.join(' '),
      relevance: 0.2,
    });
  }

  if (results.length === 0) {
    results.push({
      source: 'bundestag',
      title: 'Keine Daten gefunden',
      content:
        'Im Dokumentations- und Informationssystem des Bundestags (DIP) wurden zu dieser Anfrage keine passenden Dokumente, Reden oder Abgeordneten gefunden.',
      relevance: 0.2,
    });
  }

  return results;
}

/**
 * Return default Qdrant collections based on user locale.
 * Austrian users search Austrian collections; everyone else gets German defaults.
 */
export function getDefaultCollectionsForLocale(locale: string | undefined): string[] {
  if (locale === 'de-AT') return ['oesterreich', 'gruene-at'];
  return ['deutschland', 'bundestagsfraktion', 'gruene-de', 'kommunalwiki'];
}

/**
 * Return supplementary collections to pair with an agent's defaultCollection.
 * Austrian users get Austrian supplements; everyone else gets German defaults.
 */
export function getSupplementaryCollectionsForLocale(locale: string | undefined): string[] {
  if (locale === 'de-AT') return ['gruene-at'];
  return ['bundestagsfraktion', 'gruene-de', 'kommunalwiki'];
}

/**
 * Execute document search across collections (extracted from case 'search').
 * Searches all sub-queries across all specified collections in parallel.
 */
export interface DocumentSearchParallelResult {
  results: SearchResult[];
  searchedCollections: string[];
  errors: SearchErrorEntry[];
}

export async function executeDocumentSearchParallel(
  query: string,
  subQueries: string[] | null,
  notebookCollectionIds: string[],
  agentConfig: AgentConfig,
  filters?: SubcategoryFilters | null,
  userLocale?: string,
  defaultNotebookCollectionIds?: string[]
): Promise<DocumentSearchParallelResult> {
  let collectionsToSearch: string[];
  if (notebookCollectionIds && notebookCollectionIds.length > 0) {
    collectionsToSearch = notebookCollectionIds;
    log.info(`[Search] Using notebook-scoped collections: ${collectionsToSearch.join(', ')}`);
  } else if (agentConfig.toolRestrictions?.allowedCollections?.length) {
    collectionsToSearch = [...agentConfig.toolRestrictions.allowedCollections];
    log.info(`[Search] Using agent-allowed collections: ${collectionsToSearch.join(', ')}`);
  } else if (agentConfig.toolRestrictions?.defaultCollection) {
    const dc = agentConfig.toolRestrictions.defaultCollection;
    collectionsToSearch = [dc, ...getSupplementaryCollectionsForLocale(userLocale)];
  } else if (defaultNotebookCollectionIds && defaultNotebookCollectionIds.length > 0) {
    collectionsToSearch = defaultNotebookCollectionIds;
    log.info(`[Search] Using default notebook collections: ${collectionsToSearch.join(', ')}`);
  } else {
    collectionsToSearch = getDefaultCollectionsForLocale(userLocale);
    log.info(`[Search] Using locale-based collections: ${collectionsToSearch.join(', ')}`);
  }
  const uniqueCollections = [...new Set(collectionsToSearch)];
  const queries = subQueries?.length ? subQueries : [query];

  // Strip landesverband/region from filters for collection-scoped searches
  // (the collection's defaultFilter already handles this)
  const searchFilters = filters || undefined;

  const collectedErrors: SearchErrorEntry[] = [];
  const searchPromises = uniqueCollections.flatMap((collection) =>
    queries.map((sq) => {
      const params: Parameters<typeof executeDirectSearch>[0] = {
        query: sq,
        collection,
        limit: 3,
      };
      if (searchFilters != null) {
        params.filters = searchFilters;
      }
      return executeDirectSearch(params).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        log.warn(`[Search] Collection ${collection} failed for query "${sq}": ${msg}`);
        collectedErrors.push({ source: `documents:${collection}`, message: msg });
        return null;
      });
    })
  );

  const searchResults = await Promise.all(searchPromises);

  const allResults: SearchResult[] = [];
  const seenUrls = new Set<string>();

  for (const searchResult of searchResults) {
    if (!searchResult?.results) continue;
    // The search service does NOT throw on a backend failure — it resolves with
    // `{ error: true, results: [] }`. The .catch above therefore never fires,
    // and an empty array is truthy, so a Qdrant outage used to slip through
    // here as "no hits" with no error recorded anywhere.
    if (searchResult.error) {
      collectedErrors.push({
        source: `documents:${searchResult.collection}`,
        message: searchResult.message ?? 'Suche fehlgeschlagen',
      });
      continue;
    }
    for (const r of searchResult.results) {
      if (r.url && seenUrls.has(r.url)) continue;
      if (r.url) seenUrls.add(r.url);

      allResults.push({
        source: `gruenerator:${searchResult.collection}`,
        title: deriveCitationTitle(r.source, r.url, searchResult.collection),
        content: r.excerpt || '',
        url: r.url || undefined,
        relevance: relevanceLabelToScore(r.relevance),
        contentType: r.contentType || undefined,
        documentId: r.documentId,
        chunkIndex: r.chunkIndex,
        similarityScore: r.score,
        collectionId: r.collectionId,
      });
    }
  }

  allResults.sort((a, b) => (b.relevance || 0) - (a.relevance || 0));
  // Report a collection only when EVERY one of its queries failed — that
  // corpus contributed nothing and the answer is missing it entirely.
  // Previously all partial failures were dropped as soon as any other
  // collection returned something, so an answer built on a quarter of the
  // corpus looked complete. Per-query failures within a still-working
  // collection stay warns: the corpus was reached, one phrasing missed.
  const failuresPerCollection = new Map<string, number>();
  for (const err of collectedErrors) {
    failuresPerCollection.set(err.source, (failuresPerCollection.get(err.source) ?? 0) + 1);
  }
  const errors =
    allResults.length === 0
      ? collectedErrors
      : collectedErrors.filter(
          (err) => (failuresPerCollection.get(err.source) ?? 0) >= queries.length
        );
  return {
    results: allResults.slice(0, FANIN_CANDIDATE_LIMIT),
    searchedCollections: uniqueCollections,
    errors,
  };
}

/**
 * The ONE web retrieval path in this node — used by the single-source `web`/
 * `research` case, by the multi-source fan-in, by the empty-documents fallback
 * and by SearchGraph's executor.
 *
 * It used to be two functions. `executeWebSearchParallel` (multi-source, empty-doc
 * fallback, SearchGraph) hard-coded `maxResults: 5` and passed no tier at all,
 * while `case 'web'` honoured the tier — so a comparison question, which is
 * exactly what routes to multi-source, ended up shallower than a plain one.
 *
 * Query expansion is gone. It bought breadth by paying for 2–3 calls; Linkup
 * offers the same fan-out inside one call (`adjacentSearches` on the upper
 * tiers), and on the deep tier the engine iterates by itself anyway. The
 * behavioural replacement for "one phrasing missed" is a prompt rule telling the
 * loop to reformulate ONCE after a weak result — a decision made with the
 * results in hand instead of variants bought blind.
 */
export interface WebSearchParallelResult {
  results: SearchResult[];
  errors: SearchErrorEntry[];
}

export interface ExecuteWebSearchOptions {
  tier?: SearchTier;
  /** Crawl this many top results for full page content. 0 / omitted = no crawl. */
  crawlTopUrls?: number;
  crawlTimeoutMs?: number;
  /**
   * Site scope the user named this turn ("such auf zeit.de"). One turn only, never
   * sticky — a scope that silently keeps applying to later questions is worse than
   * none, because the user cannot see why results went missing.
   */
  includeDomains?: readonly string[];
  /** ISO window (YYYY-MM-DD), from the classifier's `filters.date_from/date_to`. */
  fromDate?: string;
  toDate?: string;
}

export async function executeWebSearch(
  query: string,
  options: ExecuteWebSearchOptions = {}
): Promise<WebSearchParallelResult> {
  const collectedErrors: SearchErrorEntry[] = [];

  const webResult = await executeDirectWebSearch({
    query,
    searchType: 'general',
    ...(options.tier ? { tier: options.tier } : {}),
    ...(options.includeDomains?.length ? { includeDomains: options.includeDomains } : {}),
    ...(options.fromDate ? { fromDate: options.fromDate } : {}),
    ...(options.toDate ? { toDate: options.toDate } : {}),
    // The default block list now rides along on every classifier-path search, so
    // the domains we used to throw away AFTER paying are never fetched. Dropped
    // automatically when an include scope is set (see executeDirectWebSearch):
    // "search zeit.de but not amazon.de" is a scope nobody asked for.
    excludeDomains: LOW_VALUE_DOMAINS,
  }).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn(`[Search] Web search failed for "${query}": ${msg}`);
    collectedErrors.push({ source: 'web', message: msg });
    return null;
  });

  const seenWebUrls = new Set<string>();
  let allWebResults: SearchResult[] = [];

  // A backend failure resolves rather than throws, so the .catch above never
  // fires for it — an outage would otherwise read as "the web has nothing".
  if (webResult?.error) {
    collectedErrors.push({
      source: 'web',
      message: webResult.message ?? 'Websuche fehlgeschlagen',
    });
  } else if (webResult?.results) {
    for (const r of webResult.results) {
      if (r.url && seenWebUrls.has(r.url)) continue;
      if (r.url) seenWebUrls.add(r.url);
      allWebResults.push({
        source: 'web',
        title: r.title,
        content: r.snippet || '',
        url: r.url,
        relevance: 1 - (r.rank - 1) * 0.15,
      });
    }
  }

  allWebResults.sort((a, b) => (b.relevance || 0) - (a.relevance || 0));
  allWebResults = allWebResults.slice(0, FANIN_CANDIDATE_LIMIT);

  if (options.crawlTopUrls && allWebResults.length > 0) {
    try {
      const crawled = await selectAndCrawlTopUrls(
        allWebResults.filter((r) => r.url) as CrawlableResult[],
        query,
        { maxUrls: options.crawlTopUrls, timeout: options.crawlTimeoutMs ?? 3000 }
      );
      allWebResults = crawled.map((r) => ({
        ...r,
        content: r.fullContent || r.content || '',
        source: (r.source as string) || 'web',
        title: r.title || '',
      }));
      const crawledCount = crawled.filter((r) => r.crawled).length;
      if (crawledCount > 0) {
        log.info(`[Search] Crawled ${crawledCount} web results for full content`);
      }
    } catch (err: unknown) {
      log.warn(
        `[Search] Crawling failed, using snippets: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Only surface when nothing usable came back — a partial failure that still
  // produced results is a warn, not a user-facing degradation.
  const errors = allWebResults.length === 0 ? collectedErrors : [];
  return { results: allWebResults, errors };
}

/**
 * Normalize relevance scores across source types to a comparable [0, 1] scale.
 *
 * Documents: uses raw similarityScore (from Qdrant hybrid search) when available,
 * avoiding the lossy text-label mapping (0.5/0.7/0.9).
 * Web: compresses rank-decay scores with a configurable ceiling so web results
 * don't dominate over high-quality docs before the cross-encoder runs.
 */
export function normalizeScore(r: SearchResult): number {
  const { webScoreCeiling } = vectorConfig.get('rerank');

  if (r.similarityScore != null && r.source.startsWith(SOURCE_PREFIX.GRUENERATOR)) {
    return Math.min(1.0, r.similarityScore * 1.05);
  }

  if (r.source.startsWith(SOURCE_PREFIX.DOCUMENT)) {
    return r.relevance ?? DEFAULT_RELEVANCE;
  }

  if (r.source === SOURCE_PREFIX.WEB) {
    const raw = r.relevance ?? DEFAULT_RELEVANCE;
    return Math.min(webScoreCeiling, raw * webScoreCeiling);
  }

  return r.relevance ?? DEFAULT_RELEVANCE;
}

/**
 * Merge results from multiple search sources, deduplicating by URL.
 * Normalizes scores across source types before sorting so the cross-encoder
 * receives a fair set of candidates. Over-fetches (default 16) to give the
 * reranker more candidates — inspired by SurfSense's 2x retrieval pattern.
 */
export function mergeSearchResults(...resultSets: SearchResult[][]): SearchResult[] {
  const { mergeOverfetch } = vectorConfig.get('rerank');
  const seenUrls = new Set<string>();
  const merged: SearchResult[] = [];

  for (const results of resultSets) {
    for (const r of results) {
      if (r.url && seenUrls.has(r.url)) continue;
      if (r.url) seenUrls.add(r.url);
      merged.push({ ...r, relevance: normalizeScore(r) });
    }
  }

  merged.sort((a, b) => (b.relevance || 0) - (a.relevance || 0));
  return merged.slice(0, mergeOverfetch);
}

/**
 * Execute per-source fan-out for multi-document chat.
 *
 * Each retrievable DocumentSource gets its own scoped retrieval call so the
 * top-K budget is split evenly instead of one source dominating the merged
 * pool. Results are tagged with `documentSourceId` for downstream grouping
 * (rerank, respond, citations) and returned keyed by source id.
 *
 * Per-source budget is `max(3, floor(12 / N))` — enough headroom for rerank
 * to pick decent chunks per doc without bloating the prompt.
 */
export interface MultiDocFanoutResult {
  perSourceResults: Record<string, SearchResult[]>;
  searchedCollections: string[];
  errors: SearchErrorEntry[];
}

export async function executeMultiDocFanout(
  query: string,
  sources: DocumentSource[],
  agentConfig: AgentConfig
): Promise<MultiDocFanoutResult> {
  const perSourceLimit = Math.max(3, Math.floor(12 / sources.length));
  const errors: SearchErrorEntry[] = [];
  const collections = new Set<string>();

  const documentSearchService = (
    await import('../../../../services/document-services/DocumentSearchService/index.js')
  ).getQdrantDocumentService();

  const sourcePromises = sources.map(async (src): Promise<[string, SearchResult[]]> => {
    try {
      if (src.kind === 'document' || src.kind === 'document_chat' || src.kind === 'doc_mention') {
        const sourcePrefix =
          src.kind === 'document_chat'
            ? SOURCE_PREFIX.DOCUMENT_CHAT
            : src.kind === 'doc_mention'
              ? `${SOURCE_PREFIX.DOCUMENT}:`
              : `${SOURCE_PREFIX.DOCUMENT}:`;
        const response = await documentSearchService.search({
          query,
          userId: agentConfig.userId,
          options: {
            limit: perSourceLimit,
            mode: 'hybrid',
            threshold: 0.15,
          },
          filters: {
            documentIds: [src.id],
          },
        });
        collections.add(`${src.kind}:${src.id.slice(0, 8)}`);
        const results: SearchResult[] = (response.results || []).map((r) => ({
          source: `${sourcePrefix}${r.document_id || src.id}`,
          title: r.title || src.label,
          content: r.relevant_content || '',
          url: r.source_url || undefined,
          relevance: r.similarity_score ?? 0.5,
          documentSourceId: src.id,
        }));
        return [src.id, results];
      }

      if (src.kind === 'wolke') {
        collections.add(`wolke:${src.wolke?.shareLinkId.slice(0, 8) ?? '?'}`);
        if (!agentConfig.userId) {
          log.warn(`[Search] Skipping wolke source ${src.id}: no userId on agentConfig`);
          return [src.id, []];
        }
        const wolkeResult = await retrieveWolkeFile(src, perSourceLimit, agentConfig.userId);
        if (wolkeResult.error) {
          errors.push({
            source: `${SOURCE_PREFIX.WOLKE}${src.id}`,
            message: wolkeResult.error.message,
          });
        }
        return [src.id, wolkeResult.results];
      }

      if (src.kind === 'connect') {
        collections.add(`connect:${src.connect?.provider ?? '?'}`);
        if (!agentConfig.userId) {
          log.warn(`[Search] Skipping connect source ${src.id}: no userId on agentConfig`);
          return [src.id, []];
        }
        const connectResult = await retrieveConnectFile(src, perSourceLimit, agentConfig.userId);
        if (connectResult.error) {
          errors.push({
            source: `${SOURCE_PREFIX.CONNECT}${src.id}`,
            message: connectResult.error.message,
            // Expired OAuth grant: the user can fix this one, so it must stay
            // distinguishable all the way to the emitter (which picks
            // connect_reauth_required over the generic source_unavailable).
            ...(connectResult.error.reauth === true && { reauth: true }),
          });
        }
        return [src.id, connectResult.results];
      }

      if (src.kind === 'notebook' && src.collectionIds && src.collectionIds.length > 0) {
        const collectionPromises = src.collectionIds.map((collection) => {
          collections.add(collection);
          return executeDirectSearch({
            query,
            collection,
            limit: perSourceLimit,
          }).catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err);
            errors.push({ source: `notebook:${src.id}:${collection}`, message: msg });
            return null;
          });
        });
        const responses = await Promise.all(collectionPromises);
        const results: SearchResult[] = [];
        for (const response of responses) {
          if (!response?.results) continue;
          for (const r of response.results) {
            results.push({
              source: `${SOURCE_PREFIX.GRUENERATOR}${response.collection}`,
              title: deriveCitationTitle(r.source, r.url, response.collection),
              content: r.excerpt || '',
              url: r.url || undefined,
              relevance: relevanceLabelToScore(r.relevance),
              contentType: r.contentType || undefined,
              documentId: r.documentId,
              chunkIndex: r.chunkIndex,
              similarityScore: r.score,
              collectionId: r.collectionId,
              documentSourceId: src.id,
            });
          }
        }
        results.sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0));
        return [src.id, results.slice(0, perSourceLimit * 2)];
      }

      return [src.id, []];
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn(`[Search] Multi-doc source ${src.kind}:${src.id} failed: ${msg}`);
      errors.push({ source: `${src.kind}:${src.id}`, message: msg });
      return [src.id, []];
    }
  });

  const entries = await Promise.all(sourcePromises);
  const perSourceResults: Record<string, SearchResult[]> = {};
  for (const [id, results] of entries) {
    perSourceResults[id] = results;
  }

  return {
    perSourceResults,
    searchedCollections: [...collections],
    errors,
  };
}

/**
 * Search node implementation.
 * Routes to the appropriate search function based on intent.
 * Supports parallel multi-source search when searchSources has multiple entries.
 */
export async function searchNode(state: ChatGraphState): Promise<Partial<ChatGraphState>> {
  const startTime = Date.now();
  const { intent, agentConfig } = state;

  // A referential ask carries no subject of its own. Taken verbatim it BECAME
  // the query — "Ja, bitte recherchiere das jetzt im Web" produced a deep
  // research run about "Die Grünen in Österreich" instead of the renewables
  // question from the turn before, and still shipped with "Hohe Konfidenz, 20
  // Quellen". Resolved once here so every search-class intent benefits, not
  // only the forced path in the router.
  const referential = resolveReferentialQuery(state.searchQuery ?? '', state.messages ?? []);
  const searchQuery = referential.query;
  if (referential.inherited) {
    log.info(
      `[Search] Referential query resolved to the prior turn's topic: "${searchQuery.slice(0, 60)}"`
    );
  }

  const detectedFilters = state.detectedFilters || null;
  if (detectedFilters) {
    log.info(`[Search] Applying metadata filters: ${JSON.stringify(detectedFilters)}`);
  }

  // Resolved ONCE for every path that touches the web in this node — the single
  // `web`/`research` case, the multi-source fan-in and the empty-documents
  // fallback. They used to disagree: only the first honoured the tier, so the
  // comparison questions that route to multi-source got the shallowest search.
  const webTier = resolveSearchTier({
    intent,
    explicitDeep: state.explicitDeepRequest ?? false,
  });

  /**
   * Scope for every web call in this node, resolved once alongside the tier.
   *
   * The dates come from `filters.date_from`/`date_to`, which the classifier has
   * been emitting all along — they only ever reached the Qdrant filter, so "seit
   * Januar" narrowed the document search and did nothing at all to the web search.
   * The site scope is deterministic (`extractDomainScope`), so it needs no prompt
   * budget and no model call.
   *
   * Spread into the options objects below rather than merged per call site: the
   * three web paths in this node have drifted apart once already.
   */
  const webScope = {
    ...(state.webSiteScope?.include.length ? { includeDomains: state.webSiteScope.include } : {}),
    ...(detectedFilters?.date_from ? { fromDate: detectedFilters.date_from } : {}),
    ...(detectedFilters?.date_to ? { toDate: detectedFilters.date_to } : {}),
  } satisfies Partial<ExecuteWebSearchOptions>;
  if (Object.keys(webScope).length > 0) {
    log.info(`[Search] Web scope: ${JSON.stringify(webScope)}`);
  }

  const displayQuery = searchQuery || state.researchBrief || '(no query)';
  log.info(
    `[Search] Executing ${intent} search: "${displayQuery.slice(0, 50)}..." (locale=${state.userLocale})`
  );

  // Cap search queries to prevent multi-KB content from hitting embedding APIs
  const MAX_SEARCH_QUERY_LENGTH = 500;
  const truncateQuery = (q: string): string => {
    if (q.length <= MAX_SEARCH_QUERY_LENGTH) return q;
    const truncated = q.slice(0, MAX_SEARCH_QUERY_LENGTH);
    const lastSpace = truncated.lastIndexOf(' ');
    return lastSpace > MAX_SEARCH_QUERY_LENGTH * 0.8 ? truncated.slice(0, lastSpace) : truncated;
  };

  try {
    let results: SearchResult[] = [];
    let citations: Citation[] = [];
    let searchedCollections: string[] = [];
    let examplesResult: ExamplesToolResult | null = null;
    // Backend failures on the single-source paths. The multi-source paths have
    // collected these all along; here they were only logged, so a Qdrant or
    // SearXNG outage reached the user as "0 Treffer" — and the model then
    // confidently said there is nothing on the topic.
    const singleSourceErrors: SearchErrorEntry[] = [];

    const searchSources = state.searchSources || [];
    const documentSources = state.documentSources || [];
    const retrievableDocSources = documentSources.filter(
      (s) =>
        s.kind === 'document' ||
        s.kind === 'document_chat' ||
        s.kind === 'doc_mention' ||
        s.kind === 'notebook' ||
        s.kind === 'wolke' ||
        s.kind === 'connect'
    );
    const hasWolke = retrievableDocSources.some((s) => s.kind === 'wolke');
    const hasConnect = retrievableDocSources.some((s) => s.kind === 'connect');

    // Multi-document fan-out: when the user references ≥2 retrievable doc sources,
    // run a doc-scoped retrieval per source so each gets its own evidence budget.
    // Prevents one denser/better-embedded doc from starving the others at rerank time.
    // Wolke sources always fan out (single or multiple) because they have no single-source
    // retrieval path in the `case 'search'` block — they're only fetched via retrieveWolkeFile.
    // Connect (Nango) sources behave identically — fetched only via retrieveConnectFile.
    if (retrievableDocSources.length >= 2 || hasWolke || hasConnect) {
      const query = truncateQuery(searchQuery || '');
      log.info(
        `[Search] Multi-doc fan-out across ${retrievableDocSources.length} sources: ${retrievableDocSources.map((s) => `${s.kind}:${s.id.slice(0, 8)}`).join(', ')}`
      );

      const fanoutResult = await executeMultiDocFanout(query, retrievableDocSources, agentConfig);

      const aggregatedErrors = fanoutResult.errors;
      const flatResults = Object.values(fanoutResult.perSourceResults).flat();
      flatResults.sort((a, b) => (b.relevance || 0) - (a.relevance || 0));
      const citationsBuilt = buildCitations(flatResults);

      log.info(
        `[Search] Multi-doc complete: ${flatResults.length} total results across ${Object.keys(fanoutResult.perSourceResults).length} sources, ${aggregatedErrors.length} errors in ${Date.now() - startTime}ms`
      );

      return {
        searchResults: flatResults,
        perSourceResults: fanoutResult.perSourceResults,
        citations: citationsBuilt,
        searchCount: 1,
        searchTimeMs: Date.now() - startTime,
        searchedCollections: fanoutResult.searchedCollections,
        ...(aggregatedErrors.length > 0 && { searchErrors: aggregatedErrors }),
      };
    }

    // Parallel multi-source search when classifier requests multiple backends
    if (searchSources.length > 1) {
      const query = truncateQuery(searchQuery || '');
      log.info(`[Search] Multi-source parallel search: ${searchSources.join(' + ')}`);

      type SourceResult = {
        results: SearchResult[];
        collections: string[];
        errors: SearchErrorEntry[];
      };
      const sourcePromises: Promise<SourceResult>[] = [];

      if (searchSources.includes('documents')) {
        sourcePromises.push(
          executeDocumentSearchParallel(
            query,
            state.subQueries || null,
            state.notebookCollectionIds || [],
            agentConfig,
            detectedFilters,
            state.userLocale,
            state.defaultNotebookCollectionIds
          )
            .then((r) => ({
              results: r.results,
              collections: r.searchedCollections,
              errors: r.errors,
            }))
            .catch((err) => {
              const msg = err instanceof Error ? err.message : String(err);
              log.error(`[Search] Document search failed in multi-source: ${msg}`);
              return {
                results: [],
                collections: [],
                errors: [{ source: 'documents', message: msg }],
              };
            })
        );
      }

      if (searchSources.includes('web')) {
        sourcePromises.push(
          executeWebSearch(query, { tier: webTier, ...webScope })
            .then((r) => ({ results: r.results, collections: ['web'], errors: r.errors }))
            .catch((err) => {
              const msg = err instanceof Error ? err.message : String(err);
              log.error(`[Search] Web search failed in multi-source: ${msg}`);
              return {
                results: [],
                collections: [],
                errors: [{ source: 'web', message: msg }],
              };
            })
        );
      }

      if (searchSources.includes('examples')) {
        const country =
          state.agentConfig.toolRestrictions?.examplesCountry ||
          (state.userLocale === 'de-AT' ? 'AT' : undefined);
        const examplesParams: Parameters<typeof executeDirectExamplesSearch>[0] = {
          query,
        };
        if (country != null) {
          examplesParams.country = country;
        }
        sourcePromises.push(
          executeDirectExamplesSearch(examplesParams)
            .then((r) => ({
              results: (r.examples || []).map((e) => ({
                source: 'examples' as const,
                title: `${e.platform} Beispiel${e.author ? ` von ${e.author}` : ''}`,
                content: e.content || '',
                relevance: 0.8,
              })),
              collections: ['examples'],
              errors: [] as { source: string; message: string }[],
            }))
            .catch((err: unknown) => {
              const msg = err instanceof Error ? err.message : String(err);
              log.error(`[Search] Examples search failed in multi-source: ${msg}`);
              return {
                results: [],
                collections: [],
                errors: [{ source: 'examples', message: msg }],
              };
            })
        );
      }

      const sourceResults = await Promise.all(sourcePromises);
      const allResults = sourceResults.map((s) => s.results);
      searchedCollections = sourceResults.flatMap((s) => s.collections);
      const aggregatedErrors = sourceResults.flatMap((s) => s.errors);

      results = mergeSearchResults(...allResults);

      // Crawl top web results for full content
      const webResults = results.filter((r) => r.source === 'web' && r.url);
      if (webResults.length > 0) {
        try {
          const crawled = await selectAndCrawlTopUrls(webResults as CrawlableResult[], query, {
            maxUrls: 2,
            timeout: 3000,
          });
          const crawledMap = new Map(
            crawled.filter((r) => r.crawled && r.url).map((r) => [r.url, r])
          );
          results = results.map((r) => {
            const c = r.url ? crawledMap.get(r.url) : undefined;
            return c ? { ...r, content: c.fullContent || r.content } : r;
          });
          const crawledCount = crawled.filter((r) => r.crawled).length;
          if (crawledCount > 0) {
            log.info(`[Search] Crawled ${crawledCount} web results for full content`);
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          log.warn(`[Search] Crawling failed in multi-source: ${msg}`);
          aggregatedErrors.push({ source: 'crawl', message: msg });
        }
      }

      citations = buildCitations(results);

      const docCount = results.filter((r) => r.source !== 'web').length;
      const webCount = results.filter((r) => r.source === 'web').length;
      log.info(
        `[Search] Multi-source complete: ${results.length} results (${docCount} docs, ${webCount} web), ${aggregatedErrors.length} errors in ${Date.now() - startTime}ms`
      );

      return {
        searchResults: results,
        citations,
        searchCount: 1,
        searchTimeMs: Date.now() - startTime,
        searchedCollections,
        ...(aggregatedErrors.length > 0 && { searchErrors: aggregatedErrors }),
      };
    }

    // Single-source mode: existing switch logic (backward compatible).
    // 'compare' degrades to plain search when only one (or zero) doc source
    // is present — the multi-doc fan-out above is its real path.
    const effectiveIntent = intent === 'compare' ? 'search' : intent;
    switch (effectiveIntent) {
      case 'search': {
        // Document chat: search within multi-selected user documents
        if (state.documentChatIds && state.documentChatIds.length > 0) {
          log.info(
            `[Search] Using document-chat search: ${state.documentChatIds.length} doc(s), higher limits`
          );
          try {
            const documentSearchService = (
              await import('../../../../services/document-services/DocumentSearchService/index.js')
            ).getQdrantDocumentService();
            const response = await documentSearchService.search({
              query: searchQuery || '',
              userId: agentConfig.userId,
              options: {
                limit: 12,
                mode: 'hybrid',
                threshold: 0.15,
              },
              filters: {
                documentIds: state.documentChatIds,
              },
            });

            for (const r of response.results || []) {
              results.push({
                source: `documentchat:${r.document_id || 'unknown'}`,
                title: r.title || 'Dokument',
                content: r.relevant_content || '',
                url: r.source_url || undefined,
                relevance: r.similarity_score ?? 0.5,
              });
            }
            searchedCollections.push('documentchat');
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            log.warn(`[Search] Document-chat search failed: ${msg}`);
            singleSourceErrors.push({ source: 'documents:documentchat', message: msg });
          }
          break;
        }

        // Union of @datei picks and @user-notebook resolved doc IDs. Both reach
        // the same Qdrant filter — a personal notebook is effectively a saved
        // set of @datei picks.
        const explicitDocIds = state.documentIds ?? [];
        const userNotebookDocIds = state.notebookDocumentIds ?? [];
        // The agent's bound user-notebook docs apply only when the user hasn't
        // explicitly scoped this turn (no @datei, no @notebook, no system notebook).
        const hasExplicitScope =
          explicitDocIds.length > 0 ||
          userNotebookDocIds.length > 0 ||
          (state.notebookCollectionIds?.length ?? 0) > 0;
        const defaultNotebookDocIds = hasExplicitScope
          ? []
          : (state.defaultNotebookDocumentIds ?? []);
        const scopeDocIds = [
          ...new Set([...explicitDocIds, ...userNotebookDocIds, ...defaultNotebookDocIds]),
        ];

        if (scopeDocIds.length > 0) {
          const fromUserNotebook =
            userNotebookDocIds.length > 0 || defaultNotebookDocIds.length > 0;
          log.info(
            `[Search] Using document-scoped search: ${scopeDocIds.length} doc(s)${
              fromUserNotebook ? ` (incl. ${userNotebookDocIds.length} from user notebook)` : ''
            }`
          );
          try {
            const documentSearchService = (
              await import('../../../../services/document-services/DocumentSearchService/index.js')
            ).getQdrantDocumentService();
            const response = await documentSearchService.search({
              query: searchQuery || '',
              userId: agentConfig.userId,
              options: {
                limit: 8,
                mode: 'hybrid',
                threshold: 0.2,
              },
              filters: {
                documentIds: scopeDocIds,
              },
            });

            for (const r of response.results || []) {
              results.push({
                source: `document:${r.document_id || 'unknown'}`,
                title: r.title || 'Dokument',
                content: r.relevant_content || '',
                url: r.source_url || undefined,
                relevance: r.similarity_score ?? 0.5,
              });
            }
            searchedCollections.push(fromUserNotebook ? 'user-notebook' : 'user-documents');
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            log.warn(`[Search] Document-scoped search failed: ${msg}`);
            singleSourceErrors.push({ source: 'documents:scoped', message: msg });
          }
          break;
        }

        // Collection selection priority chain
        let collectionsToSearch: string[];
        if (state.notebookCollectionIds && state.notebookCollectionIds.length > 0) {
          collectionsToSearch = state.notebookCollectionIds;
          log.info(`[Search] Using notebook-scoped collections: ${collectionsToSearch.join(', ')}`);
        } else if (agentConfig.toolRestrictions?.allowedCollections?.length) {
          collectionsToSearch = [...agentConfig.toolRestrictions.allowedCollections];
          log.info(`[Search] Using agent-allowed collections: ${collectionsToSearch.join(', ')}`);
        } else if (agentConfig.toolRestrictions?.defaultCollection) {
          const dc = agentConfig.toolRestrictions.defaultCollection;
          collectionsToSearch = [dc, ...getSupplementaryCollectionsForLocale(state.userLocale)];
        } else if (
          state.defaultNotebookCollectionIds &&
          state.defaultNotebookCollectionIds.length > 0
        ) {
          collectionsToSearch = state.defaultNotebookCollectionIds;
          log.info(
            `[Search] Using default notebook collections: ${collectionsToSearch.join(', ')}`
          );
        } else {
          collectionsToSearch = getDefaultCollectionsForLocale(state.userLocale);
          log.info(`[Search] Using locale-based collections: ${collectionsToSearch.join(', ')}`);
        }
        // Deduplicate in case of overlap
        const uniqueCollections = [...new Set(collectionsToSearch)];
        // Deep-recall path also applies to agents bound to notebooks via
        // `defaultNotebookIds` (→ defaultNotebookCollectionIds), not just to
        // explicitly @mentioned notebooks — otherwise such agents search the
        // right collection but with the shallow 3/8 recall, collapsing to too
        // few distinct sources after per-article dedup.
        const isNotebookScoped =
          (state.notebookCollectionIds?.length ?? 0) > 0 ||
          (state.defaultNotebookCollectionIds?.length ?? 0) > 0;

        const query = truncateQuery(searchQuery || '');

        // Expand queries for broader document coverage (short timeout to avoid blocking)
        let expandedQueries: string[] = [];
        if (!isNotebookScoped) {
          try {
            const expanded = await expandQuery(query, state.aiWorkerPool);
            if (expanded.alternatives.length > 0) {
              expandedQueries = expanded.alternatives;
              log.info(`[Search] Document query expanded: +${expandedQueries.length} variants`);
            }
          } catch {
            // Expansion is best-effort for document search
          }
        }

        // Search all sub-queries (if decomposed) + expanded variants across all collections
        // Notebook-scoped searches get deeper recall (10 vs 3 per collection)
        const baseQueries = state.subQueries?.length ? state.subQueries : [query];
        const subQueries = [...baseQueries, ...expandedQueries];
        const perCollectionLimit = isNotebookScoped ? 10 : 3;

        const searchPromises = uniqueCollections.flatMap((collection) =>
          subQueries.map((sq) => {
            const params: Parameters<typeof executeDirectSearch>[0] = {
              query: sq,
              collection,
              limit: perCollectionLimit,
            };
            if (detectedFilters != null) {
              params.filters = detectedFilters;
            }
            return executeDirectSearch(params).catch((err: unknown) => {
              const msg = err instanceof Error ? err.message : String(err);
              log.warn(`[Search] Collection ${collection} failed for query "${sq}": ${msg}`);
              singleSourceErrors.push({ source: `documents:${collection}`, message: msg });
              return null;
            });
          })
        );

        const searchResults = await Promise.all(searchPromises);

        // Flatten and normalize results from all collections
        const allResults: SearchResult[] = [];
        const seenUrls = new Set<string>();

        for (const searchResult of searchResults) {
          if (!searchResult?.results) continue;
          // Resolved-not-thrown failure (see executeDocumentSearchParallel).
          if (searchResult.error) {
            singleSourceErrors.push({
              source: `documents:${searchResult.collection}`,
              message: searchResult.message ?? 'Suche fehlgeschlagen',
            });
            continue;
          }
          for (const r of searchResult.results) {
            // Deduplicate by URL
            if (r.url && seenUrls.has(r.url)) continue;
            if (r.url) seenUrls.add(r.url);

            allResults.push({
              source: `gruenerator:${searchResult.collection}`,
              title: deriveCitationTitle(r.source, r.url, searchResult.collection),
              content: r.excerpt || '',
              url: r.url || undefined,
              relevance: relevanceLabelToScore(r.relevance),
              contentType: r.contentType || undefined,
              documentId: r.documentId,
              chunkIndex: r.chunkIndex,
              similarityScore: r.score,
              collectionId: r.collectionId,
            });
          }
        }

        // Sort by relevance and take top results
        // Notebook-scoped searches keep more candidates for reranking
        allResults.sort((a, b) => (b.relevance || 0) - (a.relevance || 0));
        const resultsCap = isNotebookScoped ? 20 : 8;
        results = allResults.slice(0, resultsCap);
        citations = buildCitations(results);

        // Track which collections were searched for observability
        searchedCollections = uniqueCollections;

        // Empty internal search → go to the web, same rule the loop path got
        // (loopGuards.emptyResultFallback). This path could not follow it:
        // `search` is an exclusive, one-time intent choice, so a turn that
        // found nothing internally answered from the model's memory — ungrounded
        // and, to the reader, indistinguishable from a researched answer.
        //
        // NOT for a notebook-scoped turn: "search MY documents" is an explicit
        // scope, and silently widening it to the open web would answer a
        // different question than the one asked. There, empty means empty.
        if (results.length === 0 && !isNotebookScoped && query.length > 0) {
          log.info('[Search] internal collections returned nothing — falling back to the web');
          const webFallback = await executeWebSearch(query, { tier: webTier, ...webScope });
          if (webFallback.results.length > 0) {
            results = webFallback.results;
            citations = buildCitations(results);
            searchedCollections = [...uniqueCollections, 'web'];
          }
          singleSourceErrors.push(...webFallback.errors);
        }
        break;
      }

      // DISABLED: Person search not production ready (only searches 80 cached MPs)
      // case 'person': {
      //   // Person search (Green politicians, MdB)
      //   const personResult = await executeDirectPersonSearch({
      //     query: searchQuery || '',
      //   });
      //
      //   if (personResult.isPersonQuery && personResult.person) {
      //     // Add person info as first result
      //     results.push({
      //       source: 'person_info',
      //       title: personResult.person.name,
      //       content: [
      //         personResult.person.fraktion && `Fraktion: ${personResult.person.fraktion}`,
      //         personResult.person.wahlkreis && `Wahlkreis: ${personResult.person.wahlkreis}`,
      //         personResult.person.biografie,
      //       ]
      //         .filter(Boolean)
      //         .join('\n'),
      //       relevance: 1.0,
      //     });
      //   }
      //
      //   // Add related content
      //   results.push(
      //     ...personResult.results?.map((r: any) => ({
      //       source: 'person_content',
      //       title: r.source || r.title,
      //       content: r.excerpt || '',
      //       url: r.url || undefined,
      //       relevance: relevanceLabelToScore(r.relevance),
      //     })) || []
      //   );
      //
      //   citations = buildCitations(results);
      //   break;
      // }

      case 'abgeordnetenwatch': {
        // German MP transparency data (votes, Nebentätigkeiten, roll-calls) via
        // the Abgeordnetenwatch API. DE-only source: for AT users (reachable
        // here only via a forced @abgeordnetenwatch mention, since the classifier
        // downgrades AT) return a graceful decline instead of empty data.
        if (!isIntentAllowedForLocale('abgeordnetenwatch', state.userLocale)) {
          results = [
            {
              source: 'abgeordnetenwatch',
              title: 'Nur für Deutschland verfügbar',
              content: intentDeclineNote('abgeordnetenwatch') ?? '',
              relevance: 1,
            },
          ];
          citations = buildCitations(results);
          break;
        }
        const enriched = await getEnrichedPoliticianService().search(searchQuery || '');
        results = buildAbgeordnetenwatchResults(enriched);
        log.info(
          `[Search] Abgeordnetenwatch (${enriched.kind}): ${results.length} results in ${Date.now() - startTime}ms`
        );
        citations = buildCitations(results);
        break;
      }

      case 'bundestag': {
        // Official Bundestag documents (Drucksachen, Plenarreden, Gesetzgebung)
        // via the Bundestag MCP / DIP. DE-only source: for AT users (reachable
        // here only via a forced @bundestag mention, since the classifier
        // downgrades AT) return a graceful decline instead of empty data.
        if (!isIntentAllowedForLocale('bundestag', state.userLocale)) {
          results = [
            {
              source: 'bundestag',
              title: 'Nur für Deutschland verfügbar',
              content: intentDeclineNote('bundestag') ?? '',
              relevance: 1,
            },
          ];
          citations = buildCitations(results);
          break;
        }
        const enriched = await getBundestagEnrichedService().search(searchQuery || '');
        results = buildBundestagResults(enriched);
        log.info(
          `[Search] Bundestag (${enriched.kind}): ${results.length} results in ${Date.now() - startTime}ms`
        );
        citations = buildCitations(results);
        break;
      }

      // `research` is no longer a separate engine — it is this path at a deeper
      // tier. It used to call executeResearch, which handed the whole question
      // to Linkup `depth=deep, outputType=sourcedAnswer`: LINKUP wrote the
      // answer, we rendered it in a card, and the model only framed it in two
      // sentences. Retrieval and answer-writing are separated again, so every
      // [N] in a research answer is now backed by our own source registry.
      case 'research':
      case 'web': {
        // The brief is a fallback only: it orients the synthesis LLM, but a
        // 460-char paragraph as a search string returns near-random hits.
        const query = truncateQuery(searchQuery || state.researchBrief || '');
        state.onResearchProgress?.(resolveTier(webTier).progress);

        const web = await executeWebSearch(query, {
          tier: webTier,
          ...webScope,
          // A1: full page content for the top hits — snippets alone leave the
          // writing model with too little on a multi-aspect question.
          crawlTopUrls: 2,
        });
        results = web.results;
        singleSourceErrors.push(...web.errors);

        citations = buildCitations(results);
        break;
      }

      case 'scrape_url': {
        // User pasted URL(s) into their message. The classifier detected them
        // deterministically (state.detectedUrls); crawl the pages and inject the
        // content as context. Unlike `web`, there's no search step — the URLs are
        // user-chosen, so give them a longer per-URL timeout. First link ranks highest.
        const urls = state.detectedUrls ?? [];
        if (urls.length === 0) {
          log.warn('[Search] scrape_url intent reached with no detectedUrls');
          break;
        }
        const seeds: CrawlableResult[] = urls.map((url, idx) => ({
          url,
          title: url,
          content: '',
          relevance: 1 - idx * 0.1,
        }));
        try {
          const crawled = await selectAndCrawlTopUrls(seeds, searchQuery || '', {
            maxUrls: 3,
            timeout: 8000,
          });
          results = crawled
            .filter((r) => r.crawled && (r.fullContent || r.content))
            .map((r) => ({
              ...r,
              content: r.fullContent || r.content || '',
              source: 'web',
              title: r.title || r.url || '',
            }));
          log.info(`[Search] scrape_url crawled ${results.length}/${urls.length} pasted URL(s)`);
        } catch (err: unknown) {
          log.warn(
            `[Search] scrape_url crawling failed: ${err instanceof Error ? err.message : String(err)}`
          );
        }
        citations = buildCitations(results);
        break;
      }

      case 'pressemitteilung_examples':
      case 'social_post': // combined post grounds its text half on social examples
      case 'examples': {
        // Build kinds from intent + secondaryIntent. The dual SearchIntent
        // surface stays so postResponseService picks the right tool name (and
        // therefore the right UI card); the *data fetch* is unified.
        const kinds: ExampleKind[] = [];
        if (intent === 'pressemitteilung_examples') kinds.push('press');
        if (
          intent === 'examples' ||
          intent === 'social_post' ||
          state.secondaryIntent === 'examples'
        )
          kinds.push('social');

        const country =
          agentConfig.toolRestrictions?.examplesCountry ||
          (state.userLocale === 'de-AT' ? 'AT' : undefined);
        // LV scope feeds press-examples filtering. Prefer the agent's explicit
        // scope (`toolRestrictions.examplesLvScope` → `defaultFilter.landesverband`),
        // then fall back to the LV implied by the active notebook/collection scope.
        // The fallback keeps a generic/custom agent bound to an LV notebook from
        // pulling cross-LV examples (the document path already scopes this way).
        const lvScope = resolveExamplesLvScope(agentConfig, {
          notebookCollectionIds: state.notebookCollectionIds,
          defaultNotebookCollectionIds: state.defaultNotebookCollectionIds,
        });
        // [agent-trace] Confirm the LV scope the examples search will actually use,
        // tied to the resolved agent — undefined here means cross-LV leak.
        log.info(
          `[Search][agent-trace] agent="${agentConfig.identifier}" intent=${intent} ` +
            `lvScope=${JSON.stringify(lvScope ?? null)} ` +
            `(agentDefaultFilter=${JSON.stringify(agentConfig.defaultFilter?.landesverband ?? null)}, ` +
            `notebookCollections=${JSON.stringify(state.notebookCollectionIds ?? [])}, ` +
            `defaultNotebookCollections=${JSON.stringify(state.defaultNotebookCollectionIds ?? [])})`
        );

        // Composer paths want full bodies: PM bodies are reconstructed from
        // chunks inside searchExamples, social bodies skip the 500-char cut.
        // Pass platform hint when set so social fetches filter to Insta/FB.
        // lvScope (per-LV PR agents) constrains press to one LV substrate;
        // social currently logs but does not filter (Apify follow-up).
        const unified = await searchExamples({
          query: searchQuery || '',
          kinds,
          ...(country && { country }),
          ...(lvScope !== undefined && { lvScope }),
          // Qdrant's social_media_examples has only these two platforms —
          // twitter/linkedin prompts get unfiltered examples instead.
          ...((state.platform === 'instagram' || state.platform === 'facebook') && {
            platform: state.platform,
          }),
          ...(agentConfig.toolRestrictions?.examplesCollection != null && {
            examplesCollection: agentConfig.toolRestrictions.examplesCollection,
          }),
          fullBody: true,
        });

        results = unified.all.map((e) => ({
          source: 'examples',
          title:
            e.kind === 'press'
              ? `Pressemitteilung${e.lv ? ` (${e.lv})` : ''}: ${e.title}`
              : e.title,
          content: e.body,
          relevance: e.relevance,
          ...(e.url && { url: e.url }),
        }));
        // Press items have URLs → citations; social posts don't.
        citations = (unified.byKind.press ?? []).length > 0 ? buildCitations(results) : [];

        // Stash the rich kind-segmented shape on state so postResponseService
        // can persist it under `result.examples` for the per-kind UI cards.
        examplesResult = {
          ...(unified.byKind.press && {
            press: unified.byKind.press.map((e) => ({
              id: e.id,
              title: e.title,
              body: e.body,
              lv: e.lv ?? '',
              ...(e.sourceId && { sourceId: e.sourceId }),
              ...(e.publishedAt && { publishedAt: e.publishedAt }),
              ...(e.url && { url: e.url }),
            })),
          }),
          ...(unified.byKind.social && {
            social: unified.byKind.social.map((e) => ({
              id: e.id,
              platform: e.platform ?? 'unknown',
              content: e.body,
              ...(e.author && { author: e.author }),
              ...(e.publishedAt && { date: e.publishedAt }),
            })),
          }),
        };
        break;
      }

      // ── Handled elsewhere; searchNode does nothing for them ──
      //
      // This arm and `default` below behave identically — both fall through
      // without searching. The difference is diagnostic, and that IS the point:
      // `default` logs "Unexpected intent", which is supposed to mean "nobody
      // considered this intent here". Seventeen intents were missing from the
      // list, so the warning fired on every ordinary create_sheet, create_pdf
      // and mcp turn and had stopped carrying information.
      case 'image':
      case 'image_edit':
      case 'sharepic':
      case 'summary':
      case 'chart':
      case 'compute':
      case 'artifact':
      case 'direct':
        break;
      // Artefact + editor intents: the content comes from the generation
      // services, not from retrieval here.
      case 'save_as_doc':
      case 'modify_doc':
      case 'modify_board':
      case 'share_doc':
      case 'edit_current_doc':
      case 'edit_current_board':
      case 'create_sheet':
      case 'create_presentation':
      case 'create_pdf':
      case 'create_recurring_task':
        break;
      // System-MCP / connector intents: the MCP client does the retrieval.
      case 'bahn':
      case 'reise':
      case 'hotel':
      case 'wetter':
      case 'news':
      case 'umfragen':
      case 'hilfe':
      case 'mcp':
      case 'chat_history':
        break;
      // Loop demotion — the agentic loop picks and runs its own tools.
      case 'agentic':
        break;

      default:
        // A real signal again: an intent nobody routed through here.
        log.warn(`[Search] Unexpected intent: ${intent}`);
        break;
    }

    const searchTimeMs = Date.now() - startTime;
    log.info(`[Search] Complete: ${results.length} results in ${searchTimeMs}ms`);

    return {
      searchResults: results,
      citations: citations.length > 0 ? citations : buildCitations(results),
      searchCount: 1,
      searchTimeMs,
      examplesResult,
      ...(searchedCollections.length > 0 && { searchedCollections }),
      // Only when the turn ends up with nothing: a backend failure that still
      // left usable results is a warn, not a user-facing degradation. With
      // zero results the distinction is exactly what the user needs — "there
      // is nothing on this" versus "the search never ran".
      ...(results.length === 0 &&
        singleSourceErrors.length > 0 && { searchErrors: singleSourceErrors }),
    };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    log.error(`[Search] Error during ${intent} search:`, errMsg);

    return {
      searchResults: [],
      citations: [],
      searchCount: 1,
      searchTimeMs: Date.now() - startTime,
      error: `Search failed: ${errMsg}`,
      searchErrors: [{ source: 'search', message: errMsg }],
    };
  }
}
