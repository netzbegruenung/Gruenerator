/**
 * Evidence-weak signal calibration (refs #3140): the reranker's absolute top
 * score does not separate on-topic notebook questions from off-topic ones.
 * Measures alternative signals on the same 15 questions and reports whether
 * any single threshold on any signal separates the two groups.
 *
 *   pnpm --filter @gruenerator/api eval:retrieval:evidence
 *
 * Each case runs `getSearchContext` → `rerankNotebookResults` exactly as
 * `notebookStreamCore.ts` does, depth `deep`. Query construction mirrors
 * `runNotebookCase` in runRetrievalEval.ts via the same underlying helpers.
 *
 * Trap from #3140: `rerankPipeline`'s catch branch returns a synthetic
 * `scores` map with `failed: true`. Not a concern here — `rerankNotebookResults`
 * only rewrites `similarity` when `!failed`, so a failed call just leaves the
 * dense score in place (rerankTop == denseTop), visible in the table.
 */
import { writeFileSync } from 'node:fs';

import dotenv from 'dotenv';

// Load .env BEFORE the app modules — see runRetrievalEval.ts for why.
dotenv.config();

// Read-only eval: skip collection/index reconciliation on connect (#3167).
const { useQdrantConnectOnly } = await import('../../database/services/QdrantService/index.js');
useQdrantConnectOnly();

const { getNotebookDepthProfile } = await import('../../config/notebookDepthProfiles.js');
const { notebookQAService } = await import('../../services/notebook/NotebookQAService.js');
const { rerankNotebookResults } = await import('../../services/notebook/rerankNotebookResults.js');
const { normalizeNotebookHistory, buildRewriteTranscript } =
  await import('../../routes/chat/services/notebookHistoryService.js');
const { expandQuery } = await import('../../services/search/QueryExpansionService.js');
const { RETRIEVAL_CASES } = await import('./cases.js');

import type { NotebookCaseMeta, RetrievalExpectation } from './cases.js';
import type { ExpandedChunkResult } from '../../services/search/types.js';
import type { NotebookDepth } from '@gruenerator/contracts';

const DEPTH: NotebookDepth = 'deep';
/** Production `RERANK_MIN_RELEVANCE` default (config/env.ts). */
const PRODUCTION_MIN_RELEVANCE = 0.2;

type Group = 'on-topic' | 'off-topic';

interface CaseSpec {
  id: string;
  group: Group;
  query: string;
  notebook: NotebookCaseMeta;
  expect?: RetrievalExpectation[];
}

// The 6 off-topic questions from #3140, 3 per notebook against the same
// Berlin/Bayern system notebooks the on-topic cases use. #3140 quoted only 4
// of the 6 verbatim (Sauerteigbrot, Fußball-WM 2014, Tesla Model 3, Mars);
// Carbonara/Bitcoin-Mining were parenthetical labels only, not quotes — the
// exact wording lived in a gitignored per-run file not present in this
// worktree, so those two are phrased to match the label. Flagged in report.
const OFF_TOPIC_CASES: CaseSpec[] = [
  {
    id: 'offtopic-sauerteigbrot',
    query: 'Wie backe ich Sauerteigbrot?',
    collection: 'berlin-system',
  },
  {
    id: 'offtopic-fussball-wm-2014',
    query: 'Wer gewann die Fußball-WM 2014?',
    collection: 'berlin-system',
  },
  {
    id: 'offtopic-tesla-model-3',
    query: 'Was kostet ein Tesla Model 3?',
    collection: 'berlin-system',
  },
  {
    id: 'offtopic-mars-distance',
    query: 'Wie weit ist der Mars entfernt?',
    collection: 'bayern-system',
  },
  {
    id: 'offtopic-carbonara',
    query: 'Wie kocht man Spaghetti Carbonara?',
    collection: 'bayern-system',
  },
  {
    id: 'offtopic-bitcoin-mining',
    query: 'Wie funktioniert Bitcoin-Mining?',
    collection: 'bayern-system',
  },
].map((c) => ({
  id: c.id,
  group: 'off-topic' as const,
  query: c.query,
  notebook: { collectionId: c.collection },
}));

const ON_TOPIC_CASES: CaseSpec[] = [];
for (const c of RETRIEVAL_CASES) {
  if (c.kind === 'notebook' && c.notebook) {
    ON_TOPIC_CASES.push({
      id: c.id,
      group: 'on-topic',
      query: c.query,
      notebook: c.notebook,
      expect: c.expect,
    });
  }
}

const ALL_CASES: CaseSpec[] = [...ON_TOPIC_CASES, ...OFF_TOPIC_CASES];

