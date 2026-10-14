/**
 * Metis (GreenPT `/v1/systemone`) gegen den heutigen LLM-Resolver, je Spec.
 *
 *   pnpm eval:metis generation            # beide
 *   EVAL_BASELINE=0 pnpm eval:metis generation   # nur Metis (kein Provider-Setup nötig)
 *
 * Gemessen wird Treffer, Latenz und — der eigentliche Hebel — wie sich Trefferquote
 * und Abdeckung verhalten, wenn man Metis unter einer `confidence`-Schwelle auf
 * `null` (= weiter zum nächsten Tier) fallen lässt.
 */
import { systemOne, type MetisChoiceAnswer } from './metisClient.js';
import { SPECS, type ResolverCase } from './specs.js';

const CONF_STEPS = [0, 0.3, 0.5, 0.7, 0.85];

const pct = (n: number, d: number): string => (d ? `${((100 * n) / d).toFixed(0)}%` : '–');
const median = (xs: number[]): number =>
  [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;

interface Row {
  c: ResolverCase;
  metis?: { choice: string; confidence: number; ms: number };
  base?: { verdict: string | null; ms: number };
  err?: string;
}

async function main(): Promise<void> {
  const name = process.argv[2] ?? 'generation';
  const spec = SPECS[name];
  if (!spec)
    throw new Error(`Unbekannte Spec "${name}". Bekannt: ${Object.keys(SPECS).join(', ')}`);
  const withBaseline = process.env.EVAL_BASELINE !== '0';

  const rows: Row[] = [];
  for (const c of spec.cases) {
    const row: Row = { c };
    try {
      const t = Date.now();
      const r = await systemOne({ state: c.text, questions: { q: spec.question } });
      const a = r.answers.q as MetisChoiceAnswer;
      row.metis = { choice: a.choice, confidence: a.confidence, ms: Date.now() - t };
      if (withBaseline) {
        const b = Date.now();
        row.base = { verdict: await spec.baseline(c), ms: Date.now() - b };
      }
    } catch (e) {
      row.err = e instanceof Error ? e.message : String(e);
    }
    rows.push(row);
    const m = row.metis;
    const mark = (ok: boolean): string => (ok ? 'ok' : 'XX');
    console.log(
      `${row.err ? 'ERR' : mark(m!.choice === c.label)} ${c.id} want=${c.label.padEnd(19)} ` +
        `metis=${(m?.choice ?? '-').padEnd(19)} c=${m ? m.confidence.toFixed(2) : '-'} ${m?.ms ?? '-'}ms` +
        (withBaseline && row.base
          ? `  base=${String(row.base.verdict).padEnd(19)} ${row.base.ms}ms`
          : '') +
        `  | ${c.text.slice(0, 48)}${row.err ? ` [${row.err}]` : ''}`
    );
  }

  const done = rows.filter((r) => r.metis);
  console.log(`\n== ${spec.name}: ${done.length}/${rows.length} Fälle ausgewertet`);
  console.log(
    `Metis    Treffer ${pct(done.filter((r) => r.metis!.choice === r.c.label).length, done.length)}` +
      `  Median ${median(done.map((r) => r.metis!.ms))}ms`
  );
  if (withBaseline) {
    const b = done.filter((r) => r.base);
    const decided = b.filter((r) => r.base!.verdict !== null);
    console.log(
      `Baseline Treffer ${pct(decided.filter((r) => r.base!.verdict === r.c.label).length, b.length)}` +
        ` (null = ${b.length - decided.length})  Median ${median(b.map((r) => r.base!.ms))}ms`
    );
  }
  console.log('\nMetis mit confidence-Schwelle (darunter → null/weiter):');
  for (const t of CONF_STEPS) {
    const answered = done.filter((r) => r.metis!.confidence >= t);
    const hit = answered.filter((r) => r.metis!.choice === r.c.label).length;
    console.log(
      `  >= ${t.toFixed(2)}  Abdeckung ${pct(answered.length, done.length)}  Präzision ${pct(hit, answered.length)}`
    );
  }
  process.exitCode = done.length === rows.length ? 0 : 1;
}

void main();
