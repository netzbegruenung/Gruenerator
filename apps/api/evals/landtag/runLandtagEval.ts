/**
 * Eval der Landtags-Werkzeuge gegen eine laufende lokale API (Dev-Bypass).
 *
 *   cd apps/api && EVAL_API=http://localhost:3021 DEV_AUTH_BYPASS_TOKEN=… \
 *     npx tsx evals/landtag/runLandtagEval.ts [--only N1,B2] [--repeat 3] [--out ergebnis.json]
 *
 * Je Fall eine Zeile: PASS/FAIL, Werkzeugkette, zitierte Refs, Gründe. Geprüft wird
 * gegen `landtag-eval.json` (Wahrheit aus Qdrant und PARDOK, nicht aus dem Werkzeug):
 * - erwartete Aufrufe (Werkzeug, Argument-Teilmenge, Refs in `dokumente`),
 * - zitierte Drucksachen (Nummern im Antworttext und in den zitierten Quellen),
 * - Pflicht- und Verbotsmuster im Antworttext,
 * - „erfundene Ref": eine genannte Nummer, die in keinem Werkzeugergebnis stand,
 * - verbotene Aufrufe (`forbid_tools`, etwa ein Landtag für eine Person aus Österreich).
 *
 * `--repeat N` fragt jeden Fall N-mal: ein einzelnes PASS sagt bei einem Sprachmodell
 * wenig, die Quote je Fall ist die Zahl, die zählt.
 *
 * Jeder Fall legt einen Thread an; danach wandert er in den Papierkorb (`--keep-threads`
 * schaltet das ab). Sonst holt der nächste Lauf ihn über den proaktiven Recall
 * (`recallStage.ts`) als Kontext zurück, und die Läufe messen nicht mehr dasselbe.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

interface ToolExpectation {
  tool: string;
  args?: Record<string, unknown>;
  refs?: string[];
}

interface EvalCase {
  id: string;
  question: string;
  tools: ToolExpectation[];
  /** Darf nicht aufgerufen werden (Werkzeug + Argument-Teilmenge). */
  forbid_tools?: ToolExpectation[];
  /** Geht als `x-user-locale` mit; ohne gilt die API-Vorgabe de-DE. */
  locale?: 'de-DE' | 'de-AT';
  cites_min?: number;
  cites_from?: string[];
  cites_all?: string[];
  cites_both?: boolean;
  must_contain?: string[];
  must_not?: string[];
  no_refs?: boolean;
  truth: string;
}

interface EvalFile {
  global_must_not: string[];
  cases: EvalCase[];
}

interface Turn {
  calls: Array<{ tool: string; args: Record<string, unknown>; result?: Record<string, unknown> }>;
  resultText: string;
  answer: string;
  citations: Array<{ id: number; title?: string; url?: string }>;
  error: string | null;
  seconds: number;
  threadId?: string;
}

export interface CaseResult {
  id: string;
  pass: boolean;
  chain: string;
  cited: string[];
  failures: string[];
  /** „falsche Behauptung" oder „erfundene Ref": die Fehler, die nie durchgehen dürfen. */
  severe: boolean;
  seconds: number;
}

const here = dirname(fileURLToPath(import.meta.url));

/** „18/2141", „19/S27244", „20/0004" → „18/2141", „19/27244", „20/4". */
const DOC_NR = /(?<![\d/A-Z])(?:MM[PD])?(1[0-9]|20)\/S?0*(\d{1,6})(?![\d/])/g;
const normNr = (wp: string, nr: string) => `${wp}/${nr}`;

/** Protokoll-Links tragen die Nummer kodiert (`MMP18%2F129`). */
function decoded(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text.replace(/%2F/gi, '/');
  }
}

export function docNumbers(text: string): string[] {
  return [...new Set([...decoded(text).matchAll(DOC_NR)].map((m) => normNr(m[1]!, m[2]!)))];
}

function normRef(ref: string): string {
  return docNumbers(ref)[0] ?? ref;
}

/** Die Nummern der Quellen, auf die die Antwort verweist ([3], (quelle:3)), dazu wörtlich genannte. */
export function citedNumbers(turn: Pick<Turn, 'answer' | 'citations'>): string[] {
  const ids = new Set<number>();
  for (const m of turn.answer.matchAll(/quelle:(\d+)/g)) ids.add(Number(m[1]));
  for (const m of turn.answer.matchAll(/\[(\d+(?:\s*,\s*\d+)*)\]/g)) {
    for (const n of m[1]!.split(',')) ids.add(Number(n.trim()));
  }
  const fromCitations = turn.citations
    .filter((c) => ids.has(c.id))
    .flatMap((c) => docNumbers(`${c.title ?? ''} ${c.url ?? ''}`));
  return [...new Set([...docNumbers(turn.answer), ...fromCitations])];
}

function argsMatch(actual: Record<string, unknown>, want: Record<string, unknown>): boolean {
  return Object.entries(want).every(([k, v]) => actual[k] === v);
}

