/**
 * Evidence-weak signal calibration (refs #3140), 2nd round: 30 deciding cases.
 *
 *   pnpm --filter @gruenerator/api eval:retrieval:evidence
 *
 * Round 1 (15 cases, `evidence-signals-2026-09-02.md`) found that the
 * reranker's absolute top score does NOT separate on-topic notebook questions
 * from off-topic ones, and that the dense top score BEFORE the rerank does
 * (margin 0.0664). 13 on-topic cases mean a single outlier can carry the whole
 * margin, so this round widens both groups and adds a third, `near-topic`,
 * that is REPORTED but never decides anything.
 *
 * Each case runs `getSearchContext` → `rerankNotebookResults` exactly as
 * `notebookStreamCore.ts` does, depth `deep`. `denseTop` comes from the
 * production function `evidenceTopOf` — not a second copy of the formula,
 * which would drift apart at the first field change.
 *
 * Trap from #3140: `rerankPipeline`'s catch branch returns a synthetic
 * `scores` map with `failed: true`. Not a concern here — `rerankNotebookResults`
 * only rewrites `similarity` when `!failed`, so a failed call just leaves the
 * dense score in place (rerankTop == denseTop), visible in the table.
 *
 * READ-ONLY against live Qdrant and the live reranker. No writes, ever.
 */
import { writeFileSync } from 'node:fs';

import dotenv from 'dotenv';

// Load .env BEFORE the app modules — see runRetrievalEval.ts for why.
dotenv.config();

// Read-only eval: skip collection/index reconciliation on connect (#3167).
const { useQdrantConnectOnly } = await import('../../database/services/QdrantService/index.js');
useQdrantConnectOnly();

const { getNotebookDepthProfile } = await import('../../config/notebookDepthProfiles.js');
const { notebookQAService, evidenceTopOf } =
  await import('../../services/notebook/NotebookQAService.js');
const { env } = await import('../../config/env.js');
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

type Group = 'on-topic' | 'off-topic' | 'near-topic';

interface CaseSpec {
  id: string;
  group: Group;
  query: string;
  notebook: NotebookCaseMeta;
  expect?: RetrievalExpectation[];
}

/**
 * Die beiden synthetischen Nutzer-Notebooks, wortgleich aus `cases.ts`
 * (`notebook-user-ausschreibungen`, `notebook-user-haushaltsplan`) übernommen,
 * damit off-topic und on-topic denselben Bestand sehen.
 */
const USER_PRUEFUNGSBERICHT: NonNullable<NotebookCaseMeta['user']> = {
  collectionId: '00000000-0000-4000-8000-0000000000a1',
  name: 'Prüfungsbericht Notebook',
  documentIds: ['bb3c2541-9cf4-4dd9-9b33-88720d7ac5c8', '8899154c-04c7-49da-8296-f5d1b8ee6d62'],
};
const USER_HAUSHALTSPLAN: NonNullable<NotebookCaseMeta['user']> = {
  collectionId: '00000000-0000-4000-8000-0000000000a2',
  name: 'Haushaltsplan Notebook',
  documentIds: ['bb3c2541-9cf4-4dd9-9b33-88720d7ac5c8', '8899154c-04c7-49da-8296-f5d1b8ee6d62'],
};

function inSystem(collectionId: string): NotebookCaseMeta {
  return { collectionId };
}
function inUserNotebook(user: NonNullable<NotebookCaseMeta['user']>): NotebookCaseMeta {
  return { collectionId: user.collectionId, user };
}
function spec(group: Group, id: string, query: string, notebook: NotebookCaseMeta): CaseSpec {
  return { id, group, query, notebook };
}

/**
 * 17 Fragen, deren Antwort in KEINER der Sammlungen steht.
 *
 * Die ersten sechs sind die Menge aus Runde 1 und bleiben wortgleich, damit die
 * beiden Läufe vergleichbar sind. #3140 zitierte nur vier davon wörtlich
 * (Sauerteigbrot, Fußball-WM 2014, Tesla Model 3, Mars); Carbonara und
 * Bitcoin-Mining waren Etiketten, nicht Zitate — deren Wortlaut stammt aus
 * Runde 1 und ist dort so vermerkt.
 *
 * Die elf neuen decken erstmals ALLE fünf Sammlungen ab. Die österreichische
 * Sammlung und die beiden Nutzer-Notebooks (11 bzw. 20 Kandidaten, die
 * kürzesten Listen der Messung) waren off-topic nie gemessen — und
 * `notebook-user-haushaltsplan` hatte in Runde 1 `denseTop` 1,0000, was bei so
 * wenig Text fast von selbst passiert.
 */
