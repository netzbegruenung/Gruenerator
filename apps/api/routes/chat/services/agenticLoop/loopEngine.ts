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

/** Injected via prepareStep's `system` override on the force-finish step
 *  (LobeHub pattern: strip tools AND tell the model why, instead of a bare
 *  toolChoice:'none' it can't interpret). */
export const FORCE_FINISH_SYSTEM_SUFFIX =
  '\n\nWICHTIG: Du hast das Schritt-Limit erreicht. Rufe KEINE Tools mehr auf. Fasse zusammen, was du herausgefunden hast, und gib JETZT die endgültige Antwort auf Basis der vorhandenen Belege. Wenn etwas offen bleibt, sag ehrlich, was fehlt.';
export const FORCE_FINISH_GATHER_SUFFIX =
  '\n\nWICHTIG: Schritt-Limit erreicht — beende die Recherche JETZT ohne weitere Tool-Aufrufe.';

const GATHER_SUFFIX = [
  '',
  '',
  'ARBEITSPHASE (hier erledigst du die TOOL-Arbeit: Belege sammeln UND angeforderte Inhalte erstellen — die finale Textantwort schreibst du NICHT hier):',
  '- Für grüne Positionen, Programme und Beschlüsse ZUERST gruenerator_search (interne Dokumente). Nutze die Websuche NUR, wenn die internen Dokumente die Frage nicht abdecken oder es um tagesaktuelle Ereignisse/Zahlen geht — NICHT parallel oder auf Vorrat.',
  '- Verlass dich NICHT auf dein eigenes Wissen — belege mit Tools. Aber STOPPE, sobald die ersten 1–2 Treffer die Frage beantworten; sammle nicht auf Vorrat und wiederhole keine ähnlichen Suchen.',
  '- scrape_url NUR für URLs, die tatsächlich in Suchergebnissen erscheinen — rate keine Adressen.',
  '- Wenn der*die Nutzer*in ausdrücklich eine ERSTELLUNG wünscht (z.B. ein Sharepic, Bild, eine Präsentation, Tabelle, ein Dokument oder ein Board), MUSST du das passende Erstellungs-Tool (z.B. sharepic / generate_image / create_presentation / create_sheet / create_document / create_board) in dieser Phase aufrufen — recherchiere zuerst die Fakten, dann rufe das Tool mit dem belegten, konkreten Auftrag auf. Verweigere die Erstellung NICHT.',
  '- Schreibe in dieser Phase KEINE finale Antwort; sobald die Belege reichen und angeforderte Inhalte erstellt sind, beende die Tool-Aufrufe.',
].join('\n');

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

/** prepareStep shared by both modes: on the last step (or when forceFinish
 *  trips) strip tools AND explain why via a per-step system override. */
export function buildPrepareStep(
  baseSystem: string,
  finishSuffix: string,
  maxSteps: number,
  forceFinish: () => boolean,
  forceFirstToolCall: boolean
): ({ stepNumber }: { stepNumber: number }) => {
  toolChoice?: 'none' | 'required';
  system?: string;
} {
  return ({ stepNumber }) => {
    if (stepNumber >= maxSteps - 1 || forceFinish()) {
      return { toolChoice: 'none' as const, system: `${baseSystem}${finishSuffix}` };
    }
    // Explicit-scope MCP FOLLOW-UP: the small planner otherwise answers from
    // prose without ever calling the connector (observed: intent=mcp steps=0,
    // "Tally gibt nur die interne ID zurück" fabricated). Require a tool call on
    // the first step so it actually hits the server. Gated off for the first
    // scope turn (clarification allowed) and meta questions by the caller.
    if (forceFirstToolCall && stepNumber === 0) {
      return { toolChoice: 'required' as const };
    }
    return {};
  };
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
  /** Force a tool call on the first step (explicit-scope MCP follow-ups). */
  forceFirstToolCall?: boolean;
  onText: (delta: string) => void;
  onReasoning: (delta: string) => void;
  /** Split mode only: runs AFTER the gather phase and BEFORE synthesis. Used to
   *  GUARANTEE a compound turn's artifact — the split planner unreliably invokes
   *  the generation fat tool (it treats the turn as pure research and stops), so
   *  this hook force-creates the artifact from the gathered sources when the
   *  planner didn't, before the synth announces it. */
  afterGather?: () => Promise<void>;
}

export async function runAgenticLoop(
  p: LoopEngineParams,
  deps: LoopDeps = defaultDeps
): Promise<{ text: string }> {
  if (p.mode === 'unified') {
    const result = await streamWithTools(p, p.synthModel, deps);
    // Unified mode has no separate synth phase, so the artifact/edit guarantees
    // run AFTER the stream (idempotent — the hooks no-op when the model already
    // created/edited). Without this, a Mistral turn that only searched left the
    // compound sharepic/doc uncreated.
    if (p.afterGather) await p.afterGather();
    return result;
  }
  await gather(p, deps);
  if (p.afterGather) await p.afterGather();
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
    prepareStep: buildPrepareStep(
      p.toolSystem,
      FORCE_FINISH_SYSTEM_SUFFIX,
      p.maxSteps,
      p.forceFinish,
      p.forceFirstToolCall ?? false
    ),
    experimental_repairToolCall: repairToolCall,
  });
  return drain(result, p.onText, p.onReasoning);
}

/** Split phase 1: the planner runs the tool loop and fills the source registry.
 *  Its own text output is discarded — the answer comes from synthesis. */
async function gather(p: LoopEngineParams, deps: LoopDeps): Promise<void> {
  try {
    const gatherSystem = `${p.toolSystem}${GATHER_SUFFIX}`;
    await deps.generateText({
      model: p.plannerModel,
      system: gatherSystem,
      messages: p.messages,
      tools: p.tools,
      stopWhen: stepCountIs(p.maxSteps),
      temperature: p.temperature,
      maxOutputTokens: p.maxOutputTokens,
      abortSignal: p.abortSignal,
      prepareStep: buildPrepareStep(
        gatherSystem,
        FORCE_FINISH_GATHER_SUFFIX,
        p.maxSteps,
        p.forceFinish,
        p.forceFirstToolCall ?? false
      ),
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