export function judge(c: EvalCase, turn: Turn, globalMustNot: readonly string[]): CaseResult {
  const failures: string[] = [];
  let severe = false;
  if (turn.error) failures.push(`Stream-Fehler: ${turn.error}`);

  for (const want of c.tools) {
    const hit = turn.calls.find(
      (call) =>
        call.tool === want.tool &&
        argsMatch(call.args, want.args ?? {}) &&
        (want.refs ?? []).every((r) =>
          ((call.args.dokumente as string[] | undefined) ?? []).map(normRef).includes(normRef(r))
        )
    );
    if (!hit) failures.push(`fehlender Aufruf ${want.tool} ${JSON.stringify(want.args ?? {})}`);
  }
  for (const no of c.forbid_tools ?? []) {
    if (turn.calls.some((call) => call.tool === no.tool && argsMatch(call.args, no.args ?? {}))) {
      failures.push(`verbotener Aufruf ${no.tool} ${JSON.stringify(no.args ?? {})}`);
    }
  }

  const cited = citedNumbers(turn);
  // Bekannt ist, was ein Werkzeug geliefert hat: die Ergebnisse im Stream (dort ist
  // `sources` gekürzt) und die Quellenliste, die der Server registriert hat.
  const known = new Set([
    ...docNumbers(turn.resultText),
    ...turn.citations.flatMap((c) => docNumbers(`${c.title ?? ''} ${c.url ?? ''}`)),
  ]);
  // Nummern aus der Frage selbst gelten als bekannt.
  for (const n of docNumbers(c.question)) known.add(n);
  const invented = cited.filter((n) => !known.has(n));
  if (invented.length > 0) {
    failures.push(`erfundene Ref: ${invented.join(', ')}`);
    severe = true;
  }
  if (c.no_refs && cited.length > 0)
    failures.push(`Refs genannt, obwohl keine passen: ${cited.join(', ')}`);
  if (c.cites_all) {
    const missing = c.cites_all.map(normRef).filter((r) => !cited.includes(r));
    if (missing.length > 0) failures.push(`nicht zitiert: ${missing.join(', ')}`);
  }
  if (c.cites_min != null) {
    const pool = new Set((c.cites_from ?? []).map(normRef));
    const relevant = pool.size > 0 ? cited.filter((n) => pool.has(n)) : cited;
    if (relevant.length < c.cites_min) {
      failures.push(`zu wenig Treffer zitiert: ${relevant.length} < ${c.cites_min}`);
    }
    if (c.cites_both) {
      const be = relevant.some((n) => /^(19|20)\//.test(n));
      const nw = relevant.some((n) => n.startsWith('18/'));
      if (!be || !nw) failures.push('nicht beide Parlamente zitiert');
    }
  }
  for (const re of c.must_contain ?? []) {
    if (!new RegExp(re, 'u').test(turn.answer)) failures.push(`fehlt: /${re}/`);
  }
  for (const re of [...(c.must_not ?? []), ...globalMustNot]) {
    if (new RegExp(re, 'iu').test(turn.answer)) {
      failures.push(`falsche Behauptung: /${re}/`);
      severe = true;
    }
  }
  const chain = turn.calls
    .map((call) => {
      const p = call.args.parlament ?? call.args.quelle ?? call.args.collection;
      return p ? `${call.tool}(${String(p)})` : call.tool;
    })
    .join(' → ');
  return {
    id: c.id,
    pass: failures.length === 0,
    chain: chain || '—',
    cited,
    failures,
    severe,
    seconds: turn.seconds,
  };
}

async function ask(
  api: string,
  token: string,
  question: string,
  locale: EvalCase['locale']
): Promise<Turn> {
  const started = Date.now();
  const res = await fetch(`${api}/api/chat-graph/stream`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost:3000',
      'x-dev-auth-bypass': token,
      ...(locale ? { 'x-user-locale': locale } : {}),
    },
    body: JSON.stringify({
      messages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: question }] }],
    }),
    signal: AbortSignal.timeout(300_000),
  });
  const raw = await res.text();
  const turn: Turn = {
    calls: [],
    resultText: '',
    answer: '',
    citations: [],
    error: null,
    seconds: 0,
  };
  let event = '';
  for (const line of raw.split('\n')) {
    if (line.startsWith('event: ')) {
      event = line.slice(7).trim();
      continue;
    }
    if (!line.startsWith('data: ')) continue;
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(line.slice(6)) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (event === 'thread_created') {
      turn.threadId = String(data.threadId);
    } else if (event === 'tool_step_start') {
      turn.calls.push({
        tool: String(data.toolName),
        args: (data.args as Record<string, unknown>) ?? {},
      });
    } else if (event === 'tool_step_result') {
      turn.resultText += `\n${JSON.stringify(data.result ?? '')}`;
      // Für die Diagnose: was das Werkzeug ausser der Liste sagte.
      const r = (data.result ?? {}) as Record<string, unknown>;
      const call = turn.calls[turn.calls.length - 1];
      if (call) {
        call.result = Object.fromEntries(
          ['resultCount', 'gesamt', 'error', 'hinweise', 'fuerSchreiber'].flatMap((k) =>
            r[k] !== undefined ? [[k, r[k]]] : []
          )
        );
      }
    } else if (event === 'text_delta') {
      turn.answer += String(data.delta ?? data.text ?? '');
    } else if (event === 'completion' && typeof data.text === 'string') {
      // Der Server ersetzt den gestreamten Text, wenn er nachträglich korrigiert
      // (Zitate ausserhalb des Bereichs, `source:` → `quelle:`, #5315) — der
      // Client zeigt dann diesen Text, also wird auch dieser bewertet.
      turn.answer = data.text;
    } else if (event === 'done') {
      turn.citations = (data.citations as Turn['citations']) ?? [];
    } else if (event === 'error') {
      turn.error = String(data.error ?? 'unbekannt');
    }
  }
  turn.seconds = Math.round((Date.now() - started) / 1000);
  return turn;
}