const OFF_TOPIC_CASES: CaseSpec[] = [
  spec(
    'off-topic',
    'offtopic-sauerteigbrot',
    'Wie backe ich Sauerteigbrot?',
    inSystem('berlin-system')
  ),
  spec(
    'off-topic',
    'offtopic-fussball-wm-2014',
    'Wer gewann die Fußball-WM 2014?',
    inSystem('berlin-system')
  ),
  spec(
    'off-topic',
    'offtopic-tesla-model-3',
    'Was kostet ein Tesla Model 3?',
    inSystem('berlin-system')
  ),
  spec(
    'off-topic',
    'offtopic-mars-distance',
    'Wie weit ist der Mars entfernt?',
    inSystem('bayern-system')
  ),
  spec(
    'off-topic',
    'offtopic-carbonara',
    'Wie kocht man Spaghetti Carbonara?',
    inSystem('bayern-system')
  ),
  spec(
    'off-topic',
    'offtopic-bitcoin-mining',
    'Wie funktioniert Bitcoin-Mining?',
    inSystem('bayern-system')
  ),
  // ── neu in Runde 2 ──
  spec(
    'off-topic',
    'offtopic-gitarre-drop-d',
    'Wie stimme ich eine Gitarre auf Drop D?',
    inSystem('berlin-system')
  ),
  spec(
    'off-topic',
    'offtopic-sternbilder-winter',
    'Welche Sternbilder sieht man am Winterhimmel?',
    inSystem('berlin-system')
  ),
  spec(
    'off-topic',
    'offtopic-weiches-ei',
    'Wie lange kocht ein weiches Ei?',
    inSystem('berlin-system')
  ),
  spec(
    'off-topic',
    'offtopic-dieselmotor',
    'Wie funktioniert ein Dieselmotor?',
    inSystem('bayern-system')
  ),
  spec(
    'off-topic',
    'offtopic-steppenwolf-autor',
    'Wer hat den Roman „Steppenwolf" geschrieben?',
    inSystem('bayern-system')
  ),
  spec(
    'off-topic',
    'offtopic-welpe-leine',
    'Wie gewöhne ich einen Welpen an die Leine?',
    inSystem('bayern-system')
  ),
  spec(
    'off-topic',
    'offtopic-bmi-berechnen',
    'Wie berechnet man den Body-Mass-Index?',
    inSystem('oesterreich-gruene-system')
  ),
  spec(
    'off-topic',
    'offtopic-http-https',
    'Was ist der Unterschied zwischen HTTP und HTTPS?',
    inSystem('oesterreich-gruene-system')
  ),
  spec(
    'off-topic',
    'offtopic-impfungen-thailand',
    'Welche Impfungen brauche ich für eine Thailandreise?',
    inUserNotebook(USER_PRUEFUNGSBERICHT)
  ),
  spec(
    'off-topic',
    'offtopic-apfelbaum-schnitt',
    'Wann schneidet man einen Apfelbaum im Winter?',
    inUserNotebook(USER_PRUEFUNGSBERICHT)
  ),
  spec(
    'off-topic',
    'offtopic-zeitumstellung',
    'Wann ist die Zeitumstellung auf Sommerzeit?',
    inUserNotebook(USER_HAUSHALTSPLAN)
  ),
];

/**
 * Politische Fragen IM Themenfeld der Sammlung, deren Antwort im Korpus
 * vermutlich nicht steht. Hier wird eine Schwelle in der Produktion falsch
 * liegen — und hier gibt es keine Wahrheit: ob die Sammlung sie beantwortet,
 * ist UNGEPRÜFT. Die Gruppe steht im Bericht, damit die Zahl beim nächsten Mal
 * jemand ansieht; in die Abnahmeregel geht sie NICHT.
 */
const NEAR_TOPIC_CASES: CaseSpec[] = [
  spec(
    'near-topic',
    'neartopic-bvg-monatsabo',
    'Was kostet ein BVG-Monatsabo?',
    inSystem('berlin-system')
  ),
  spec(
    'near-topic',
    'neartopic-abgeordnetenhauswahl',
    'Wann ist die nächste Wahl zum Berliner Abgeordnetenhaus?',
    inSystem('berlin-system')
  ),
  spec(
    'near-topic',
    'neartopic-muenchen-einwohner',
    'Wie viele Einwohner hat München?',
    inSystem('bayern-system')
  ),
  spec(
    'near-topic',
    'neartopic-landesvorsitz-bayern',
    'Wer hat den Landesvorsitz der bayerischen Grünen?',
    inSystem('bayern-system')
  ),
  spec(
    'near-topic',
    'neartopic-moor-foerdersumme',
    'Wie hoch war die Fördersumme für Moorrenaturierung 2024?',
    inSystem('bayern-system')
  ),
];

