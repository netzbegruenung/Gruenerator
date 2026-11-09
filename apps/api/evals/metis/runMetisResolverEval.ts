/**
 * Entscheidungsmodelle (`/v1/systemone`: Metis bei GreenPT, Clef bei Melious)
 * gegen das heutige Verfahren, je Spec.
 *
 *   pnpm eval:metis generation
 *   EVAL_MODELS=metis,clef-flash EVAL_VARIANT=strict pnpm eval:metis sharepicFigureClaim
 *   EVAL_BASELINE=0 …        # ohne Baseline (kein Provider-Setup nötig)
 *   EVAL_ONLY=ho- …          # nur Fälle, deren id so beginnt
 *   EVAL_REPEAT=3 …          # jeden Fall mehrmals (Latenzstreuung)
 *
 * Die Modelle laufen je Fall gleichzeitig; „Wettlauf" ist die Antwort, die
 * zuerst da war — so verhielte sich ein Aufruf, der beide Anbieter anfragt
 * und den schnelleren nimmt. Vor dem Lauf je Modell ein Aufwärmaufruf.
 * Die Schwellentabelle zeigt Abdeckung und Präzision, wenn man unter einer
 * `confidence`-Schwelle auf `null` (= weiter zum nächsten Tier) fällt.
 */
import {
  isDecisionModel,
  systemOne,
  type DecisionModel,
  type MetisChoiceAnswer,
} from './metisClient.js';
import { questionFor, SPECS, type ResolverCase } from './specs.js';

const CONF_STEPS = [0, 0.3, 0.5, 0.7, 0.85];
const REPEAT = Number(process.env.EVAL_REPEAT ?? 1);

const pct = (n: number, d: number): string => (d ? `${((100 * n) / d).toFixed(0)}%` : '–');
const quantile = (xs: number[], q: number): number =>
  [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * q))] ?? 0;

interface Answer {
  choice: string;
  confidence: number;
  ms: number;
}
interface Row {
  c: ResolverCase;
  run: number;
  answers: Partial<Record<DecisionModel, Answer>>;
  errors: Partial<Record<DecisionModel, string>>;
  base?: { verdict: string | null; ms: number };
}

