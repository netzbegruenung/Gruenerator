/**
 * Retrieval eval runner — measures Hit@k and MRR over the PRODUCTION search
 * path (documentSearchService.search with the same params NotebookQAService
 * uses), against the live Qdrant instance from QDRANT_URL.
 *
 *   pnpm --filter @gruenerator/api eval:retrieval
 *
 * Env:
 *   EVAL_PIPELINE    qa (default) | manual | notebook | chat-notebook — see below
 *   EVAL_COLLECTION  only run cases for this collection id (substring match)
 *   EVAL_FILTER      only run cases whose id contains this substring
 *   EVAL_DEPTH       depth profile: fast | deep | ultra (default fast;
 *                    notebook defaults to deep, the production notebook default)
 *   EVAL_RERANK=1    additionally score the post-rerank ranking (Regolo). qa
 *                    and chat-notebook — manual has no rerank stage.
 *   EVAL_RERANK_INSTRUCT  preset key from `rerankInstructs.ts` (`service`
 *                    default, `chat`, `qa`, `de`, `de-strict`). Needs
 *                    EVAL_RERANK=1. Applies to the qa arm's rerankPipeline
 *                    call. chat-notebook always sends its
 *                    own instruct (rerankNode's text minus the temporal hint)
 *                    and ignores this. `service` sends no `instruct` — the
 *                    cross-encoder service's own default text applies, i.e.
 *                    the eval's behaviour before this preset existed.
 *   EVAL_RERANK_SHAPE  full (default, today) | prod. qa arm only. `full`
 *                    keeps the eval's own knobs (`inputLimit: results.length,
 *                    outputLimit: MRR_K, minRelevance: 0` — rerank the WHOLE
 *                    candidate list). `prod` uses the config-driven knobs
 *                    `rerankNode` actually reads (RERANK_INPUT_LIMIT /
 *                    RERANK_OUTPUT_LIMIT / RERANK_MIN_RELEVANCE via
 *                    vectorConfig), omits `minKeep` (rerankNode never sets it
 *                    either — pipeline default 0) and leaves MMR at the
 *                    pipeline's own default, matching what production sends.
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
 *   EVAL_LOOP_RERANK  dreiwertig, qa only. unset (default) — heutiger Lauf,
 *                    byte-identisch zur historischen Basis. `0` — loop-förmige
 *                    Suche OHNE Rerank: dasselbe geklemmte `limit` wie der
 *                    agentische Loop (`executeDirectSearch`s exportiertes
 *                    RERANK_LIMIT_CLAMP + OVERFETCH_CEILING, hier direkt
 *                    importiert statt gespiegelt), aber ohne `rerankChunks`.
 *                    `1` — dieselbe loop-förmige
 *                    Suche MIT `rerankChunks: true`, also mit dem Cross-Encoder
 *                    VOR der Gruppierung — der Pfad, den der agentische Loop
 *                    hinter LOOP_RERANK_ENABLED fährt (#3120). `0` und `1`
 *                    benutzen absichtlich dasselbe Limit, damit sie sich nur
 *                    im Rerank unterscheiden und nicht auch in der Trefferbreite
 *                    — sonst würde ein grösserer Kandidatenpool den Effekt des
 *                    Rerankens vortäuschen oder verdecken. Orthogonal zu
 *                    EVAL_RERANK: das ist der Dokument-Rerank NACH der
 *                    Gruppierung. Beide zusammen wären zwei Stufen und messen
 *                    nichts, was in der Produktion vorkommt.
 *                    Die Encoder-Zeit ist von hier nicht direkt sichtbar (der
 *                    Aufruf sitzt im Dienst), deshalb misst `searchTimeMs` die
 *                    Wanduhr je Suche; die Differenz der Mediane zwischen einem
 *                    Lauf mit und einem ohne den Arm ist die Kostenzahl.
 *   EVAL_CASE_KIND   run another kind's cases through the chosen pipeline. A
 *                    case without `notebook` meta falls back to its own
 *                    `collection` as the collection id, so
 *                    `EVAL_PIPELINE=notebook EVAL_CASE_KIND=qa` walks any qa
 *                    case through the 0.35 threshold in NotebookQAService.
 *   EVAL_VERBOSE=1   print top-5 titles for every miss (gold-label curation)
 *   EVAL_OUT         write per-case results as JSON to this path
 *   EVAL_CHAT_EXPAND=1  nur für EVAL_PIPELINE=chat-notebook: hängt EINE
 *                    Paraphrase aus `expandQuery` an die Anfrage an. Das ist
 *                    das für #3121 gemessene und VERWORFENE Experiment (PR
 *                    #3159: Hit@3 60 → 60 %, MRR 0,525 → 0,525, +1,2 s je
 *                    Turn) — `searchNode` ruft `expandQuery` für
 *                    notebook-gebundene Turns nicht auf. Ohne die Variable
 *                    läuft der Arm wie die Produktion. Der Schalter bleibt,
 *                    damit der nächste Anlauf (etwa mit feinerem Sortier-
 *                    schlüssel) gepaart gegen dieselbe Grundlinie messen kann.
 *
 * The #3118 tuning-arm measurement session (Task 8) runs with
 * HYBRID_ENABLE_QUALITY_GATE=false — the gate's minFinalScore is verified
 * safe for `rrf` only (hybridSearch.ts), and this eval is what compares all
 * five arms.
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
 * `chat-notebook` is the fourth: the notebook-bound branch of `searchNode`
 * (`executeDirectSearch` per collection × query, URL dedup, relevance-label
 * sort, `sortLimit` cap) — NOT the notebook surface. It mirrors that code line
 * for line; keep this copy in sync when `searchNode` changes.
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

// Read-only eval: skip collection/index reconciliation on connect (#3167).
const { useQdrantConnectOnly } = await import('../../database/services/QdrantService/index.js');
useQdrantConnectOnly();

const { getNotebookDepthProfile, applyDepthProfile, getChatNotebookProfile } =
  await import('../../config/notebookDepthProfiles.js');
const { resolveNotebookCollections } = await import('../../config/notebookCollectionMap.js');
const { getSearchParams, getSystemCollectionConfig, applyDefaultFilter } =
  await import('../../config/systemCollectionsConfig.js');
const { DocumentSearchService } =
  await import('../../services/document-services/DocumentSearchService/index.js');
const { RERANK_LIMIT_CLAMP, OVERFETCH_CEILING, executeDirectSearch } =
  await import('../../routes/chat/agents/directSearchExecutors.js');
const { relevanceLabelToScore } = await import('../../routes/chat/agents/searchFormatting.js');
const { deriveCitationTitle } =
  await import('../../agents/langgraph/ChatGraph/nodes/citationUtils.js');
const { refineSearchQuery } =
  await import('../../agents/langgraph/ChatGraph/nodes/queryRefineResolver.js');
const { formatConversationHistory } =
  await import('../../agents/langgraph/ChatGraph/nodes/classifierHeuristics.js');
const { rerankPipeline } = await import('../../services/search/rerankPipeline.js');
const { selectRelevantExcerpt } = await import('../../services/search/relevantExcerpt.js');
const { vectorConfig } = await import('../../config/vectorConfig.js');
const { rankManualSearchResults } = await import('../../services/search/manualSearchRanking.js');
const { notebookQAService } = await import('../../services/notebook/NotebookQAService.js');
const { normalizeNotebookHistory, buildRewriteTranscript } =
  await import('../../routes/chat/services/notebookHistoryService.js');
const { expandQuery } = await import('../../services/search/QueryExpansionService.js');

const { RETRIEVAL_CASES } = await import('./cases.js');
const { RERANK_INSTRUCT_PRESETS, isRerankInstructPreset } = await import('./rerankInstructs.js');
const { rerankDelta } = await import('./rerankDelta.js');

import { type RetrievalCase } from './cases.js';
import { type RerankInstructPreset } from './rerankInstructs.js';

import type { DocumentResult } from '../../services/BaseSearchService/types.js';
import type { NotebookDepth } from '@gruenerator/contracts';
import type { ModelMessage } from 'ai';

type DocumentSearchService = InstanceType<typeof DocumentSearchService>;

const MRR_K = 10;
/**
 * The window the excerpt fills. Same source as `rerankNode`'s
 * (`CONTENT_MAX_EXCERPT_LENGTH`), so an eval run cannot silently measure a
 * window the node does not use. EVAL_RERANK_WINDOW overrides it for sweeps.
 */
