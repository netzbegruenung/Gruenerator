/**
 * Degeneration probe — does a given prompt make a given model lane fail to stop?
 *
 * Fires the SAME prompt N times at each lane and measures whether the answer
 * degenerates into repetition (live 12.08.2026: Mistral Medium wrote 13.096
 * chars and lost itself in "Fertig. --- --- ---"; the day before, 32.826 chars
 * over 263s). Degeneration is stochastic — one run proves nothing, which is why
 * this repeats and reports a RATE.
 *
 * Judged with the PRODUCTION detector (`degeneration.ts`), so a hit here is a
 * hit in the real loop, not a second opinion that can drift from it.
 *
 * Three lanes answer three different questions in one pass:
 *   gemma     — would the default prose lane have been steadier?
 *   scaleway  — reproduces the live path (Mistral Medium 3.5 as we serve it)
 *   mistral   — same weights on Mistral's own API: model or hosting?
 *
 *   pnpm --filter @gruenerator/api eval:degeneration
 *
 * Env:
 *   DEGEN_PROMPT_FILE  path to the user prompt (REQUIRED — kept out of the repo
 *                      so real customer text and scraped articles never land in
 *                      a public checkout)
 *   DEGEN_RUNS         runs per lane (default 5)
 *   DEGEN_LANES        comma-separated subset of gemma,scaleway,mistral
 *   DEGEN_MAX_CHARS    hard stop per run so a runaway stream cannot bill
 *                      forever (default 40000)
 *   DEGEN_OUT          write the full transcripts + metrics here as JSON
 *
 * This calls REAL providers and costs real tokens: 3 lanes x 5 runs x ~13k
 * chars is roughly 45 long generations. Start with DEGEN_RUNS=2 when probing a
 * new prompt.
 */
import { readFileSync, writeFileSync } from 'node:fs';

import { streamText } from 'ai';
import * as dotenv from 'dotenv';

dotenv.config();

const { createDegenerationGuard, findDegenerationCut, isDegenerateSample, DEGEN_WINDOW } =
  await import('../routes/chat/services/agenticLoop/degeneration.js');
const { getRegoloProvider, getScalewayProvider, getMistralProvider } =
  await import('../services/ai/providerInstances.js');
const { buildSystemMessage } = await import('../agents/langgraph/ChatGraph/nodes/respondNode.js');
const { DEFAULT_LOOP_BUDGET } = await import('../routes/chat/services/agenticLoop/types.js');

/**
 * How much of the production context the model gets. The bare prompt did NOT
 * reproduce the live failure on any lane (15/15 clean, 3.7k–5.8k chars, all
 * finishReason=stop) while production wrote 13.096 chars and lost itself — so
 * the trigger is in the scaffolding, and these stages add it back one layer at
 * a time until the failure appears.
 */
type Stage = 'bare' | 'system' | 'toolsystem';

/** Reproduces the live turn: universal agent, de-DE, agentic intent. */
async function stageInstructions(stage: Stage): Promise<string | undefined> {
  if (stage === 'bare') return undefined;
  const systemMessage = await buildSystemMessage({
    intent: 'agentic',
    messages: [{ role: 'user', content: 'placeholder' }],
    searchResults: [],
    citations: [],
    agentConfig: {
      identifier: 'gruenerator-universal',
      systemRole: 'Du bist Universal Assistent, ein Assistent für BÜNDNIS 90/DIE GRÜNEN.',
    },
    enabledTools: {},
    generatedImage: null,
    imagePrompt: null,
    sharepicVariants: [],
    createdDocument: null,
    createdBoard: null,
    threadArtifacts: [],
    lastToolContext: null,
    userLocale: 'de-DE',
  } as never);
  if (stage === 'system') return systemMessage;
  // Imported HERE, not at module load: `agenticRespondService` transitively
  // pulls in intentExecutionService → deepAgentTurn → the `deepagents` package,
  // so a checkout missing that dependency would break the cheaper stages too.
  const { buildToolUsageBlock } =
    await import('../routes/chat/services/agenticLoop/agenticRespondService.js');
  const { withInstructionHierarchy } = await import('../routes/chat/services/untrustedContent.js');
  // The exact string production assembles for the unified loop, minus the
  // per-request notes (MCP catalog, carried sources, recipes) that need a live
  // request to exist. `true` = unified mode's artifact-outcome rule.
  return withInstructionHierarchy(
    `${systemMessage}\n\n${buildToolUsageBlock(DEFAULT_LOOP_BUDGET.maxSteps, false, true)}`
  );
}

/** Mirrors the answer path: temperature 0.3, and deliberately NO
 *  maxOutputTokens (PR #2002) — capping it here would hide the very failure
 *  we are measuring. DEGEN_MAX_CHARS bounds the cost instead. */
const TEMPERATURE = 0.3;

interface Lane {
  id: string;
  label: string;
  model: () => Parameters<typeof streamText>[0]['model'];
}

const LANES: Lane[] = [
  // `.chat(...)`, never the callable shorthand: on @ai-sdk/openai v7 the
  // shorthand targets the Responses API, which Scaleway rejects outright
  // ("endpoint '/v1/responses' is not supported"). Production goes through
  // `.chat()` too (services/ai/providers.ts) — this has to match it.
  {
    id: 'gemma',
    label: 'regolo/gemma4-31b',
    model: () => getRegoloProvider().chat('gemma4-31b'),
  },
  {
    id: 'scaleway',
    label: 'scaleway/mistral-medium-3.5-128b',
    model: () => getScalewayProvider().chat('mistral-medium-3.5-128b'),
  },
  {
    id: 'mistral',
    label: 'mistral/mistral-medium-2604',
    model: () => getMistralProvider()('mistral-medium-2604'),
  },
];

