/**
 * Chat eval runner — the live E2E tier. Runs each corpus SCENARIO (1..N turns)
 * against a real chat backend over SSE, threads threadId + wire history across
 * turns, answers clarification interrupts via /resume, parses each stream into
 * a structured trace, runs the deterministic assertions, prints a scorecard and
 * diffs against a saved baseline so regressions surface as red deltas.
 *
 *   pnpm --filter @gruenerator/api eval:chat
 *
 * Env:
 *   EVAL_BASE_URL   backend base (default http://localhost:3001)
 *   EVAL_BYPASS_TOKEN  x-dev-auth-bypass token (required unless the backend is open)
 *   EVAL_MODEL_ID   force a model lane for every case (e.g. 'mistral' / 'gemma-4')
 *   EVAL_FILTER     only run cases whose id/category contains this substring
 *   EVAL_SLOW=1     include scenarios tagged `slow` (golden long threads)
 *   EVAL_CONCURRENCY  scenarios to run in parallel (default 1; turns stay serial)
 *   EVAL_BASELINE   baseline JSON path (default ./evals/baseline.json)
 *   EVAL_UPDATE_BASELINE=1  overwrite the baseline with this run's results
 *   EVAL_RECORD_DIR record each turn's raw SSE body to <dir>/<id>.t<n>.sse
 *                   (Playwright fixture source)
 *
 * Deterministic assertions only — no model calls here. The LLM-judge pass
 * (eval:judge) consumes the enriched last-run.json this writes.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runAssertions } from './assertions.js';
import { buildFillerHistory } from './fixtures/fillerTurns.js';
import { parseSseEvents, buildTrace } from './parseTrace.js';
import {
  type CaseResult,
  type ChatTrace,
  type EvalCase,
  type EvalScenario,
  type EvalTurn,
  type ScenarioContext,
  type TurnResult,
} from './types.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.EVAL_BASE_URL ?? 'http://localhost:3001';
const BYPASS = process.env.EVAL_BYPASS_TOKEN ?? '';
const MODEL_ID = process.env.EVAL_MODEL_ID;
const FILTER = process.env.EVAL_FILTER ?? '';
const SLOW = process.env.EVAL_SLOW === '1';
const CONCURRENCY = (() => {
  const n = Number.parseInt(process.env.EVAL_CONCURRENCY ?? '', 10);
  return Number.isInteger(n) && n >= 1 ? n : 1;
})();
const BASELINE_PATH = process.env.EVAL_BASELINE ?? join(HERE, 'baseline.json');
const RECORD_DIR = process.env.EVAL_RECORD_DIR ?? '';

/** Vercel UIMessage wire shape (the backend reads `parts`, not `content`). */
interface WireMessage {
  id: string;
  role: 'user' | 'assistant';
  parts: { type: 'text'; text: string }[];
}

function wireMessage(id: string, role: 'user' | 'assistant', text: string): WireMessage {
  return { id, role, parts: [{ type: 'text', text }] };
}

function isScenario(line: EvalCase | EvalScenario): line is EvalScenario {
  return Array.isArray((line as EvalScenario).turns);
}

function normalize(line: EvalCase | EvalScenario): EvalScenario {
  if (isScenario(line)) return line;
  return {
    id: line.id,
    category: line.category,
    ...(line.modelId ? { modelId: line.modelId } : {}),
    ...(line.knownFailure ? { knownFailure: true } : {}),
    turns: [{ prompt: line.prompt, expect: line.expect ?? {} }],
  };
}

function loadCorpus(): EvalScenario[] {
  // Glob evals/corpus/*.jsonl plus the legacy single-file corpus.
  const files: string[] = [];
  const legacy = join(HERE, 'chat-corpus.jsonl');
  if (existsSync(legacy)) files.push(legacy);
  const corpusDir = join(HERE, 'corpus');
  if (existsSync(corpusDir)) {
    for (const f of readdirSync(corpusDir).sort()) {
      if (f.endsWith('.jsonl')) files.push(join(corpusDir, f));
    }
  }

  const scenarios: EvalScenario[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    for (const l of readFileSync(file, 'utf8').split('\n')) {
      const line = l.trim();
      if (!line) continue;
      const scenario = normalize(JSON.parse(line) as EvalCase | EvalScenario);
      if (seen.has(scenario.id)) {
        throw new Error(`Duplicate scenario id "${scenario.id}" (${file})`);
      }
      seen.add(scenario.id);
      scenarios.push(scenario);
    }
  }

  return scenarios.filter((s) => {
    if (s.slow && !SLOW) return false;
    if (s.mcpLane && process.env.EVAL_MCP !== '1') return false;
    if (!FILTER) return true;
    // Comma-separated OR match on id or category substrings.
    return FILTER.split(',')
      .map((f) => f.trim())
      .filter(Boolean)
      .some((f) => s.id.includes(f) || s.category.includes(f));
  });
}