const RERANK_WINDOW = vectorConfig.get('content').maxExcerptLength;

/**
 * Production's config-driven rerank knobs — the same source `rerankNode`
 * reads (`vectorConfig.get('rerank')`, itself `env.RERANK_*`). Used by
 * EVAL_RERANK_SHAPE=prod so that arm measures the real thresholds instead of
 * the eval's own `results.length` / `MRR_K` / `0`.
 */
const rerankCfg = vectorConfig.get('rerank');

type RerankShape = 'full' | 'prod';

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

/**
 * The limit the loop's `executeDirectSearch` would actually send to Qdrant —
 * same `qdrantLimit` formula, against the real `RERANK_LIMIT_CLAMP` /
 * `OVERFETCH_CEILING` imported above instead of a mirrored copy. Applied to
 * BOTH loop-shaped arms (`EVAL_LOOP_RERANK=0` and `=1`), never only to the
 * reranked one, so the two differ solely in the rerank flag and never in
 * recall width.
 */
function loopShapedLimit(limit: number): number {
  return Math.min(Math.min(limit, RERANK_LIMIT_CLAMP) * 2, OVERFETCH_CEILING);
}

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
  /** Wanduhr des Suchaufrufs. Gepaart über zwei Läufe = Kosten des Encoders. */
  searchTimeMs?: number;
  /**
   * Qdrant-Aufrufe dieses Falls (`Sammlungen × Formulierungen`). Die Zahl, an
   * der die Abnahmebedingung „höchstens verdoppelt" nachprüfbar wird — ohne sie
   * wäre sie nur behauptet.
   */
  qdrantCalls?: number;
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
  excerptMode: ExcerptArm,
  loopShaped: boolean,
  withChunkRerank: boolean,
  rerankShape: RerankShape,
  instructText: string | null
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
  const effectiveLimit = loopShaped ? loopShapedLimit(searchParams.limit) : searchParams.limit;

  try {
    const searchStartedAt = Date.now();
    const resp = await searchService.search({
      query: evalCase.query,
      userId: undefined,
      options: {
        limit: effectiveLimit,
        mode: searchParams.mode,
        vectorWeight: searchParams.vectorWeight,
        textWeight: searchParams.textWeight,
        threshold: searchParams.threshold,
        searchCollection: config.qdrantCollection,
        recallLimit: searchParams.recallLimit,
        qualityMin: searchParams.qualityMin,
        additionalFilter,
        ...(withChunkRerank && { rerankChunks: true }),
      },
    } as Parameters<DocumentSearchService['search']>[0]);
    const searchTimeMs = Date.now() - searchStartedAt;

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
      searchTimeMs,
    };

    if (withRerank && results.length > 2) {
      // `full` (default) reranks the WHOLE candidate list — the eval's own
      // knobs, unrelated to what production sends. `prod` mirrors
      // `rerankNode`'s actual config-driven thresholds; see EVAL_RERANK_SHAPE
      // in the header.
      const shapeOpts =
        rerankShape === 'prod'
          ? {
              inputLimit: rerankCfg.inputLimit,
              outputLimit: rerankCfg.outputLimit,
              minRelevance: rerankCfg.minRelevance,
            }
          : { inputLimit: results.length, outputLimit: MRR_K, minRelevance: 0 };
      const rerank = await rerankPipeline({
        query: evalCase.query,
        items: results.map((r) => ({
          title: r.title || '',
          content: excerptFor(r.relevant_content || '', evalCase.query, excerptMode),
        })),
        ...shapeOpts,
        ...(instructText !== null && { instruct: instructText }),
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
 * (history-aware rewrite when the profile allows it and history is present,
 * variant expansion only for multi-variant profiles) — keep this copy in sync
 * if that code changes. It only searches, so it needs no prompt-history
 * variable — `meta.history` feeds the rewrite regardless of `profile.history`.
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
  // Ein Fall ohne `notebook`-Metadaten ist ein qa-/manual-Fall, den
  // EVAL_CASE_KIND in diese Pipeline gezogen hat. Sein `collection` IST die
  // System-Sammlungs-ID, die `getSearchContext` erwartet — bei den vorhandenen
  // notebook-Fällen stehen beide Felder ohnehin auf demselben Wert
  // (cases.ts:527-532). Ohne diesen Rückfall bliebe die einzige Pipeline, die
  // die 0,35-Schwelle in NotebookQAService.ts:195 durchläuft, für die einzige
  // Sammlung mit Sparse-Vektoren blind (#3118).
  const meta = evalCase.notebook ?? { collectionId: evalCase.collection };

  const profile = getNotebookDepthProfile(depth);
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    ...(meta.history ?? []),
    { role: 'user', content: evalCase.query },
  ];
  const lastUserIdx = messages.length - 1;
  const incomingHistory = normalizeNotebookHistory(messages.slice(0, lastUserIdx));
  let queries = [evalCase.query];
  const wantsRewrite = profile.queryRewrite && incomingHistory.length > 0;
  if (wantsRewrite || profile.queryVariants > 1) {
    const expanded = await expandQuery(
      evalCase.query,
      wantsRewrite
        ? {
            historyContext: buildRewriteTranscript(incomingHistory),
            ...(profile.queryVariants <= 1 && { variants: 0 }),
          }
        : {}
    );
    queries = [expanded.primary, ...expanded.alternatives].slice(
      0,
      Math.max(1, profile.queryVariants)
    );
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

/**
 * Der notebook-gebundene Zweig von `searchNode` — Zeile für Zeile nachgebaut
 * (`searchNode.ts:1507-1609`), NICHT die Notebook-Fläche: andere Suchfunktion,
 * andere Schwellen, andere Fusion, andere Kappen. Keep this copy in sync if
 * `searchNode` changes; `selectAcrossQueryGroups` läuft hier bewusst nicht, weil
 * es dort auch nicht läuft.
 *
 * Der Auflöser (`refineSearchQuery`) läuft nur für Fälle MIT Verlauf. Das ist
 * eine bewusste Vereinfachung: die Produktion schickt jeden Mention-Turn durch
 * ihn, aber ohne Verlauf ist die Fallanfrage bereits das Thema, und ein
 * Modellaufruf mehr macht jeden Lauf um so viel unschärfer, wie er ihn
 * realistischer macht. Für einen paarweisen Vergleich zweier Arme ist die
 * schärfere Messung die brauchbarere.
 */
async function runChatNotebookCase(
  evalCase: RetrievalCase,
  withExpansion: boolean,
  withRerank: boolean
): Promise<CaseOutcome> {
  const base: CaseOutcome = {
    id: evalCase.id,
    collection: evalCase.collection,
    query: evalCase.query,
    rank: null,
    topTitles: [],
  };
  const meta = evalCase.chatNotebook;
  if (!meta) {
    return { ...base, error: `chat-notebook case without chatNotebook meta: ${evalCase.id}` };
  }

  const collections = resolveNotebookCollections(meta.notebookIds);
  if (collections.length === 0) {
    return { ...base, error: `no collections for notebooks: ${meta.notebookIds.join(', ')}` };
  }

  const profile = getChatNotebookProfile();
  const startedAt = Date.now();

  try {
    // 1. Die Anfrage. Auf dem Mention-Pfad löst `classifyWithForcedSearch` eine
    //    Folgefrage gegen den Verlauf auf, BEVOR `searchNode` sie sieht
    //    (classifierNode.ts:842-852 → refineSearchQuery). `formatConversationHistory`
    //    schneidet die letzte Nachricht SELBST ab (classifierHeuristics.ts:888),
    //    deshalb geht die aktuelle Frage mit hinein.
    let primary = evalCase.query;
    if (meta.history && meta.history.length > 0) {
      const messages = [...meta.history, { role: 'user' as const, content: evalCase.query }];
      const refined = await refineSearchQuery({
        userContent: evalCase.query,
        conversationContext: formatConversationHistory(messages as unknown as ModelMessage[]),
        topicalContext: null,
      });
      primary = refined?.query || evalCase.query;
    }

    // 2. Die Paraphrase. EINE, nicht zwei — dieselbe Zahl wie in
    //    `searchNode.ts`. Kein `historyContext`: der Auflöser oben hat die
    //    Folgefrage schon aufgelöst, und `variants` wirkt ohne Verlauf gar nicht
    //    (QueryExpansionService.ts:91, :107-112).
    const queries = [primary];
    if (withExpansion) {
      try {
        const expanded = await expandQuery(primary);
        queries.push(...expanded.alternatives.slice(0, 1));
      } catch {
        // Best effort, wie im Knoten: der Ausfall ist der Zustand von vorher.
      }
    }

    // 3. Sammlungs-aussen, anfragen-innen — die Reihenfolge IST die
    //    Tie-Break-Regel, weil `sort` stabil ist (searchNode.ts:1541-1542).
    const searchResults = await Promise.all(
      collections.flatMap((collection) =>
        queries.map((q) =>
          executeDirectSearch({ query: q, collection, limit: profile.searchLimit }).catch(
            () => null
          )
        )
      )
    );

    // 4. Flachklopfen in Aufrufreihenfolge + URL-Dedup (searchNode.ts:1576-1594).
    //    `source_url` und nicht `url`: `firstMatchRank` liest genau dieses Feld.
    const items: Array<{ title: string; source_url: string; relevance: number; content: string }> =
      [];
    const seenUrls = new Set<string>();
    for (const searchResult of searchResults) {
      if (!searchResult?.results) continue;
      for (const r of searchResult.results) {
        if (r.url && seenUrls.has(r.url)) continue;
        if (r.url) seenUrls.add(r.url);
        items.push({
          title: deriveCitationTitle(r.source, r.url, searchResult.collection),
          source_url: r.url || '',
          relevance: relevanceLabelToScore(r.relevance),
          content: r.excerpt || '',
        });
      }
    }

    // 5. Sortieren und kappen (searchNode.ts:1603-1609). Der Schlüssel ist grob
    //    (drei Eimer, searchFormatting.ts:46-50) — das ist das benannte Risiko
    //    dieses Umbaus, nicht ein Fehler dieser Kopie.
    items.sort((a, b) => b.relevance - a.relevance);
    const capped = items.slice(
      0,
      collections.length > 1 ? profile.sortLimit.multi : profile.sortLimit.single
    );

    const outcome: CaseOutcome = {
      ...base,
      rank: firstMatchRank(capped, evalCase),
      topTitles: capped.slice(0, 5).map((r) => r.title || r.source_url || '?'),
      qdrantCalls: collections.length * queries.length,
      // Wanduhr des ganzen Suchschritts inklusive Auflöser und Paraphrase — das
      // ist die Zahl, gegen die das Latenzbudget von +800 ms p50 gehalten wird.
      searchTimeMs: Date.now() - startedAt,
    };

    // Wie `rerankNode.ts:174-180`: OHNE `minRelevance` und OHNE `minKeep` (also
    // 0,2 und 0 aus vectorConfig), und mit `queries[0]` als Anfrage — die
    // Paraphrase erreicht den Cross-Encoder in der Produktion nie. Wer hier
    // Grenzen mitgibt, misst eine Auswahl, die die Produktion nicht trifft.
    if (withRerank && capped.length > 2) {
      const rerank = await rerankPipeline({
        query: queries[0],
        items: capped.map((r) => ({ title: r.title, content: r.content })),
        inputLimit: profile.rerankInput,
        outputLimit: profile.rerankOutput,
        instruct:
          'Given a search query, retrieve relevant passages that answer the query.' +
          ' Prefer official party documents and verified sources over web snippets.',
        // Jeder Kandidat hier ist ein `gruenerator:`-Treffer, also vergibt
        // `getSourceTag` (rerankNode.ts:81-93, modul-privat) für alle dieselbe
        // Marke. Die Konstante ist exakt dasselbe Ergebnis, nicht eine Abkürzung.
        sourceTagFn: () => 'Parteidokument',
      });
      if (!rerank.failed) {
        outcome.rerankRank = firstMatchRank(
          rerank.rankedIndices.map((i) => capped[i]),
          evalCase
        );
      }
      outcome.rerankTimeMs = rerank.rerankTimeMs;
      outcome.rerankBatch = capped.length;
    }

    return outcome;
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
  const pipeline =
    pipelineEnv === 'manual' || pipelineEnv === 'notebook' || pipelineEnv === 'chat-notebook'
      ? pipelineEnv
      : 'qa';
  const depth = (process.env.EVAL_DEPTH ||
    (pipeline === 'notebook' || pipeline === 'chat-notebook' ? 'deep' : 'fast')) as NotebookDepth;
  const withRerank = process.env.EVAL_RERANK === '1';
  const withChatExpand = process.env.EVAL_CHAT_EXPAND === '1';
  // Three-valued: unset keeps today's run byte-identical to the historical
  // baseline; '0' and '1' both run the loop-shaped limit (see
  // `loopShapedLimit`) and differ only in whether rerankChunks fires.
  const loopRerankEnv = process.env.EVAL_LOOP_RERANK;
  const loopShaped = loopRerankEnv === '0' || loopRerankEnv === '1';
  const withChunkRerank = loopRerankEnv === '1';
  const excerptMode = (process.env.EVAL_RERANK_EXCERPT ?? 'off') as ExcerptArm;
  const rerankShape: RerankShape = process.env.EVAL_RERANK_SHAPE === 'prod' ? 'prod' : 'full';
  const instructEnv = process.env.EVAL_RERANK_INSTRUCT;
  const instructPreset: RerankInstructPreset =
    instructEnv && isRerankInstructPreset(instructEnv) ? instructEnv : 'service';
  const instructText = RERANK_INSTRUCT_PRESETS[instructPreset];
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

  // Same for every qa case at this depth (`applyDepthProfile` overwrites
  // `limit` with the depth's fixed `searchLimit` regardless of collection).
  const loopLimit = loopShaped ? loopShapedLimit(getNotebookDepthProfile(depth).searchLimit) : null;

  const modeLabel =
    pipeline === 'manual'
      ? 'manual search'
      : pipeline === 'notebook'
        ? `notebook getSearchContext depth=${depth}`
        : pipeline === 'chat-notebook'
          ? `searchNode notebook scope, ${withChatExpand ? 2 : 1} Formulierung(en)${
              withRerank ? ', +rerank' : ''
            }`
          : `depth=${depth}${
              withRerank ? `, +rerank(${excerptMode}, shape=${rerankShape}, ${instructPreset})` : ''
            }${loopShaped ? `, loopLimit=${loopLimit}` : ''}${
              withChunkRerank ? ', +chunkRerank' : ''
            }`;
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
          : pipeline === 'chat-notebook'
            ? await runChatNotebookCase(evalCase, withChatExpand, withRerank)
            : await runCase(
                searchService,
                evalCase,
                depth,
                withRerank,
                excerptMode,
                loopShaped,
                withChunkRerank,
                rerankShape,
                instructText
              );
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

  const searchTimings = outcomes
    .map((o) => o.searchTimeMs)
    .filter((t): t is number => typeof t === 'number')
    .sort((a, b) => a - b);
  if (searchTimings.length > 0) {
    const at = (q: number): number =>
      searchTimings[
        Math.min(searchTimings.length - 1, Math.floor((searchTimings.length - 1) * q))
      ] ?? 0;
    console.log(
      `\n── Wanduhr je Suche ──\nn=${searchTimings.length}  Median ${at(0.5)} ms  p90 ${at(0.9)} ms  max ${searchTimings[searchTimings.length - 1]} ms`
    );
  }

  const callCounts = outcomes
    .map((o) => o.qdrantCalls)
    .filter((n): n is number => typeof n === 'number');
  if (callCounts.length > 0) {
    console.log(
      `\n── Qdrant-Aufrufe je Fall ──\nn=${callCounts.length}  Summe ${callCounts.reduce((a, b) => a + b, 0)}  max ${Math.max(...callCounts)}`
    );
  }

  if (withRerank) {
    console.log('\n── Ergebnisse (nach Rerank) ──');
    for (const [collection, list] of byCollection) {
      console.log(
        `${collection.padEnd(28)} n=${String(list.length).padStart(2)}  ${computeMetrics(list, (o) => o.rerankRank ?? o.rank).line}`
      );
    }
    console.log(
      `${'GESAMT'.padEnd(28)} n=${String(outcomes.length).padStart(2)}  ${computeMetrics(outcomes, (o) => o.rerankRank ?? o.rank).line}`
    );

    const delta = rerankDelta(outcomes);
    console.log(
      `\ndelta: improved ${delta.improved.length} (${delta.improved.join(', ') || 'none'})` +
        `  worsened ${delta.worsened.length} (${delta.worsened.join(', ') || 'none'})` +
        `  unchanged ${delta.unchanged.length}`
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
      JSON.stringify(
        {
          pipeline,
          depth,
          withRerank,
          ...(pipeline === 'qa' &&
            withRerank && {
              instruct: instructPreset,
              shape: rerankShape,
              excerpt: excerptMode,
              window: evalWindow,
            }),
          ...(pipeline === 'qa' && loopShaped && { withChunkRerank, loopLimit }),
          ...(pipeline === 'chat-notebook' && { withChatExpand }),
          outcomes,
        },
        null,
        2
      )
    );
    console.log(`\nErgebnisse geschrieben: ${process.env.EVAL_OUT}`);
  }

  process.exit(0);
}

main().catch((error) => {
  console.error('Eval failed:', error);
  process.exit(1);
});