interface RunResult {
  lane: string;
  run: number;
  chars: number;
  ms: number;
  finishReason: string | null;
  /** Char count at which the production guard WOULD have aborted, if ever. */
  firedAt: number | null;
  /** What the guard would have kept — the healthy prefix. */
  keptChars: number | null;
  /** True when the very last window still reads degenerate at natural end. */
  endedDegenerate: boolean;
  hitCeiling: boolean;
  tail: string;
  error?: string;
}

async function runOnce(
  lane: Lane,
  run: number,
  prompt: string,
  maxChars: number,
  instructions: string | undefined
) {
  const guard = createDegenerationGuard();
  const started = Date.now();
  let text = '';
  let firedAt: number | null = null;
  let keptChars: number | null = null;
  let finishReason: string | null = null;
  let hitCeiling = false;
  let error: string | undefined;

  try {
    const result = streamText({
      model: lane.model(),
      // `system`, not `instructions`: that is the option production passes
      // (loopEngine `system: p.toolSystem`). v7 accepts it as the alias.
      ...(instructions !== undefined && { system: instructions }),
      messages: [{ role: 'user', content: prompt }],
      temperature: TEMPERATURE,
    });
    // `.stream`, not the deprecated `fullStream` alias — same as loopEngine.
    for await (const part of result.stream) {
      if (part.type === 'error') throw part.error;
      if (part.type === 'text-delta' && part.text) {
        text += part.text;
        // Keep streaming after the guard would have fired: we want to know how
        // far it WOULD have run, which is the number that justifies the guard.
        if (firedAt === null && guard.check(text)) {
          firedAt = text.length;
          keptChars = findDegenerationCut(text, text.length);
        }
        if (text.length >= maxChars) {
          hitCeiling = true;
          break;
        }
      } else if (part.type === 'finish') {
        finishReason = part.finishReason ?? null;
      }
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const out: RunResult = {
    lane: lane.id,
    run,
    chars: text.length,
    ms: Date.now() - started,
    finishReason,
    firedAt,
    keptChars,
    endedDegenerate: text.length > 0 && isDegenerateSample(text.slice(-DEGEN_WINDOW)),
    hitCeiling,
    tail: text.slice(-160),
    ...(error !== undefined && { error }),
  };
  const verdict = out.error
    ? `ERROR ${out.error}`
    : firedAt !== null
      ? `DEGENERATE at ${firedAt} (keep ${keptChars})`
      : out.endedDegenerate
        ? 'DEGENERATE at end'
        : 'clean';
  console.log(
    `  ${lane.id} #${run}: ${out.chars} chars, ${(out.ms / 1000).toFixed(1)}s, ` +
      `finish=${finishReason ?? '-'} → ${verdict}`
  );
  return out;
}

async function main() {
  const promptFile = process.env.DEGEN_PROMPT_FILE;
  if (!promptFile) throw new Error('DEGEN_PROMPT_FILE is required');
  const prompt = readFileSync(promptFile, 'utf8');
  const runs = Number(process.env.DEGEN_RUNS ?? 5);
  const maxChars = Number(process.env.DEGEN_MAX_CHARS ?? 40000);
  const only = process.env.DEGEN_LANES?.split(',').map((s) => s.trim());
  const lanes = only ? LANES.filter((l) => only.includes(l.id)) : LANES;
  const stage = (process.env.DEGEN_STAGE ?? 'bare') as Stage;
  const instructions = await stageInstructions(stage);

  console.log(
    `Prompt: ${prompt.length} chars from ${promptFile}\n` +
      `Stage: ${stage} (system prompt ${instructions?.length ?? 0} chars)\n` +
      `Lanes: ${lanes.map((l) => l.label).join(', ')}\n` +
      `Runs per lane: ${runs}, ceiling ${maxChars} chars, temperature ${TEMPERATURE}\n`
  );

  // Lanes in parallel (different upstreams), runs inside a lane serial so we
  // measure the model, not somebody's concurrency limiter.
  const results = (
    await Promise.all(
      lanes.map(async (lane) => {
        const laneResults: RunResult[] = [];
        for (let i = 1; i <= runs; i++) {
          laneResults.push(await runOnce(lane, i, prompt, maxChars, instructions));
        }
        return laneResults;
      })
    )
  ).flat();

  console.log('\n=== Ergebnis ===');
  console.log('lane      | degeneriert | Ø Zeichen | Ø Sekunden | finishReasons');
  for (const lane of lanes) {
    const rs = results.filter((r) => r.lane === lane.id && !r.error);
    if (rs.length === 0) {
      console.log(`${lane.id.padEnd(9)} | — alle Läufe mit Fehler`);
      continue;
    }
    const bad = rs.filter((r) => r.firedAt !== null || r.endedDegenerate).length;
    const avg = (pick: (r: RunResult) => number) =>
      Math.round(rs.reduce((s, r) => s + pick(r), 0) / rs.length);
    const reasons = [...new Set(rs.map((r) => r.finishReason ?? '-'))].join(',');
    console.log(
      `${lane.id.padEnd(9)} | ${String(bad).padStart(2)}/${rs.length}       | ` +
        `${String(avg((r) => r.chars)).padStart(9)} | ` +
        `${String(Math.round(avg((r) => r.ms) / 1000)).padStart(10)} | ${reasons}`
    );
  }

  const failed = results.filter((r) => r.error);
  if (failed.length > 0) {
    console.log(`\n${failed.length} Lauf/Läufe mit Fehler:`);
    for (const f of failed) console.log(`  ${f.lane} #${f.run}: ${f.error}`);
  }

  const outFile = process.env.DEGEN_OUT;
  if (outFile) {
    writeFileSync(outFile, JSON.stringify(results, null, 2));
    console.log(`\nDetails → ${outFile}`);
  }
}

await main();