/**
 * Die vier `chat-notebook`-Fälle, deren Fragetext in KEINEM `notebook`-Fall
 * vorkommt — über ihr `collection`-Feld als Notebook-Fall gefahren. Die
 * übrigen sechs sind wörtliche Dubletten schon gemessener Fragen und blieben
 * draussen: sie würden die Streuung künstlich verengen.
 */
const EXTRA_ON_TOPIC_IDS = new Set([
  'chat-nb-berlin-verkehr',
  'chat-nb-berlin-baumfaellmoratorium',
  'chat-nb-bayern-artenvielfalt',
  'chat-nb-bayern-flaechenfrass',
]);

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
  } else if (c.kind === 'chat-notebook' && EXTRA_ON_TOPIC_IDS.has(c.id)) {
    ON_TOPIC_CASES.push({
      id: c.id,
      group: 'on-topic',
      query: c.query,
      notebook: { collectionId: c.collection },
      expect: c.expect,
    });
  }
}

const ALL_CASES: CaseSpec[] = [...ON_TOPIC_CASES, ...OFF_TOPIC_CASES, ...NEAR_TOPIC_CASES];

/**
 * Fail-fast: die Zahlen aus der Spec. Eine still geschrumpfte Fallmenge — ein
 * umbenannter Fall in `cases.ts`, ein vertippter Set-Eintrag — würde eine
 * schwächere Messung als 30-Fall-Runde ausgeben.
 */
const EXPECTED_COUNTS: Record<Group, number> = {
  'on-topic': 13,
  'off-topic': 17,
  'near-topic': 5,
};

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
  /** True if any candidate carried `dense_similarity` (BM25 server join). */
  joinPath: boolean;
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

    // Dasselbe Feld wie die Produktion, über dieselbe Funktion: `similarity`
    // allein ist auf einer server-seitig fusionierten Sammlung ein Fusionswert
    // und kein Kosinus (Vorgänger-PR, hybrid-dense-score-join).
    const denseSorted = ctx.sortedResults.map((r) => evidenceTopOf([r]) ?? 0).sort((a, b) => b - a);
    const denseTop = evidenceTopOf(ctx.sortedResults) ?? 0;
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
        joinPath: ctx.sortedResults.some((r) => r.dense_similarity != null),
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

interface DenseTopValue {
  id: string;
  value: number;
}

function denseTops(results: CaseResult[], group: Group): DenseTopValue[] {
  const out: DenseTopValue[] = [];
  for (const r of results)
    if (r.group === group && r.metrics) out.push({ id: r.id, value: r.metrics.denseTop });
  return out;
}

/**
 * Die zwei Zeilen, die die Abnahmeregel mechanisch machen.
 *
 * A1 verlangt den Abstand `min(on-topic) − max(off-topic)` MIT beiden
 * Randfall-IDs — „trennt" als Wort reicht nicht — und dass der ausgelieferte
 * Default echt dazwischen liegt.
 *
 * A3 ist die Auflösungsgrenze: bei 13 on-topic-Fällen kann ein einzelner
 * Ausreisser den Abstand allein tragen. Springt der Randfall nach dem
 * Entfernen des zweitniedrigsten Falls um mehr als 0,03, hängt die Aussage an
 * einem Fall und trägt keine Empfehlung, den Schalter anzuschalten.
 */
const A3_JUMP_LIMIT = 0.03;

function acceptanceLines(results: CaseResult[], threshold: number): string[] {
  const on = denseTops(results, 'on-topic').sort((a, b) => a.value - b.value);
  const off = denseTops(results, 'off-topic').sort((a, b) => b.value - a.value);
  if (on.length < 2 || off.length === 0) {
    return ['A1/A3 (denseTop): incomplete data — not enough successful cases'];
  }
  const margin = on[0].value - off[0].value;
  const between = threshold > off[0].value && threshold < on[0].value;
  const jump = on[1].value - on[0].value;
  return [
    `A1 (denseTop): min(on-topic) = ${fmt(on[0].value)} (${on[0].id}), ` +
      `max(off-topic) = ${fmt(off[0].value)} (${off[0].id}), margin ${fmt(margin)}`,
    `A1 (default ${threshold.toFixed(3)}): strictly between the two boundary values — ${between ? 'YES' : 'NO'}`,
    `A3 (resolution): second-lowest on-topic ${fmt(on[1].value)} (${on[1].id}), ` +
      `jump ${fmt(jump)} vs limit ${A3_JUMP_LIMIT.toFixed(2)} — ` +
      `${jump > A3_JUMP_LIMIT ? 'HANGS ON ONE CASE (carries no recommendation)' : 'resolved'}`,
    `near-topic (reported only, never decides): ` +
      (denseTops(results, 'near-topic').length === 0
        ? 'no successful cases'
        : denseTops(results, 'near-topic')
            .map((v) => `${v.id} ${fmt(v.value)}`)
            .join(', ')),
  ];
}

