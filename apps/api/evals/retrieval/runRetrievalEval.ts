/**
 * Retrieval eval runner — measures Hit@k and MRR over the PRODUCTION search
 * path (documentSearchService.search with the same params NotebookQAService
 * uses), against the live Qdrant instance from QDRANT_URL.
 *
 *   pnpm --filter @gruenerator/api eval:retrieval
 *
 * Env:
 *   EVAL_PIPELINE    qa (default) | manual | notebook — see below
 *   EVAL_COLLECTION  only run cases for this collection id (substring match)
 *   EVAL_FILTER      only run cases whose id contains this substring
 *   EVAL_DEPTH       depth profile: fast | deep | ultra (default fast;
 *                    notebook defaults to deep, the production notebook default)
 *   EVAL_RERANK=1    additionally score the post-rerank ranking (Regolo), qa only
 *   EVAL_RERANK_EXCERPT  what the cross-encoder gets to read. Needs EVAL_RERANK=1.
 *                      off (default) — `relevant_content` whole, up to
 *                        CONTENT_MAX_EXCERPT_LENGTH. NOT what `rerankNode`
 *                        does; it is the "no window at all" reference.
 *                      head — the first RERANK_EXCERPT_CHARS, i.e. the
 *                        positional cut #2824 is about.
 *                      passages | contiguous — the query-focused excerpt,
 *                        applied to EVERY candidate (mechanism isolation).
 *                      node — what `rerankNode` actually does: query-focused
 *                        only for candidates far longer than the window, head
 *                        cut otherwise. Measure this against `head` with
 *                        CONTENT_MAX_EXCERPT_LENGTH raised (e.g. 4000), or no
 *                        candidate is long enough for the gate to fire and the
 *                        two arms are the same run.
 *                    The comparison that decides anything is head vs
 *                    contiguous: both hand over the same number of characters
 *                    and differ only in WHICH ones. Measuring either against
 *                    `off` measures window size instead, which is a different
 *                    question (and has a different answer — see #2824).
 *   EVAL_CASE_KIND   run another kind's cases through the chosen pipeline
 *   EVAL_VERBOSE=1   print top-5 titles for every miss (gold-label curation)
 *   EVAL_OUT         write per-case results as JSON to this path
 *
 * Three pipelines, because the product has three: `qa` is the notebook Q&A
 * search (depth profile + optional rerank), `manual` is the notebook search
 * field (`/api/research/search` params, then the real `rankManualSearchResults`
 * the route runs — not a copy of it, so the eval cannot drift away from the
 * code it measures), `notebook` is the notebook-scope Q&A path: the real
 * `NotebookQAService.getSearchContext` with per-case scope (system collection,
 * multi-collection, or a synthetic user notebook stubbed via `getCollectionFn`
 * / `getDocumentIdsFn`). Its query construction mirrors `notebookStreamCore`
 * — if that changes (e.g. the history-aware rewrite of the verbesserungsplan),
 * the mirror below must follow. Each pipeline defaults to its own `kind`
 * cases.
 *
 * A case scores at rank r when the first matching result appears at position
 * r (1-based). Metrics: Hit@1 / Hit@3 / Hit@5, MRR@10 — per collection and
 * overall. Baseline discipline: run once before a retrieval change, once
 * after, compare the two EVAL_OUT files.
 */
import { writeFileSync } from 'node:fs';

import dotenv from 'dotenv';

// Load .env BEFORE the app modules: static imports would be hoisted above
// dotenv.config(), so config/env.js would parse an empty environment and the
// search service would silently degrade to zero results.
dotenv.config();

const { getNotebookDepthProfile, applyDepthProfile } =
  await import('../../config/notebookDepthProfiles.js');
const { getSearchParams, getSystemCollectionConfig, applyDefaultFilter } =
  await import('../../config/systemCollectionsConfig.js');
const { DocumentSearchService } =
  await import('../../services/document-services/DocumentSearchService/index.js');
const { rerankPipeline } = await import('../../services/search/rerankPipeline.js');
const { selectRelevantExcerpt } = await import('../../services/search/relevantExcerpt.js');
const { vectorConfig } = await import('../../config/vectorConfig.js');
const { rankManualSearchResults } = await import('../../services/search/manualSearchRanking.js');
const { notebookQAService } = await import('../../services/notebook/NotebookQAService.js');
const { normalizeNotebookHistory, buildRewriteTranscript } =
  await import('../../routes/chat/services/notebookHistoryService.js');
const { expandQuery } = await import('../../services/search/QueryExpansionService.js');

