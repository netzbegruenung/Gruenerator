/**
 * Paired before/after comparison over two `runRetrievalEval.ts` `EVAL_OUT`
 * JSON files. Standalone by design — no dotenv, no service imports, no live
 * search calls, just the two output files given as argv.
 *
 *   pnpm --filter @gruenerator/api eval:retrieval:compare <off.json> <on.json>
 *
 * Replaces the ad-hoc `node -e` one-liner from the loop-rerank plan's Step 4:
 * that script never checked that both files cover the same case ids, so a
 * case present in only one of the two runs (a filtered re-run, a crash that
 * truncated `outcomes`, …) would silently drop out of `lost`/`won` instead of
 * failing the comparison. This script refuses to compare two files whose id
 * sets differ.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

interface Outcome {
  id: string;
  rank: number | null;
  searchTimeMs?: number;
}

interface EvalOut {
  outcomes: Outcome[];
}

function loadOutcomes(path: string): Outcome[] {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as EvalOut;
  return parsed.outcomes;
}

const HIT_KS = [1, 3, 5] as const;
const MRR_K = 10;

interface Metrics {
  hit: Record<number, number>;
  mrr: number;
}

function computeMetrics(outcomes: Outcome[]): Metrics {
  const n = outcomes.length;
  const hits = Object.fromEntries(HIT_KS.map((k) => [k, 0])) as Record<number, number>;
  let mrrSum = 0;
  for (const o of outcomes) {
    const rank = o.rank;
    if (rank === null) continue;
    for (const k of HIT_KS) if (rank <= k) hits[k]++;
    if (rank <= MRR_K) mrrSum += 1 / rank;
  }
  const pct = (x: number) => (100 * x) / Math.max(1, n);
  return {
    hit: Object.fromEntries(HIT_KS.map((k) => [k, pct(hits[k])])),
    mrr: mrrSum / Math.max(1, n),
  };
}

function formatMetrics(m: Metrics): string {
  return (
    HIT_KS.map((k) => `Hit@${k} ${m.hit[k].toFixed(1)}%`).join('  ') +
    `  MRR@${MRR_K} ${m.mrr.toFixed(3)}`
  );
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const sorted = xs.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? null;
}

export interface PairedCase {
  id: string;
  offRank: number | null;
  onRank: number | null;
}

export interface PairResult {
  paired: PairedCase[];
  /** Ids present in `on` but missing from `off`. */
  missingFromOff: string[];
  /** Ids present in `off` but missing from `on`. */
  missingFromOn: string[];
}

/** Pure pairing/assert core, kept separate from file I/O and printing. */
export function pairOutcomes(off: Outcome[], on: Outcome[]): PairResult {
  const offById = new Map(off.map((o) => [o.id, o]));
  const onById = new Map(on.map((o) => [o.id, o]));
  const missingFromOn = off.filter((o) => !onById.has(o.id)).map((o) => o.id);
  const missingFromOff = on.filter((o) => !offById.has(o.id)).map((o) => o.id);
  const paired: PairedCase[] = off
    .filter((o) => onById.has(o.id))
    .map((o) => ({ id: o.id, offRank: o.rank, onRank: onById.get(o.id)?.rank ?? null }));
  return { paired, missingFromOff, missingFromOn };
}

/** `null` (miss) sorts worse than any real rank, mirroring the runner's own convention. */
const rankOrMiss = (x: number | null): number => (x === null ? 99 : x);

function main(): void {
  const [, , offPath, onPath] = process.argv;
  if (!offPath || !onPath) {
    console.error('Usage: eval:retrieval:compare <off.json> <on.json>');
    process.exit(1);
  }

  const off = loadOutcomes(offPath);
  const on = loadOutcomes(onPath);
  const { paired, missingFromOff, missingFromOn } = pairOutcomes(off, on);

  if (missingFromOff.length > 0 || missingFromOn.length > 0) {
    console.error('Case id sets differ between the two files — refusing to compare.');
    if (missingFromOn.length > 0) {
      console.error(`  present in "off", missing from "on": ${missingFromOn.join(', ')}`);
    }
    if (missingFromOff.length > 0) {
      console.error(`  present in "on", missing from "off": ${missingFromOff.join(', ')}`);
    }
    process.exit(1);
  }

  console.log(`n = ${paired.length}`);

  console.log('\n── Per-case rank changes ──');
  for (const p of paired) {
    const offLabel = p.offRank === null ? 'miss' : `rank ${p.offRank}`;
    const onLabel = p.onRank === null ? 'miss' : `rank ${p.onRank}`;
    const delta = rankOrMiss(p.onRank) - rankOrMiss(p.offRank);
    const marker = delta > 0 ? '↓' : delta < 0 ? '↑' : '=';
    console.log(`  ${marker} ${p.id}: ${offLabel} → ${onLabel}`);
  }

  const lostAt1 = paired.filter((p) => p.offRank === 1 && p.onRank !== 1).map((p) => p.id);
  const gainedAt1 = paired.filter((p) => p.offRank !== 1 && p.onRank === 1).map((p) => p.id);
  const lostAt3 = paired
    .filter((p) => rankOrMiss(p.offRank) <= 3 && rankOrMiss(p.onRank) > 3)
    .map((p) => p.id);
  const gainedAt3 = paired
    .filter((p) => rankOrMiss(p.offRank) > 3 && rankOrMiss(p.onRank) <= 3)
    .map((p) => p.id);

  console.log('\n── Rank-1 / rank-≤3 shifts ──');
  console.log(`lost rank 1    (${lostAt1.length}): ${lostAt1.join(', ') || 'none'}`);
  console.log(`gained rank 1  (${gainedAt1.length}): ${gainedAt1.join(', ') || 'none'}`);
  console.log(`lost rank ≤3   (${lostAt3.length}): ${lostAt3.join(', ') || 'none'}`);
  console.log(`gained rank ≤3 (${gainedAt3.length}): ${gainedAt3.join(', ') || 'none'}`);

  console.log('\n── Metrics ──');
  console.log(`off:  ${formatMetrics(computeMetrics(off))}`);
  console.log(`on:   ${formatMetrics(computeMetrics(on))}`);

  const offTimes = off.map((o) => o.searchTimeMs).filter((t): t is number => typeof t === 'number');
  const onTimes = on.map((o) => o.searchTimeMs).filter((t): t is number => typeof t === 'number');
  const offMedian = median(offTimes);
  const onMedian = median(onTimes);
  console.log('\n── Search wall clock ──');
  console.log(
    `median searchTimeMs  off: ${offMedian ?? 'n/a'} ms   on: ${onMedian ?? 'n/a'} ms   ` +
      `delta: ${offMedian !== null && onMedian !== null ? onMedian - offMedian : 'n/a'} ms`
  );
}

// Only run when invoked directly — `pairOutcomes` is exported for
// `compareOutcomes.vitest.ts`, which must not trigger a CLI run on import.
if (process.argv[1] && import.meta.url.endsWith(basename(process.argv[1]))) {
  main();
}