function fmt(n: number): string {
  return n.toFixed(4);
}

function toMarkdownTable(results: CaseResult[]): string {
  const header =
    '| id | group | candidates | denseTop | denseMedian | denseMargin | rerankTop | rerankMedian | rerankMargin | rerankTop3Mean | aboveThresholdShare | goldRank | path |\n' +
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|';
  const rows = results.map((r) => {
    if (!r.metrics) return `| ${r.id} | ${r.group} | ERROR: ${r.error} | | | | | | | | | | |`;
    const m = r.metrics;
    return (
      `| ${r.id} | ${r.group} | ${m.candidates} | ${fmt(m.denseTop)} | ${fmt(m.denseMedian)} | ${fmt(m.denseMargin)} | ` +
      `${fmt(m.rerankTop)} | ${fmt(m.rerankMedian)} | ${fmt(m.rerankMargin)} | ${fmt(m.rerankTop3Mean)} | ` +
      `${fmt(m.aboveThresholdShare)} | ${m.goldRank ?? '—'} | ${m.joinPath ? 'join' : 'legacy'} |`
    );
  });
  return [header, ...rows].join('\n');
}

async function main() {
  for (const group of Object.keys(EXPECTED_COUNTS) as Group[]) {
    const actual = ALL_CASES.filter((c) => c.group === group).length;
    if (actual !== EXPECTED_COUNTS[group]) {
      console.error(
        `Case-set drift: expected ${EXPECTED_COUNTS[group]} ${group} cases, got ${actual}`
      );
      process.exit(1);
    }
  }

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

  // The shipped default is calibrated on the legacy score domain; a join-path
  // case (raw cosine, ~0.33 lower) would need its own separation line.
  const joinCases = results.filter((r) => r.metrics?.joinPath).map((r) => r.id);
  const pathLine = joinCases.length
    ? `join-path cases (separate domain, split the separation per path): ${joinCases.join(', ')}`
    : 'join-path cases: none — every case scored on the legacy domain';
  console.log(pathLine);

  console.log('\n── Acceptance (A1 / A3) ──');
  const acceptance = acceptanceLines(results, env.NOTEBOOK_EVIDENCE_WEAK_THRESHOLD);
  for (const line of acceptance) console.log(line);

  const outDir = new URL('.', import.meta.url).pathname;
  // `-v2`, weil Runde 1 am selben Tag lief: A4 verlangt, dass die alte Datei
  // stehen bleibt — sonst ist der Vergleich weg.
  const stem = 'evidence-signals-2026-09-02-v2';
  const mdPath = `${outDir}${stem}.md`;
  const jsonPath = `${outDir}${stem}.json`;

  const mdContent =
    `# Evidence-signal calibration, round 2 (refs #3140)\n\n` +
    `Depth \`${DEPTH}\`, live Qdrant + reranker, ${ALL_CASES.length} cases ` +
    `(${ON_TOPIC_CASES.length} on-topic, ${OFF_TOPIC_CASES.length} off-topic — 30 deciding; ` +
    `${NEAR_TOPIC_CASES.length} near-topic, reported only).\n\n` +
    `\`denseTop\` is \`evidenceTopOf\` — the same function production runs.\n\n` +
    `${table}\n\n## Separation\n\n${separationLines.map((l) => `- ${l}`).join('\n')}\n\n` +
    `## Acceptance\n\n${acceptance.map((l) => `- ${l}`).join('\n')}\n- ${pathLine}\n`;
  writeFileSync(mdPath, mdContent);
  writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        depth: DEPTH,
        threshold: env.NOTEBOOK_EVIDENCE_WEAK_THRESHOLD,
        results,
        separation: separationLines,
        acceptance,
      },
      null,
      2
    )
  );
  console.log(`\nErgebnisse geschrieben: ${mdPath}\n${jsonPath}`);

  process.exit(0);
}

main().catch((error) => {
  console.error('Evidence-signal check failed:', error);
  process.exit(1);
});