interface CaseMetrics {
  candidates: number;
  denseTop: number;
  denseMedian: number;
  denseMargin: number;
  rerankTop: number;
  rerankMedian: number;
  rerankMargin: number;
  rerankTop3Mean: number;
  aboveThresholdShare: number;
  goldRank: number | null;
}

interface CaseResult {
  id: string;
  group: Group;
  query: string;
  metrics: CaseMetrics | null;
  error: string | null;
}

function median(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function firstMatchRank(
  results: ExpandedChunkResult[],
  expect: RetrievalExpectation[] | undefined
): number | null {
  if (!expect) return null;
  for (let i = 0; i < results.length; i++) {
    const title = results[i].title || '';
    const url = results[i].source_url || '';
    const matched = expect.some((exp) => {
      const titleOk = exp.titlePattern ? new RegExp(exp.titlePattern, 'i').test(title) : false;
      const urlOk = exp.urlPattern ? new RegExp(exp.urlPattern, 'i').test(url) : false;
      return titleOk || urlOk;
    });
    if (matched) return i + 1;
  }
  return null;
}

/** Mirrors `runNotebookCase` in runRetrievalEval.ts, plus the rerank step. */
async function runCase(spec: CaseSpec): Promise<CaseResult> {
  const base = { id: spec.id, group: spec.group, query: spec.query, metrics: null, error: null };
  const profile = getNotebookDepthProfile(DEPTH);
  const meta = spec.notebook;

  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    ...(meta.history ?? []),
    { role: 'user', content: spec.query },
  ];
  const incomingHistory = normalizeNotebookHistory(messages.slice(0, -1));
  let queries = [spec.query];
  const wantsRewrite = profile.queryRewrite && incomingHistory.length > 0;
  if (wantsRewrite || profile.queryVariants > 1) {
    const expanded = await expandQuery(
      spec.query,
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
  const rerankQuery = queries[0];
  const user = meta.user;

  try {
    const ctx = await notebookQAService.getSearchContext({
      question: spec.query,
      collectionId: meta.collectionId ?? user?.collectionId,
      ...(meta.collectionIds && { collectionIds: meta.collectionIds }),
      userId: 'SYSTEM',
      depth: DEPTH,
      queries,
      ...(user && {
        getCollectionFn: async (id: string) =>
          id === user.collectionId ? { name: user.name, user_id: 'SYSTEM' } : null,
        getDocumentIdsFn: async (id: string) => (id === user.collectionId ? user.documentIds : []),
      }),
    });
    if (!ctx || ctx.sortedResults.length === 0) {
      return { ...base, error: 'search returned no results' };
    }

    const denseSorted = ctx.sortedResults.map((r) => r.similarity).sort((a, b) => b - a);
    const denseTop = denseSorted[0] ?? 0;
    const denseMedian = median(denseSorted);

    const reranked = await rerankNotebookResults({
      results: ctx.sortedResults,
      referencesMap: ctx.referencesMap,
      question: rerankQuery,
      limit: profile.rerankOutput,
      inputLimit: profile.rerankInput,
    });
    const rerankSorted = reranked.results.map((r) => r.similarity).sort((a, b) => b - a);
    const rerankTop = rerankSorted[0] ?? 0;
    const rerankMedian = median(rerankSorted);
    const rerankTop3Mean =
      rerankSorted.slice(0, 3).reduce((sum, s) => sum + s, 0) / Math.min(3, rerankSorted.length);
    const aboveThresholdShare =
      rerankSorted.filter((s) => s >= PRODUCTION_MIN_RELEVANCE).length / rerankSorted.length;

    return {
      ...base,
      metrics: {
        candidates: ctx.sortedResults.length,
        denseTop,
        denseMedian,
        denseMargin: denseTop - denseMedian,
        rerankTop,
        rerankMedian,
        rerankMargin: rerankTop - rerankMedian,
        rerankTop3Mean,
        aboveThresholdShare,
        goldRank: spec.group === 'on-topic' ? firstMatchRank(reranked.results, spec.expect) : null,
      },
    };
  } catch (error) {
    return { ...base, error: (error as Error).message };
  }
}

const NUMERIC_SIGNALS = [
  'candidates',
  'denseTop',
  'denseMedian',
  'denseMargin',
  'rerankTop',
  'rerankMedian',
  'rerankMargin',
  'rerankTop3Mean',
  'aboveThresholdShare',
] as const;
type NumericSignal = (typeof NUMERIC_SIGNALS)[number];

function metricsOf(results: CaseResult[], group: Group): CaseMetrics[] {
  const out: CaseMetrics[] = [];
  for (const r of results) if (r.group === group && r.metrics) out.push(r.metrics);
  return out;
}

/**
 * `min(on-topic) − max(off-topic)` positive means on-topic strictly above
 * off-topic; the reverse (`min(off-topic) − max(on-topic)`) covers a signal
 * where off-topic ends up higher. Only one of the two can be positive.
 */
function separation(results: CaseResult[], signal: NumericSignal): string {
  const onVals = metricsOf(results, 'on-topic').map((m) => m[signal]);
  const offVals = metricsOf(results, 'off-topic').map((m) => m[signal]);
  if (onVals.length === 0 || offVals.length === 0) {
    return `${signal}: incomplete data — cannot compute separation`;
  }
  const onMin = Math.min(...onVals);
  const onMax = Math.max(...onVals);
  const offMin = Math.min(...offVals);
  const offMax = Math.max(...offVals);
  const onAboveOff = onMin - offMax;
  const offAboveOn = offMin - onMax;

  if (onAboveOff > 0) {
    return `${signal}: SEPARATES (on-topic > off-topic) — margin ${onAboveOff.toFixed(4)}, threshold ≈ ${((onMin + offMax) / 2).toFixed(4)} (midpoint of the boundary values)`;
  }
  if (offAboveOn > 0) {
    return `${signal}: SEPARATES (off-topic > on-topic) — margin ${offAboveOn.toFixed(4)}, threshold ≈ ${((offMin + onMax) / 2).toFixed(4)} (midpoint of the boundary values)`;
  }
  return `${signal}: does not separate — closest margin ${Math.max(onAboveOff, offAboveOn).toFixed(4)} (negative = overlapping ranges)`;
}

function fmt(n: number): string {
  return n.toFixed(4);
}

function toMarkdownTable(results: CaseResult[]): string {
  const header =
    '| id | group | candidates | denseTop | denseMedian | denseMargin | rerankTop | rerankMedian | rerankMargin | rerankTop3Mean | aboveThresholdShare | goldRank |\n' +
    '|---|---|---|---|---|---|---|---|---|---|---|---|';
  const rows = results.map((r) => {
    if (!r.metrics) return `| ${r.id} | ${r.group} | ERROR: ${r.error} | | | | | | | | | |`;
    const m = r.metrics;
    return (
      `| ${r.id} | ${r.group} | ${m.candidates} | ${fmt(m.denseTop)} | ${fmt(m.denseMedian)} | ${fmt(m.denseMargin)} | ` +
      `${fmt(m.rerankTop)} | ${fmt(m.rerankMedian)} | ${fmt(m.rerankMargin)} | ${fmt(m.rerankTop3Mean)} | ` +
      `${fmt(m.aboveThresholdShare)} | ${m.goldRank ?? '—'} |`
    );
  });
  return [header, ...rows].join('\n');
}

async function main() {
  console.log(
    `Running ${ALL_CASES.length} evidence-signal cases (depth=${DEPTH}) against ${process.env.QDRANT_URL || 'QDRANT_URL unset!'}`
  );

  const results: CaseResult[] = [];
  for (const spec of ALL_CASES) {
    const result = await runCase(spec);
    results.push(result);
    console.log(
      !result.metrics
        ? `  ✗ [${spec.group}] ${spec.id}: ERROR ${result.error}`
        : `  ✓ [${spec.group}] ${spec.id}: candidates=${result.metrics.candidates} denseTop=${fmt(result.metrics.denseTop)} rerankTop=${fmt(result.metrics.rerankTop)} goldRank=${result.metrics.goldRank ?? '—'}`
    );
  }

  const table = toMarkdownTable(results);
  console.log('\n── Evidence-signal table ──\n');
  console.log(table);

  console.log('\n── Separation (min(on-topic) − max(off-topic), or reverse) ──');
  const separationLines = NUMERIC_SIGNALS.map((signal) => separation(results, signal));
  for (const line of separationLines) console.log(line);

  const outDir = new URL('.', import.meta.url).pathname;
  const mdPath = `${outDir}evidence-signals-2026-09-02.md`;
  const jsonPath = `${outDir}evidence-signals-2026-09-02.json`;

  const mdContent =
    `# Evidence-signal calibration (refs #3140)\n\n` +
    `Depth \`${DEPTH}\`, live Qdrant + reranker, ${ALL_CASES.length} cases ` +
    `(${ON_TOPIC_CASES.length} on-topic, ${OFF_TOPIC_CASES.length} off-topic).\n\n` +
    `${table}\n\n## Separation\n\n${separationLines.map((l) => `- ${l}`).join('\n')}\n`;
  writeFileSync(mdPath, mdContent);
  writeFileSync(
    jsonPath,
    JSON.stringify({ depth: DEPTH, results, separation: separationLines }, null, 2)
  );
  console.log(`\nErgebnisse geschrieben: ${mdPath}\n${jsonPath}`);

  process.exit(0);
}

main().catch((error) => {
  console.error('Evidence-signal check failed:', error);
  process.exit(1);
});