async function main(): Promise<void> {
  const name = process.argv[2] ?? 'generation';
  const spec = SPECS[name];
  if (!spec)
    throw new Error(`Unbekannte Spec "${name}". Bekannt: ${Object.keys(SPECS).join(', ')}`);
  const variantName = process.env.EVAL_VARIANT ?? Object.keys(spec.variants)[0]!;
  const variant = spec.variants[variantName];
  if (!variant)
    throw new Error(`Variante "${variantName}" fehlt. Bekannt: ${Object.keys(spec.variants)}`);
  const models = (process.env.EVAL_MODELS ?? 'metis,clef-flash').split(',').map((m) => m.trim());
  const bad = models.filter((m) => !isDecisionModel(m));
  if (bad.length) throw new Error(`Unbekannte Modelle: ${bad.join(', ')}`);
  const ms = models as DecisionModel[];
  const withBaseline = process.env.EVAL_BASELINE !== '0' && spec.baseline;

  const ask = async (model: DecisionModel, c: ResolverCase): Promise<Answer> => {
    const t = Date.now();
    const r = await systemOne({
      model,
      state: variant.state(c),
      questions: { q: questionFor(variant, c) },
    });
    const a = r.answers.q as MetisChoiceAnswer;
    return { choice: a.choice, confidence: a.confidence, ms: Date.now() - t };
  };
  await Promise.allSettled(ms.map((m) => ask(m, spec.cases[0]!)));

  console.log(`== ${spec.name} / ${variantName} / ${ms.join(', ')} / ${REPEAT}×\n`);
  const rows: Row[] = [];
  const only = process.env.EVAL_ONLY;
  const cases = only ? spec.cases.filter((c) => c.id.startsWith(only)) : spec.cases;
  for (let run = 0; run < REPEAT; run++) {
    for (const c of cases) {
      const row: Row = { c, run, answers: {}, errors: {} };
      const settled = await Promise.allSettled(ms.map((m) => ask(m, c)));
      settled.forEach((s, i) => {
        if (s.status === 'fulfilled') row.answers[ms[i]!] = s.value;
        else row.errors[ms[i]!] = String(s.reason instanceof Error ? s.reason.message : s.reason);
      });
      if (withBaseline && run === 0) {
        const b = Date.now();
        row.base = { verdict: await spec.baseline!(c), ms: Date.now() - b };
      }
      rows.push(row);
      const cells = ms.map((m) => {
        const a = row.answers[m];
        if (!a) return `${m}=ERR`;
        return `${a.choice === c.label ? 'ok' : 'XX'} ${m}=${a.choice}(${a.confidence.toFixed(2)},${a.ms}ms)`;
      });
      const base = row.base
        ? `  base=${row.base.verdict === c.label ? 'ok' : 'XX'} ${row.base.verdict}`
        : '';
      console.log(
        `${c.id.padEnd(9)} want=${c.label.padEnd(12)} ${cells.join('  ')}${base}  | ${c.text.slice(0, 44)}` +
          (Object.keys(row.errors).length ? ` [${Object.values(row.errors).join('; ')}]` : '')
      );
    }
  }

  console.log(`\n== Zusammenfassung (${rows.length} Anfragen je Modell)`);
  for (const m of ms) {
    const done = rows.filter((r) => r.answers[m]);
    const lat = done.map((r) => r.answers[m]!.ms);
    const hit = done.filter((r) => r.answers[m]!.choice === r.c.label).length;
    console.log(
      `${m.padEnd(11)} Treffer ${pct(hit, done.length).padStart(4)}  Fehler ${rows.length - done.length}` +
        `  p50 ${quantile(lat, 0.5)}ms  p90 ${quantile(lat, 0.9)}ms  max ${Math.max(...lat)}ms`
    );
  }
  if (ms.length > 1) {
    const raced = rows
      .map((r) => {
        const first = ms
          .map((m) => r.answers[m])
          .filter((a): a is Answer => !!a)
          .sort((a, b) => a.ms - b.ms)[0];
        return first && { ok: first.choice === r.c.label, ms: first.ms };
      })
      .filter((x): x is { ok: boolean; ms: number } => !!x);
    const lat = raced.map((r) => r.ms);
    console.log(
      `Wettlauf    Treffer ${pct(raced.filter((r) => r.ok).length, raced.length).padStart(4)}` +
        `  p50 ${quantile(lat, 0.5)}ms  p90 ${quantile(lat, 0.9)}ms  max ${Math.max(...lat)}ms`
    );
  }
  const based = rows.filter((r) => r.base);
  if (based.length) {
    const hit = based.filter((r) => r.base!.verdict === r.c.label).length;
    console.log(
      `Baseline    Treffer ${pct(hit, based.length).padStart(4)}` +
        `  (null = ${based.filter((r) => r.base!.verdict === null).length})` +
        `  p50 ${quantile(
          based.map((r) => r.base!.ms),
          0.5
        )}ms`
    );
  }

  for (const m of ms) {
    console.log(`\n${m} mit confidence-Schwelle (darunter → null/weiter):`);
    const done = rows.filter((r) => r.answers[m]);
    for (const t of CONF_STEPS) {
      const answered = done.filter((r) => r.answers[m]!.confidence >= t);
      const hit = answered.filter((r) => r.answers[m]!.choice === r.c.label).length;
      console.log(
        `  >= ${t.toFixed(2)}  Abdeckung ${pct(answered.length, done.length)}  Präzision ${pct(hit, answered.length)}`
      );
    }
  }
  process.exitCode = rows.every((r) => Object.keys(r.errors).length === 0) ? 0 : 1;
}

// Die Baselines laden App-Module mit offenen Verbindungen (Redis, Logger) —
// ohne ausdrückliches Ende bleibt der Prozess nach der Zusammenfassung hängen.
main().then(
  () => process.exit(process.exitCode ?? 0),
  (err: unknown) => {
    console.error(err);
    process.exit(1);
  }
);