const { RETRIEVAL_CASES } = await import('./cases.js');

import { type RetrievalCase } from './cases.js';

import type { DocumentResult } from '../../services/BaseSearchService/types.js';
import type { NotebookDepth } from '@gruenerator/contracts';

type DocumentSearchService = InstanceType<typeof DocumentSearchService>;

const MRR_K = 10;
/**
 * The window the excerpt fills. Same source as `rerankNode`'s
 * (`CONTENT_MAX_EXCERPT_LENGTH`), so an eval run cannot silently measure a
 * window the node does not use. EVAL_RERANK_WINDOW overrides it for sweeps.
 */
const RERANK_WINDOW = vectorConfig.get('content').maxExcerptLength;

/**
 * `node` ist der Arm, der den ausgelieferten Zustand nachbildet — und der ist
 * seit #2998 **kein Schnitt**, also identisch mit `off`. Er bleibt als eigener
 * Name stehen, damit ein Lauf ohne `EVAL_RERANK_EXCERPT` misst, was wirklich
 * läuft.
 *
 * `gated` ist der Zustand VOR #2998 (anfragebezogener Auszug im Fenster, aber
 * nur für Kandidaten ab dem Doppelten der Fenstergrösse). Er bleibt
 * reproduzierbar, weil die Zeile, gegen die dieser Umbau antritt, sonst nicht
 * mehr nachzumessen wäre.
 */
type ExcerptArm = 'off' | 'head' | 'passages' | 'contiguous' | 'gated' | 'node';

/** Fenstergrösse der ehemaligen Schnitte; per EVAL_RERANK_WINDOW verstellbar. */
const evalWindow = Number(process.env.EVAL_RERANK_WINDOW || RERANK_WINDOW);

/** Tor des `gated`-Arms: ab welchem Vielfachen des Fensters ausgewählt wurde. */
const GATED_FOCUS_MIN_RATIO = 2;

/** Was der Cross-Encoder in diesem Lauf zu lesen bekommt. */
function excerptFor(content: string, query: string, arm: ExcerptArm): string {
  if (arm === 'off' || arm === 'node') return content;
  const head = content.slice(0, evalWindow);
  if (arm === 'head') return head;
  if (arm === 'gated' && content.length < evalWindow * GATED_FOCUS_MIN_RATIO) return head;
  const mode = arm === 'passages' ? 'passages' : 'contiguous';
  // Derselbe Rückfall wie damals im Knoten: ohne Signal bleibt es beim Kopfschnitt.
  return selectRelevantExcerpt(content, query, evalWindow, mode)?.text ?? head;
}
const HIT_KS = [1, 3, 5] as const;

// Request defaults of the manual search field, as the web client sends them.
const MANUAL_VECTOR_WEIGHT = 0.7;
const MANUAL_TEXT_WEIGHT = 0.3;
const MANUAL_RESULT_LIMIT = 30;
const MANUAL_MIN_SCORE = 0.35;

interface CaseOutcome {
  id: string;
  collection: string;
  query: string;
  rank: number | null;
  rerankRank?: number | null;
  /** Wanduhr des Cross-Encoder-Aufrufs. Nur gesetzt, wenn er wirklich lief. */
  rerankTimeMs?: number;
  /** Wie viele Kandidaten er dafür bewerten musste. */
  rerankBatch?: number;
  topTitles: string[];
  error?: string;
}

/** Structural minimum: `DocumentResult` and `ExpandedChunkResult` both satisfy it. */
type ScoredResult = {
  title?: string | null | undefined;
  filename?: string | null | undefined;
  source_url?: string | null | undefined;
};

function firstMatchRank(results: ScoredResult[], evalCase: RetrievalCase): number | null {
  for (let i = 0; i < results.length; i++) {
    const title = results[i].title || results[i].filename || '';
    const url = results[i].source_url || '';
    const matched = evalCase.expect.some((exp) => {
      const titleOk = exp.titlePattern ? new RegExp(exp.titlePattern, 'i').test(title) : false;
      const urlOk = exp.urlPattern ? new RegExp(exp.urlPattern, 'i').test(url) : false;
      return titleOk || urlOk;
    });
    if (matched) return i + 1;
  }
  return null;
}

