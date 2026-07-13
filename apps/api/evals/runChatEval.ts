/**
 * Chat eval runner — the missing E2E tier. Fires each corpus prompt at a real
 * chat backend over SSE, parses the stream into a structured trace, runs the
 * deterministic assertions, prints a scorecard and diffs against a saved
 * baseline so regressions surface as red deltas.
 *
 *   pnpm --filter @gruenerator/api eval:chat
 *
 * Env:
 *   EVAL_BASE_URL   backend base (default http://localhost:3001)
 *   EVAL_BYPASS_TOKEN  x-dev-auth-bypass token (required unless the backend is open)
 *   EVAL_MODEL_ID   force a model lane for every case (e.g. 'mistral' / 'gemma-4')
 *   EVAL_FILTER     only run cases whose id/category contains this substring
 *   EVAL_BASELINE   baseline JSON path (default ./evals/baseline.json)
 *   EVAL_UPDATE_BASELINE=1  overwrite the baseline with this run's results
 *
 * Deterministic assertions only — no model calls here. An LLM-judge pass over
 * groundedness/honesty is a follow-up that consumes the same trace JSON.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runAssertions } from './assertions.js';
import { parseTrace } from './parseTrace.js';
import { type CaseResult, type EvalCase } from './types.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.EVAL_BASE_URL ?? 'http://localhost:3001';
const BYPASS = process.env.EVAL_BYPASS_TOKEN ?? '';
const MODEL_ID = process.env.EVAL_MODEL_ID;
const FILTER = process.env.EVAL_FILTER ?? '';
const BASELINE_PATH = process.env.EVAL_BASELINE ?? join(HERE, 'baseline.json');

function loadCorpus(): EvalCase[] {
  const raw = readFileSync(join(HERE, 'chat-corpus.jsonl'), 'utf8');
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as EvalCase)
    .filter((c) => {
      if (!FILTER) return true;
      // Comma-separated OR match on id or category substrings.
      return FILTER.split(',')
        .map((f) => f.trim())
        .filter(Boolean)
        .some((f) => c.id.includes(f) || c.category.includes(f));
    });
}

async function runCase(c: EvalCase): Promise<CaseResult> {
  const started = Date.now();
  const body = {
    // Vercel UIMessage shape — the backend runs convertToModelMessages, which
    // reads `parts`, not `content`.
    messages: [{ id: `eval-${c.id}`, role: 'user', parts: [{ type: 'text', text: c.prompt }] }],
    ...((c.modelId ?? MODEL_ID) ? { modelId: c.modelId ?? MODEL_ID } : {}),
  };
  let rawBody = '';
  let networkError: string | null = null;
  try {
    const res = await fetch(`${BASE_URL}/api/chat-graph/stream`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(BYPASS ? { 'x-dev-auth-bypass': BYPASS } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok && res.status !== 200) networkError = `HTTP ${res.status}`;
    rawBody = await res.text();
  } catch (err) {
    networkError = err instanceof Error ? err.message : String(err);
  }
  const latencyMs = Date.now() - started;

  const trace = parseTrace(rawBody, latencyMs);
  if (networkError) trace.error = networkError;
  const assertions = runAssertions(trace, c.expect);

  return {
    id: c.id,
    category: c.category,
    prompt: c.prompt,
    latencyMs,
    intent: trace.intent,
    agentic: trace.agentic,
    toolNames: trace.toolCalls.map((t) => t.toolName),
    error: trace.error,
    assertions,
    passed: assertions.every((a) => a.pass),
  };
}

function pct(n: number, d: number): string {
  return d === 0 ? '—' : `${Math.round((100 * n) / d)}%`;
}

function report(results: CaseResult[]): void {
  const baseline: Record<string, boolean> = existsSync(BASELINE_PATH)
    ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
    : {};

  console.log(`\n═══ Chat eval — ${results.length} cases against ${BASE_URL} ═══\n`);
  let regressions = 0;
  let newPasses = 0;
  for (const r of results) {
    const mark = r.passed ? '✅' : '❌';
    const was = baseline[r.id];
    const delta =
      was === undefined
        ? ''
        : was && !r.passed
          ? '  ⬇ REGRESSION'
          : !was && r.passed
            ? '  ⬆ fixed'
            : '';
    if (was && !r.passed) regressions++;
    if (was === false && r.passed) newPasses++;
    const meta = `intent=${r.intent ?? '-'}${r.agentic ? '/agentic' : ''} tools=[${r.toolNames.join(',')}] ${r.latencyMs}ms`;
    console.log(`${mark} ${r.id.padEnd(24)} ${meta}${delta}`);
    for (const a of r.assertions.filter((x) => !x.pass)) {
      console.log(`      · ${a.name}: ${a.detail}`);
    }
  }

  const passed = results.filter((r) => r.passed).length;
  const allAssertions = results.flatMap((r) => r.assertions);
  const assertPass = allAssertions.filter((a) => a.pass).length;

  // Per-category pass rate.
  const byCat = new Map<string, { p: number; n: number }>();
  for (const r of results) {
    const c = byCat.get(r.category) ?? { p: 0, n: 0 };
    c.n++;
    if (r.passed) c.p++;
    byCat.set(r.category, c);
  }

  console.log(`\n─── Summary ───`);
  console.log(`Cases:      ${passed}/${results.length} passed (${pct(passed, results.length)})`);
  console.log(
    `Assertions: ${assertPass}/${allAssertions.length} passed (${pct(assertPass, allAssertions.length)})`
  );
  const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)] ?? 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? 0;
  console.log(`Latency:    p50 ${p50}ms · p95 ${p95}ms`);
  console.log(
    `Category:   ${[...byCat.entries()].map(([c, v]) => `${c} ${v.p}/${v.n}`).join(' · ')}`
  );
  if (regressions > 0) console.log(`\n⚠  ${regressions} REGRESSION(S) vs baseline`);
  if (newPasses > 0) console.log(`✔  ${newPasses} newly passing vs baseline`);

  if (process.env.EVAL_UPDATE_BASELINE === '1') {
    const next = Object.fromEntries(results.map((r) => [r.id, r.passed]));
    writeFileSync(BASELINE_PATH, `${JSON.stringify(next, null, 2)}\n`);
    console.log(`\nBaseline updated → ${BASELINE_PATH}`);
  }

  // Persist the full run for the LLM-judge follow-up + debugging.
  writeFileSync(join(HERE, 'last-run.json'), `${JSON.stringify(results, null, 2)}\n`);

  if (regressions > 0 || passed < results.length) process.exitCode = 1;
}

async function main(): Promise<void> {
  const corpus = loadCorpus();
  if (corpus.length === 0) {
    console.error('No cases matched EVAL_FILTER.');
    process.exit(1);
  }
  if (!BYPASS) {
    console.warn('⚠  EVAL_BYPASS_TOKEN not set — requests will likely 401.\n');
  }
  // Sequential: keep model/provider load realistic and logs readable.
  const results: CaseResult[] = [];
  for (const c of corpus) {
    process.stdout.write(`· ${c.id} …`);
    const r = await runCase(c);
    process.stdout.write(`\r`);
    results.push(r);
  }
  report(results);
}

void main();