async function postSse(
  path: string,
  body: Record<string, unknown>
): Promise<{ rawBody: string; networkError: string | null }> {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(BYPASS ? { 'x-dev-auth-bypass': BYPASS } : {}),
      },
      body: JSON.stringify(body),
    });
    const rawBody = await res.text();
    return { rawBody, networkError: res.ok ? null : `HTTP ${res.status}` };
  } catch (err) {
    return { rawBody: '', networkError: err instanceof Error ? err.message : String(err) };
  }
}

function record(scenarioId: string, turnIdx: number, suffix: string, rawBody: string): void {
  if (!RECORD_DIR || !rawBody) return;
  mkdirSync(RECORD_DIR, { recursive: true });
  writeFileSync(join(RECORD_DIR, `${scenarioId}.t${turnIdx}${suffix}.sse`), rawBody);
}

interface TurnCtx {
  threadId: string | null;
  history: WireMessage[];
}

async function runTurn(
  scenario: EvalScenario,
  turn: EvalTurn,
  turnIdx: number,
  ctx: TurnCtx,
  scenarioCtx: ScenarioContext
): Promise<TurnResult> {
  const started = Date.now();

  // Long-thread breadth probe: pad the wire history with synthetic filler pairs.
  const padded: WireMessage[] = [];
  if (turn.padTurns && turn.padTurns > 0) {
    buildFillerHistory(turn.padTurns).forEach((pair, i) => {
      padded.push(wireMessage(`eval-${scenario.id}-pad${i}-u`, 'user', pair.user));
      padded.push(wireMessage(`eval-${scenario.id}-pad${i}-a`, 'assistant', pair.assistant));
    });
  }

  const userMessage = wireMessage(`eval-${scenario.id}-t${turnIdx}`, 'user', turn.prompt);
  const messages = [...padded, ...ctx.history, userMessage];
  const modelId = scenario.modelId ?? MODEL_ID;
  // Mimic the client's "Im Chat bearbeiten" toggle: target the variant created
  // earlier in the scenario so this turn hits the sharepic-edit branch.
  const v = scenarioCtx.lastSharepicVariant;
  const currentSharepic =
    turn.useCreatedSharepic && v && typeof v.id === 'string'
      ? {
          variantId: v.id,
          ...(typeof v.canvasId === 'string' ? { canvasId: v.canvasId } : {}),
          canvasType: typeof v.canvasType === 'string' ? v.canvasType : 'sharepic',
        }
      : null;
  const body = {
    messages,
    ...(modelId ? { modelId } : {}),
    ...(ctx.threadId ? { threadId: ctx.threadId } : {}),
    ...(currentSharepic ? { currentSharepic } : {}),
  };

  const { rawBody, networkError } = await postSse('/api/chat-graph/stream', body);
  record(scenario.id, turnIdx, '', rawBody);
  let events = parseSseEvents(rawBody);
  let resumeError: string | null = null;

  // Clarification interrupt: answer via /resume and merge both streams into one
  // trace, so assertions see the full turn (mention-inheritance-across-
  // clarification is a single assertable unit).
  const interrupted = events.some(
    (e) => e.event === 'interrupt' && e.data.interruptType === 'clarification'
  );
  if (interrupted && turn.onInterrupt) {
    const threadId =
      ctx.threadId ??
      (events.find((e) => typeof e.data.threadId === 'string')?.data.threadId as
        | string
        | undefined);
    if (!threadId) {
      resumeError = 'clarification interrupt but no threadId to resume with';
    } else {
      const resume = await postSse('/api/chat-graph/resume', {
        threadId,
        resume: turn.onInterrupt.resume,
      });
      record(scenario.id, turnIdx, '.resume', resume.rawBody);
      if (resume.networkError) resumeError = `resume: ${resume.networkError}`;
      events = [...events, ...parseSseEvents(resume.rawBody)];
    }
  }

  const latencyMs = Date.now() - started;
  const trace: ChatTrace = buildTrace(events, latencyMs);
  // On follow-up turns the backend only emits thread_created when it MINTS a
  // thread — silence means it accepted the one we sent. A re-mint therefore
  // shows up as a thread_created with a DIFFERENT id, which sameThread catches.
  if (trace.threadId == null && ctx.threadId) trace.threadId = ctx.threadId;
  if (networkError) trace.error = networkError;
  if (resumeError) trace.error = trace.error ?? resumeError;
  if (interrupted && !turn.onInterrupt) {
    // An unanswered clarification is a real finding: the backend asked a
    // question the scenario didn't anticipate (over-asking regression).
    trace.error = trace.error ?? 'unexpected clarification interrupt';
  }

  const assertions = runAssertions(trace, turn.expect, scenarioCtx);

  // Thread the context forward.
  if (trace.threadId && !ctx.threadId) ctx.threadId = trace.threadId;
  ctx.history.push(userMessage);
  if (trace.fullText) {
    ctx.history.push(wireMessage(`eval-${scenario.id}-t${turnIdx}-a`, 'assistant', trace.fullText));
  }
  scenarioCtx.priorArtifactIds.push(...trace.artifactIds);
  if (trace.sharepicVariants.length > 0) {
    scenarioCtx.lastSharepicVariant = trace.sharepicVariants[0];
  }
  if (scenarioCtx.firstThreadId == null) scenarioCtx.firstThreadId = trace.threadId;

  return {
    turnIndex: turnIdx,
    prompt: turn.prompt,
    latencyMs,
    intent: trace.intent,
    agentic: trace.agentic,
    toolCalls: trace.toolCalls.map((t) => ({
      toolName: t.toolName,
      ok: t.ok,
      ...(t.summary ? { summary: t.summary } : {}),
    })),
    threadId: trace.threadId,
    warnings: trace.warnings,
    interrupts: trace.interrupts,
    artifactIds: trace.artifactIds,
    editorOps: trace.editorOps,
    sharepicUpdated: trace.sharepicUpdated,
    imageGenerated: trace.imageGenerated,
    citations: trace.citations,
    fullText: trace.fullText,
    error: trace.error,
    assertions,
    passed: assertions.every((a) => a.pass),
    ...(turn.expect.judge ? { judge: turn.expect.judge } : {}),
    ...(turn.expect.judgeFacts ? { judgeFacts: turn.expect.judgeFacts } : {}),
  };
}