async function runCase(
  searchService: DocumentSearchService,
  evalCase: RetrievalCase,
  depth: NotebookDepth,
  withRerank: boolean,
  excerptMode: ExcerptArm
): Promise<CaseOutcome> {
  const config = getSystemCollectionConfig(evalCase.collection);
  if (!config) {
    return {
      id: evalCase.id,
      collection: evalCase.collection,
      query: evalCase.query,
      rank: null,
      topTitles: [],
      error: `unknown collection id: ${evalCase.collection}`,
    };
  }

  const profile = getNotebookDepthProfile(depth);
  const searchParams = applyDepthProfile(getSearchParams(evalCase.collection), profile);
  const additionalFilter = applyDefaultFilter(evalCase.collection, undefined);

  try {
    const resp = await searchService.search({
      query: evalCase.query,
      userId: undefined,
      options: {
        limit: searchParams.limit,
        mode: searchParams.mode,
        vectorWeight: searchParams.vectorWeight,
        textWeight: searchParams.textWeight,
        threshold: searchParams.threshold,
        searchCollection: config.qdrantCollection,
        recallLimit: searchParams.recallLimit,
        qualityMin: searchParams.qualityMin,
        additionalFilter,
      },
    } as Parameters<DocumentSearchService['search']>[0]);

    if (resp.success === false) {
      return {
        id: evalCase.id,
        collection: evalCase.collection,
        query: evalCase.query,
        rank: null,
        topTitles: [],
        error: resp.error || resp.message || 'search returned success=false',
      };
    }

    const results = (resp.results || []) as DocumentResult[];
    const outcome: CaseOutcome = {
      id: evalCase.id,
      collection: evalCase.collection,
      query: evalCase.query,
      rank: firstMatchRank(results, evalCase),
      topTitles: results.slice(0, 5).map((r) => r.title || r.filename || r.source_url || '?'),
    };

    if (withRerank && results.length > 2) {
      const rerank = await rerankPipeline({
        query: evalCase.query,
        items: results.map((r) => ({
          title: r.title || '',
          content: excerptFor(r.relevant_content || '', evalCase.query, excerptMode),
        })),
        inputLimit: results.length,
        outputLimit: MRR_K,
        minRelevance: 0,
      });
      if (!rerank.failed) {
        const reranked = rerank.rankedIndices.map((i) => results[i]);
        outcome.rerankRank = firstMatchRank(reranked, evalCase);
      }
      // #2824 wollte diese Zahl gegen die Turn-Latenz gehalten haben (Loop-Turns
      // lagen am 24.08.2026 bei 7,9 s und 9,4 s). Sie fiel hier schon an und
      // wurde weggeworfen; ein Fehlschlag zählt mit, denn ein Timeout kostet
      // Wanduhr genauso.
      outcome.rerankTimeMs = rerank.rerankTimeMs;
      outcome.rerankBatch = results.length;
    }

    return outcome;
  } catch (error) {
    return {
      id: evalCase.id,
      collection: evalCase.collection,
      query: evalCase.query,
      rank: null,
      topTitles: [],
      error: (error as Error).message,
    };
  }
}

/**
 * The notebook search field: `/api/research/search` search params, then the
 * production ranking helper. Mirrors the route's request defaults — hybrid
 * mode, relevance sort, 30 results.
 */
async function runManualCase(
  searchService: DocumentSearchService,
  evalCase: RetrievalCase
): Promise<CaseOutcome> {
  const base: CaseOutcome = {
    id: evalCase.id,
    collection: evalCase.collection,
    query: evalCase.query,
    rank: null,
    topTitles: [],
  };

  const config = getSystemCollectionConfig(evalCase.collection);
  if (!config) {
    return { ...base, error: `unknown collection id: ${evalCase.collection}` };
  }

  const searchParams = getSearchParams(evalCase.collection);
  const additionalFilter = applyDefaultFilter(evalCase.collection, undefined);

  try {
    const resp = await searchService.search({
      query: evalCase.query,
      userId: undefined,
      options: {
        limit: searchParams.limit,
        mode: 'hybrid',
        vectorWeight: MANUAL_VECTOR_WEIGHT,
        textWeight: MANUAL_TEXT_WEIGHT,
        threshold: searchParams.threshold,
        searchCollection: config.qdrantCollection,
        recallLimit: searchParams.recallLimit,
        qualityMin: searchParams.qualityMin,
        additionalFilter,
      },
    } as Parameters<DocumentSearchService['search']>[0]);

    if (resp.success === false) {
      return { ...base, error: resp.error || resp.message || 'search returned success=false' };
    }

    const ranked = rankManualSearchResults({
      results: (resp.results ?? []) as DocumentResult[],
      sortBy: 'relevance',
      limit: MANUAL_RESULT_LIMIT,
      minScore: MANUAL_MIN_SCORE,
    });

    return {
      ...base,
      rank: firstMatchRank(ranked, evalCase),
      topTitles: ranked.slice(0, 5).map((r) => r.title || r.source_url || '?'),
    };
  } catch (error) {
    return { ...base, error: (error as Error).message };
  }
}

