/**
 * Agentic loop engine — the two orchestration modes, extracted so the
 * "which model runs which phase" logic is unit-testable in isolation
 * (streamText/generateText are injected; see loopEngine.vitest.ts).
 *
 *  - `unified`: the selected model drives tools AND writes the answer in one
 *    streamed pass. Used only when the selection is a fast native tool-caller
 *    (Mistral) — fastest and highest-fidelity.
 *  - `split` (planner/executor): a fixed fast planner (INTERMEDIATE_MODEL) runs
 *    the ADAPTIVE tool loop and gathers evidence into the source registry, then
 *    the selected model writes the answer ONCE over those sources (no tools).
 *    Every tool call runs on the confirmed tool-caller, so loop tool-calling no
 *    longer depends on the user's model, and slow "thinking"/non-tool-calling
 *    models pay the expensive generation only once (synthesis) instead of per
 *    tool step.
 *
 * Tool cards, guards, timeouts, truncation and step recording are already baked
 * into the wrapped `tools` (wrapToolsForLoop) and fire during the tool phase in
 * both modes.
 */
import {
  streamText as streamTextReal,
  generateText as generateTextReal,
  stepCountIs,
  InvalidToolInputError,
} from 'ai';

import { createLogger } from '../../../../utils/logger.js';

import type { LanguageModel, ModelMessage, ToolSet } from 'ai';

const log = createLogger('AgenticLoopEngine');

export type LoopMode = 'unified' | 'split';

/** streamText/generateText are injected so the engine can be driven by fakes
 *  in tests without real models or the SDK's internal tool loop. */
export interface LoopDeps {
  streamText: typeof streamTextReal;
  generateText: typeof generateTextReal;
}
const defaultDeps: LoopDeps = { streamText: streamTextReal, generateText: generateTextReal };

const GATHER_SUFFIX =
  '\n\nWICHTIG (Recherchephase): Deine EINZIGE Aufgabe ist es jetzt, mit den Tools Belege für die Frage zu sammeln. Verlass dich NICHT auf dein eigenes Wissen — rufe für jede Sach-/Faktenfrage mindestens ein passendes Such-Tool auf (Programm-, Web-, Bundestag- oder Abgeordneten-Tool). Schreibe in dieser Phase KEINE Antwort; sobald du genug Belege hast, beende die Tool-Aufrufe.';

/** Best-effort recovery of a malformed JSON tool-argument string. */
function tryLenientJsonParse(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/** Lenient one-shot arg repair; else the invalid-args error is surfaced to the
 *  model as a tool error (via the loop) and it self-corrects. */
const repairToolCall: NonNullable<
  Parameters<typeof streamTextReal>[0]['experimental_repairToolCall']
> = async ({ toolCall, error }) => {
  if (!(error instanceof InvalidToolInputError)) return null;
  const fixed = tryLenientJsonParse(typeof toolCall.input === 'string' ? toolCall.input : '');
  if (fixed == null) return null;
  return { ...toolCall, input: JSON.stringify(fixed) };
};

export interface LoopEngineParams {
  mode: LoopMode;
  /** Runs the tool loop. Equals synthModel in `unified`. */
  plannerModel: LanguageModel;
  /** Writes the user-facing answer. */
  synthModel: LanguageModel;
  /** Already wrapped by wrapToolsForLoop. */
  tools: ToolSet;
  /** System for the tool phase: base + tool-usage block (+ mcp note). */
  toolSystem: string;
  /** Builds the synthesizer system from the gathered numbered sources block. */
  buildSynthSystem: (sourcesBlock: string) => string;
  getSourcesBlock: () => string;
  messages: ModelMessage[];
  maxSteps: number;
  temperature: number;
  maxOutputTokens: number;
  abortSignal: AbortSignal;
  /** Extra force-finish trigger (e.g. an image was generated). */
  forceFinish: () => boolean;
  onText: (delta: string) => void;
  onReasoning: (delta: string) => void;
}

export async function runAgenticLoop(
  p: LoopEngineParams,
  deps: LoopDeps = defaultDeps
): Promise<{ text: string }> {
  if (p.mode === 'unified') {
    return streamWithTools(p, p.synthModel, deps);
  }
  await gather(p, deps);
  return synthesize(p, deps);
}

/** Unified mode: one model holds the tools and streams the answer. */
async function streamWithTools(
  p: LoopEngineParams,
  model: LanguageModel,
  deps: LoopDeps
): Promise<{ text: string }> {
  const result = deps.streamText({
    model,
    system: p.toolSystem,
    messages: p.messages,
    tools: p.tools,
    stopWhen: stepCountIs(p.maxSteps),
    temperature: p.temperature,
    maxOutputTokens: p.maxOutputTokens,
    abortSignal: p.abortSignal,
    prepareStep: ({ stepNumber }) =>
      stepNumber >= p.maxSteps - 1 || p.forceFinish() ? { toolChoice: 'none' as const } : {},
    experimental_repairToolCall: repairToolCall,
  });
  return drain(result, p.onText, p.onReasoning);
}

/** Split phase 1: the planner runs the tool loop and fills the source registry.
 *  Its own text output is discarded — the answer comes from synthesis. */
async function gather(p: LoopEngineParams, deps: LoopDeps): Promise<void> {
  try {
    await deps.generateText({
      model: p.plannerModel,
      system: `${p.toolSystem}${GATHER_SUFFIX}`,
      messages: p.messages,
      tools: p.tools,
      stopWhen: stepCountIs(p.maxSteps),
      temperature: p.temperature,
      maxOutputTokens: p.maxOutputTokens,
      abortSignal: p.abortSignal,
      prepareStep: ({ stepNumber }) =>
        stepNumber >= p.maxSteps - 1 || p.forceFinish() ? { toolChoice: 'none' as const } : {},
      experimental_repairToolCall: repairToolCall,
    });
  } catch (err) {
    // Tools that already ran filled the registry before any error — degrade to
    // synthesis over whatever was collected rather than failing the whole turn.
    // A genuinely aborted request re-throws in the synthesis stream below.
    log.warn(`[Engine] gather phase error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Split phase 2: the selected model writes the answer over the gathered
 *  sources — no tools. */
async function synthesize(p: LoopEngineParams, deps: LoopDeps): Promise<{ text: string }> {
  const result = deps.streamText({
    model: p.synthModel,
    system: p.buildSynthSystem(p.getSourcesBlock()),
    messages: p.messages,
    temperature: p.temperature,
    maxOutputTokens: p.maxOutputTokens,
    abortSignal: p.abortSignal,
  });
  return drain(result, p.onText, p.onReasoning);
}

interface Drainable {
  fullStream: AsyncIterable<{ type: string; text?: string; error?: unknown }>;
}

async function drain(
  result: Drainable,
  onText: (d: string) => void,
  onReasoning: (d: string) => void
): Promise<{ text: string }> {
  let text = '';
  const iterator = result.fullStream[Symbol.asyncIterator]();
  while (true) {
    const next = await iterator.next();
    if (next.done) break;
    const part = next.value;
    if (part.type === 'error') throw part.error;
    if (part.type === 'reasoning-delta' && part.text != null && part.text.length > 0) {
      onReasoning(part.text);
    } else if (part.type === 'text-delta' && part.text != null && part.text.length > 0) {
      text += part.text;
      onText(part.text);
    }
  }
  return { text };
}