async function runScenario(scenario: EvalScenario): Promise<CaseResult> {
  const ctx: TurnCtx = { threadId: null, history: [] };
  const scenarioCtx: ScenarioContext = {
    firstThreadId: null,
    priorArtifactIds: [],
    lastSharepicVariant: null,
  };
  const turns: TurnResult[] = [];

  for (const [i, turn] of scenario.turns.entries()) {
    const r = await runTurn(scenario, turn, i, ctx, scenarioCtx);
    turns.push(r);
    // A dead stream poisons every later turn — stop, keep what we have.
    if (r.error) break;
  }

  const first = turns[0];
  const allAssertions = turns.flatMap((t) => t.assertions);
  return {
    id: scenario.id,
    category: scenario.category,
    prompt: first?.prompt ?? scenario.turns[0]?.prompt ?? '',
    latencyMs: turns.reduce((s, t) => s + t.latencyMs, 0),
    intent: turns.at(-1)?.intent ?? null,
    agentic: turns.at(-1)?.agentic ?? false,
    toolNames: turns.flatMap((t) => t.toolCalls.map((c) => c.toolName)),
    error: turns.find((t) => t.error)?.error ?? null,
    assertions: allAssertions,
    passed: turns.length === scenario.turns.length && allAssertions.every((a) => a.pass),
    ...(scenario.knownFailure ? { knownFailure: true } : {}),
    turns,
  };
}

function pct(n: number, d: number): string {
  return d === 0 ? '—' : `${Math.round((100 * n) / d)}%`;
}

function loadBaseline(): Record<string, boolean> {
  return existsSync(BASELINE_PATH)
    ? (JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Record<string, boolean>)
    : {};
}

/** One scenario's scorecard line + failing-assertion detail. Printed live as
 *  each scenario finishes (so a long run shows failures immediately) and again
 *  in the sorted final report. */