/**
 * The notebook-scope Q&A path: `NotebookQAService.getSearchContext`, scored on
 * `sortedResults`. Mirrors the query construction of `notebookStreamCore`
 * (history only when the profile allows it, variant expansion only for
 * multi-variant profiles) — keep this copy in sync if that code changes.
 */
async function runNotebookCase(
  evalCase: RetrievalCase,
  depth: NotebookDepth
): Promise<CaseOutcome> {
  const base: CaseOutcome = {
    id: evalCase.id,
    collection: evalCase.collection,
    query: evalCase.query,
    rank: null,
    topTitles: [],
  };
  const meta = evalCase.notebook;
  if (!meta) {
    return { ...base, error: `notebook case without notebook meta: ${evalCase.id}` };
  }

  const profile = getNotebookDepthProfile(depth);
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    ...(meta.history ?? []),
    { role: 'user', content: evalCase.query },
  ];
  const lastUserIdx = messages.length - 1;
  const history = profile.history ? normalizeNotebookHistory(messages.slice(0, lastUserIdx)) : [];
  let queries = [evalCase.query];
  if (profile.queryVariants > 1) {
    const expanded = await expandQuery(
      evalCase.query,
      history.length > 0 ? { historyContext: buildRewriteTranscript(history) } : {}
    );
    queries = [expanded.primary, ...expanded.alternatives].slice(0, profile.queryVariants);
  }

  const user = meta.user;
  try {
    const ctx = await notebookQAService.getSearchContext({
      question: evalCase.query,
      // A user case reaches the single-collection path through the stubbed
      // collection id, not through a system id.
      collectionId: meta.collectionId ?? user?.collectionId,
      ...(meta.collectionIds && { collectionIds: meta.collectionIds }),
      userId: 'SYSTEM',
      depth,
      queries,
      ...(user && {
        getCollectionFn: async (id: string) =>
          id === user.collectionId ? { name: user.name, user_id: 'SYSTEM' } : null,
        getDocumentIdsFn: async (id: string) => (id === user.collectionId ? user.documentIds : []),
      }),
    });

    const results = ctx?.sortedResults ?? [];
    return {
      ...base,
      rank: firstMatchRank(results, evalCase),
      topTitles: results.slice(0, 5).map((r) => r.title || r.source_url || '?'),
      ...(ctx === null && { error: 'search returned no results' }),
    };
  } catch (error) {
    return { ...base, error: (error as Error).message };
  }
}

function computeMetrics(outcomes: CaseOutcome[], rankOf: (o: CaseOutcome) => number | null) {
  const n = outcomes.length;
  const hits = Object.fromEntries(HIT_KS.map((k) => [k, 0])) as Record<number, number>;
  let mrrSum = 0;
  for (const o of outcomes) {
    const rank = rankOf(o);
    if (rank === null) continue;
    for (const k of HIT_KS) if (rank <= k) hits[k]++;
    if (rank <= MRR_K) mrrSum += 1 / rank;
  }
  const pct = (x: number) => ((100 * x) / Math.max(1, n)).toFixed(1).padStart(5);
  return {
    line:
      HIT_KS.map((k) => `Hit@${k} ${pct(hits[k])}%`).join('  ') +
      `  MRR@${MRR_K} ${(mrrSum / Math.max(1, n)).toFixed(3)}`,
  };
}