async function trashThread(api: string, token: string, threadId: string): Promise<void> {
  await fetch(`${api}/api/chat-service/threads?threadId=${encodeURIComponent(threadId)}`, {
    method: 'DELETE',
    headers: { origin: 'http://localhost:3000', 'x-dev-auth-bypass': token },
  }).catch(() => undefined);
}

async function main(): Promise<void> {
  const api = process.env.EVAL_API ?? 'http://localhost:3021';
  const token = process.env.DEV_AUTH_BYPASS_TOKEN;
  if (!token) throw new Error('DEV_AUTH_BYPASS_TOKEN fehlt');
  const argv = process.argv.slice(2);
  const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1]!.split(',') : null;
  const out = argv.includes('--out') ? argv[argv.indexOf('--out') + 1]! : null;
  const repeat = argv.includes('--repeat') ? Number(argv[argv.indexOf('--repeat') + 1]) : 1;
  const concurrency = Number(process.env.EVAL_CONCURRENCY ?? 3);

  const file = JSON.parse(readFileSync(join(here, 'landtag-eval.json'), 'utf8')) as EvalFile;
  const cases = file.cases.filter((c) => !only || only.includes(c.id));
  const jobs = cases.flatMap((c) => Array.from({ length: repeat }, () => c));
  const runs: Array<{ result: CaseResult; answer: string; calls: Turn['calls'] }> = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
      while (next < jobs.length) {
        const i = next++;
        const c = jobs[i]!;
        const turn = await ask(api, token, c.question, c.locale).catch((e: unknown): Turn => ({
          calls: [],
          resultText: '',
          answer: '',
          citations: [],
          error: String(e),
          seconds: 0,
        }));
        runs[i] = {
          result: judge(c, turn, file.global_must_not),
          answer: turn.answer,
          calls: turn.calls,
        };
        if (turn.threadId && !argv.includes('--keep-threads')) {
          await trashThread(api, token, turn.threadId);
        }
      }
    })
  );
  const summaries = summarize(runs.map((r) => r.result));
  for (const s of summaries) console.log(s.line);
  const passed = summaries.filter((s) => s.passRuns === s.runs).length;
  const severe = runs.filter((r) => r.result.severe).length;
  console.log(
    `\n${passed}/${summaries.length} Fälle in allen ${repeat} Läufen PASS, ${severe} schwere Läufe (falsche Behauptung / erfundene Ref)`
  );
  if (out) writeFileSync(out, JSON.stringify({ runs }, null, 2));
}

/** Je Fall eine Zeile: Quote, schwere Läufe, Ketten und die Gründe der Fehlläufe. */
export function summarize(
  results: readonly CaseResult[]
): Array<{ id: string; runs: number; passRuns: number; line: string }> {
  const byId = new Map<string, CaseResult[]>();
  for (const r of results) byId.set(r.id, [...(byId.get(r.id) ?? []), r]);
  return [...byId].map(([id, rs]) => {
    const passRuns = rs.filter((r) => r.pass).length;
    const severe = rs.filter((r) => r.severe).length;
    const status = passRuns === rs.length ? 'PASS' : severe > 0 ? 'FAIL!' : 'FAIL';
    const chains = [...new Set(rs.map((r) => r.chain))].join(' | ');
    const why = [...new Set(rs.flatMap((r) => r.failures))].join('; ');
    const seconds = Math.round(rs.reduce((a, r) => a + r.seconds, 0) / rs.length);
    return {
      id,
      runs: rs.length,
      passRuns,
      line: `${id.padEnd(4)} ${status.padEnd(5)} ${passRuns}/${rs.length} ${String(seconds).padStart(3)}s  ${chains}  [${[...new Set(rs.flatMap((r) => r.cited))].join(', ')}]${why ? `  — ${why}` : ''}`,
    };
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