function printScenarioLine(r: CaseResult, baseline: Record<string, boolean>): void {
  const known = r.knownFailure === true;
  const mark = r.passed ? '✅' : known ? '🟡' : '❌';
  const was = baseline[r.id];
  const delta =
    known || was === undefined
      ? ''
      : was && !r.passed
        ? '  ⬇ REGRESSION'
        : !was && r.passed
          ? '  ⬆ fixed'
          : '';
  const turnsLabel = r.turns.length > 1 ? ` turns=${r.turns.length}` : '';
  const meta = `intent=${r.intent ?? '-'}${r.agentic ? '/agentic' : ''}${turnsLabel} tools=[${r.toolNames.join(',')}] ${r.latencyMs}ms`;
  console.log(`${mark} ${r.id.padEnd(24)} ${meta}${delta}`);
  for (const t of r.turns) {
    for (const a of t.assertions.filter((x) => !x.pass)) {
      console.log(`      · t${t.turnIndex} ${a.name}: ${a.detail}`);
    }
    if (t.error) console.log(`      · t${t.turnIndex} stream: ${t.error}`);
  }
}

function report(results: CaseResult[]): void {
  const baseline = loadBaseline();

  console.log(`\n═══ Chat eval — ${results.length} scenarios against ${BASE_URL} ═══\n`);
  let regressions = 0;
  let newPasses = 0;
  for (const r of results) {
    const was = baseline[r.id];
    if (!r.knownFailure && was && !r.passed) regressions++;
    if (was === false && r.passed) newPasses++;
    printScenarioLine(r, baseline);
  }

  const scored = results.filter((r) => !r.knownFailure);
  const passed = scored.filter((r) => r.passed).length;
  const knownFailing = results.filter((r) => r.knownFailure && !r.passed).length;
  const knownFixed = results.filter((r) => r.knownFailure && r.passed);
  const allAssertions = scored.flatMap((r) => r.assertions);
  const assertPass = allAssertions.filter((a) => a.pass).length;

  // Per-category pass rate.
  const byCat = new Map<string, { p: number; n: number }>();
  for (const r of scored) {
    const c = byCat.get(r.category) ?? { p: 0, n: 0 };
    c.n++;
    if (r.passed) c.p++;
    byCat.set(r.category, c);
  }

  console.log(`\n─── Summary ───`);
  console.log(`Scenarios:  ${passed}/${scored.length} passed (${pct(passed, scored.length)})`);
  console.log(
    `Assertions: ${assertPass}/${allAssertions.length} passed (${pct(assertPass, allAssertions.length)})`
  );
  if (knownFailing > 0) console.log(`Known open: ${knownFailing} still failing (🟡, not scored)`);
  if (knownFixed.length > 0) {
    console.log(
      `Known open: ${knownFixed.length} now PASSING — drop knownFailure from: ${knownFixed.map((r) => r.id).join(', ')}`
    );
  }
  const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)] ?? 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? 0;
  console.log(`Latency:    p50 ${p50}ms · p95 ${p95}ms (per scenario, all turns)`);
  console.log(
    `Category:   ${[...byCat.entries()].map(([c, v]) => `${c} ${v.p}/${v.n}`).join(' · ')}`
  );
  if (regressions > 0) console.log(`\n⚠  ${regressions} REGRESSION(S) vs baseline`);
  if (newPasses > 0) console.log(`✔  ${newPasses} newly passing vs baseline`);

  if (process.env.EVAL_UPDATE_BASELINE === '1') {
    const next = Object.fromEntries(scored.map((r) => [r.id, r.passed]));
    writeFileSync(BASELINE_PATH, `${JSON.stringify(next, null, 2)}\n`);
    console.log(`\nBaseline updated → ${BASELINE_PATH}`);
  }

  // Persist the full run for the LLM judge (eval:judge) + debugging.
  writeFileSync(join(HERE, 'last-run.json'), `${JSON.stringify(results, null, 2)}\n`);

  if (regressions > 0 || passed < scored.length) process.exitCode = 1;
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

  // Bounded-concurrency worker pool. Turns within a scenario stay sequential
  // (they share a thread); scenarios run up to EVAL_CONCURRENCY at a time. Each
  // result is printed AS IT FINISHES (a long run shows failures immediately —
  // the mid-run blind spot the sequential runner had), then a sorted report.
  const liveBaseline = loadBaseline();
  const results: CaseResult[] = [];
  let cursor = 0;
  let done = 0;
  const total = corpus.length;
  console.log(`Running ${total} scenarios (concurrency=${CONCURRENCY})…\n`);

  async function worker(): Promise<void> {
    while (cursor < corpus.length) {
      const scenario = corpus[cursor++];
      const r = await runScenario(scenario);
      results.push(r);
      done++;
      process.stdout.write(`[${done}/${total}] `);
      printScenarioLine(r, liveBaseline);
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, () => worker()));

  // Stable order for the final report + last-run.json, independent of finish order.
  const order = new Map(corpus.map((s, i) => [s.id, i]));
  results.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  report(results);
}

void main();
