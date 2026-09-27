/**
 * Re-measures the energy coefficients in services/usage/energyFootprint.ts.
 *
 * GreenPT is the only provider we use that reports the environmental cost of an
 * inference. Because it serves several of the exact models we run elsewhere,
 * measuring it yields coefficients we can apply to those same models at Regolo,
 * verdigado and Scaleway — which report nothing.
 *
 *   pnpm --filter @gruenerator/api exec tsx scripts/probeGreenptImpact.ts
 *
 * Needs GREENPT_API_KEY. Costs a few thousand tokens. Re-run when GreenPT
 * changes hardware or when a lane switches to a different model, and paste the
 * fitted numbers into MODEL_ENERGY.
 *
 * The output-length sweep is the point: a single request cannot separate the
 * per-output-token cost from the per-input-token cost and the fixed overhead.
 * The long-prompt run isolates the input term, which is 100-760x smaller.
 */

const BASE = 'https://api.greenpt.ai/v1';
const KEY = process.env.GREENPT_API_KEY;

/** GreenPT model id -> the model id we record in user_usage_daily. */
const MODELS: readonly { greenpt: string; ours: string }[] = [
  { greenpt: 'mistral-medium-3.5-128b', ours: 'mistral-medium-2604' },
  // Welche Gewichte `gemma4` bei GreenPT trägt, ist unbelegt — die Zuordnung
  // hier ist eine Vermutung, `agents/providers.ts` vermutet die 26B. Über die
  // API nicht klärbar (14.08.2026): /v1/models nennt keine Parameterzahl, und
  // der Temperatur-0-Vergleich scheitert, weil sich das Denken dort nicht
  // abschalten lässt.
  { greenpt: 'gemma4', ours: 'gemma4-31b / verdigado-think (unbelegt)' },
  { greenpt: 'gpt-oss-120b', ours: 'gpt-oss-120b / verdigado-pro' },
  { greenpt: 'mistral-small-3.2-24b-instruct-2506', ours: 'mistral-small-latest' },
  { greenpt: 'qwen3.5-397b-a17b', ours: '(no equivalent lane — reference only)' },
];

const SHORT =
  'Erklaere in eigenen Worten, warum Photovoltaik auf Mehrfamilienhaeusern sinnvoll ist.';
const LONG = `Fasse den folgenden Text zusammen.\n\n${'Die Energiewende in Deutschland umfasst den Umbau der Stromversorgung, der Waermeversorgung und des Verkehrs auf erneuerbare Quellen. Zentrale Bausteine sind Windkraft an Land und auf See, Photovoltaik, Speichertechnologien, Netzausbau und Sektorenkopplung. '.repeat(60)}`;

const RUNS: readonly { label: string; prompt: string; maxTokens: number }[] = [
  { label: 'fix', prompt: SHORT, maxTokens: 8 },
  { label: 'kurz', prompt: SHORT, maxTokens: 60 },
  { label: 'mittel', prompt: SHORT, maxTokens: 400 },
  { label: 'lang', prompt: SHORT, maxTokens: 1200 },
  { label: 'langer-prompt', prompt: LONG, maxTokens: 120 },
];

interface Measurement {
  model: string;
  inputTokens: number;
  outputTokens: number;
  energyWms: number;
  emissionsUg: number;
}

async function measure(model: string, prompt: string, maxTokens: number): Promise<Measurement> {
  const response = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY ?? ''}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      // Identical to greenptThinkingFetch.ts — otherwise we would be measuring
      // a configuration we never actually run.
      chat_template_kwargs: { enable_thinking: false },
      think: false,
    }),
  });
  if (!response.ok) throw new Error(`${model}: HTTP ${response.status}`);

  const body = (await response.json()) as {
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    impact?: { energy?: { total?: number }; emissions?: { total?: number } };
  };
  if (!body.impact) throw new Error(`${model}: response carried no impact object`);

  return {
    model,
    inputTokens: body.usage?.prompt_tokens ?? 0,
    outputTokens: body.usage?.completion_tokens ?? 0,
    energyWms: body.impact.energy?.total ?? 0,
    emissionsUg: body.impact.emissions?.total ?? 0,
  };
}

/** Least squares for `energy = fix + a*out + b*in`, solved via 3x3 Gauss. */
function fit(rows: readonly Measurement[]): { fix: number; perOut: number; perIn: number } {
  const design = rows.map((r) => [1, r.outputTokens, r.inputTokens]);
  const y = rows.map((r) => r.energyWms);
  const A = design[0].map((_, i) => design[0].map((__, j) => sum(design, i, j)));
  const b = design[0].map((_, i) => design.reduce((acc, d, k) => acc + d[i] * y[k], 0));

  const M = A.map((row, i) => [...row, b[i]]);
  for (let i = 0; i < 3; i++) {
    let pivot = i;
    for (let k = i + 1; k < 3; k++) if (Math.abs(M[k][i]) > Math.abs(M[pivot][i])) pivot = k;
    [M[i], M[pivot]] = [M[pivot], M[i]];
    for (let k = i + 1; k < 3; k++) {
      const f = M[k][i] / M[i][i];
      for (let j = i; j < 4; j++) M[k][j] -= f * M[i][j];
    }
  }
  const x = [0, 0, 0];
  for (let i = 2; i >= 0; i--) {
    x[i] = (M[i][3] - (i < 2 ? M[i][2] * x[2] : 0) - (i < 1 ? M[i][1] * x[1] : 0)) / M[i][i];
  }
  // Wms -> mWh
  return { fix: x[0] / 3600, perOut: x[1] / 3600, perIn: x[2] / 3600 };
}

function sum(design: number[][], i: number, j: number): number {
  return design.reduce((acc, d) => acc + d[i] * d[j], 0);
}

async function main(): Promise<void> {
  if (!KEY) throw new Error('GREENPT_API_KEY is not set');

  for (const { greenpt, ours } of MODELS) {
    const rows: Measurement[] = [];
    for (const run of RUNS) {
      try {
        const m = await measure(greenpt, run.prompt, run.maxTokens);
        rows.push(m);
        const wh = (m.energyWms / 3_600_000).toFixed(4);
        console.log(
          `  ${run.label.padEnd(14)} out=${String(m.outputTokens).padStart(5)}  ${wh} Wh`
        );
      } catch (error) {
        console.error(`  ${run.label}: ${String(error)}`);
      }
    }
    if (rows.length < 3) continue;

    const c = fit(rows);
    const intensity = rows.map((r) => (r.emissionsUg * 3600) / r.energyWms);
    console.log(`${greenpt}  ->  ${ours}`);
    console.log(
      `  mWhPerOutputToken: ${c.perOut.toFixed(3)}, mWhPerInputToken: ${c.perIn.toFixed(4)}, mWhFixed: ${c.fix.toFixed(2)}`
    );
    console.log(
      `  grid intensity now: ${Math.min(...intensity).toFixed(1)}-${Math.max(...intensity).toFixed(1)} g CO2/kWh\n`
    );
  }
}

void main();