async function main() {
  const pipelineEnv = process.env.EVAL_PIPELINE;
  const pipeline = pipelineEnv === 'manual' || pipelineEnv === 'notebook' ? pipelineEnv : 'qa';
  const depth = (process.env.EVAL_DEPTH ||
    (pipeline === 'notebook' ? 'deep' : 'fast')) as NotebookDepth;
  const withRerank = process.env.EVAL_RERANK === '1';
  const excerptMode = (process.env.EVAL_RERANK_EXCERPT ?? 'off') as ExcerptArm;
  const verbose = process.env.EVAL_VERBOSE === '1';
  const collectionFilter = process.env.EVAL_COLLECTION;
  const idFilter = process.env.EVAL_FILTER;

  // Each pipeline runs its own cases by default: keyword lookups say nothing
  // about the Q&A path, and questions say nothing about the search field.
  // EVAL_CASE_KIND crosses them deliberately — running the long `qa` queries
  // through the manual pipeline is how one checks whether a ranking stage
  // behaves differently for wordy queries than for keywords.
  const caseKind = process.env.EVAL_CASE_KIND || pipeline;
  let cases = RETRIEVAL_CASES.filter((c) => (c.kind ?? 'qa') === caseKind);
  if (collectionFilter) cases = cases.filter((c) => c.collection.includes(collectionFilter));
  if (idFilter) cases = cases.filter((c) => c.id.includes(idFilter));

  if (cases.length === 0) {
    console.error('No cases match the given filters.');
    process.exit(1);
  }

  const modeLabel =
    pipeline === 'manual'
      ? 'manual search'
      : pipeline === 'notebook'
        ? `notebook getSearchContext depth=${depth}`
        : `depth=${depth}${withRerank ? `, +rerank(${excerptMode})` : ''}`;
  console.log(
    `Running ${cases.length} retrieval cases (${modeLabel}) against ${process.env.QDRANT_URL || 'QDRANT_URL unset!'}`
  );

  const searchService = new DocumentSearchService();
  const outcomes: CaseOutcome[] = [];
  for (const evalCase of cases) {
    const outcome =
      pipeline === 'manual'
        ? await runManualCase(searchService, evalCase)
        : pipeline === 'notebook'
          ? await runNotebookCase(evalCase, depth)
          : await runCase(searchService, evalCase, depth, withRerank, excerptMode);
    outcomes.push(outcome);
    const rankLabel = outcome.error
      ? `ERROR ${outcome.error}`
      : outcome.rank === null
        ? 'miss'
        : `rank ${outcome.rank}${outcome.rerankRank !== undefined ? ` → rerank ${outcome.rerankRank ?? 'miss'}` : ''}`;
    console.log(
      `  ${outcome.rank !== null ? '✓' : '✗'} [${outcome.collection}] ${outcome.id}: ${rankLabel}`
    );
    // Anything that is not rank 1 is worth seeing: for keyword lookups the
    // interesting failure is "found, but behind something else".
    if (verbose && !outcome.error && (outcome.rank === null || outcome.rank > 1)) {
      for (const t of outcome.topTitles) console.log(`      • ${t}`);
    }
  }

  const byCollection = new Map<string, CaseOutcome[]>();
  for (const o of outcomes) {
    const list = byCollection.get(o.collection) ?? [];
    list.push(o);
    byCollection.set(o.collection, list);
  }

  console.log('\n── Ergebnisse (Retrieval) ──');
  for (const [collection, list] of byCollection) {
    console.log(
      `${collection.padEnd(28)} n=${String(list.length).padStart(2)}  ${computeMetrics(list, (o) => o.rank).line}`
    );
  }
  console.log(
    `${'GESAMT'.padEnd(28)} n=${String(outcomes.length).padStart(2)}  ${computeMetrics(outcomes, (o) => o.rank).line}`
  );

  if (withRerank) {
    console.log('\n── Ergebnisse (nach Rerank) ──');
    console.log(
      `${'GESAMT'.padEnd(28)} n=${String(outcomes.length).padStart(2)}  ${computeMetrics(outcomes, (o) => o.rerankRank ?? o.rank).line}`
    );

    const timings = outcomes
      .map((o) => o.rerankTimeMs)
      .filter((t): t is number => typeof t === 'number')
      .sort((a, b) => a - b);
    if (timings.length > 0) {
      const batches = outcomes
        .map((o) => o.rerankBatch)
        .filter((n): n is number => typeof n === 'number');
      const at = (q: number): number =>
        timings[Math.min(timings.length - 1, Math.floor((timings.length - 1) * q))] ?? 0;
      console.log('\n── Latenz des Cross-Encoder-Aufrufs ──');
      console.log(
        `n=${timings.length}  Median ${at(0.5)} ms  p90 ${at(0.9)} ms  max ${timings[timings.length - 1]} ms  ` +
          `(Kandidaten je Aufruf: ${Math.min(...batches)}–${Math.max(...batches)})`
      );
    }
  }

  const errors = outcomes.filter((o) => o.error);
  if (errors.length > 0) {
    console.log(`\n${errors.length} Fälle mit Fehlern — Metriken entsprechend unvollständig.`);
  }

  if (process.env.EVAL_OUT) {
    writeFileSync(
      process.env.EVAL_OUT,
      JSON.stringify({ pipeline, depth, withRerank, outcomes }, null, 2)
    );
    console.log(`\nErgebnisse geschrieben: ${process.env.EVAL_OUT}`);
  }

  process.exit(0);
}

main().catch((error) => {
  console.error('Eval failed:', error);
  process.exit(1);
});
