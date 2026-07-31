/**
 * Agentic loop engine — the two orchestration modes, extracted so the
 * "which model runs which phase" logic is unit-testable in isolation
 * (streamText/generateText are injected; see loopEngine.vitest.ts).
 *
 *  - `unified`: the selected model drives tools AND writes the answer in one
 *    streamed pass. Used only when the selection is a fast native tool-caller
 *    (Mistral) — fastest and highest-fidelity.
 *  - `split` (planner/executor): a fixed fast planner (`standard` stage) runs
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
  isStepCount,
  InvalidToolInputError,
} from 'ai';

import { buildAiTelemetry } from '../../../../services/telemetry/langfuseTelemetry.js';
import { recordDecision } from '../../../../utils/decisionJournal.js';
import { createLogger } from '../../../../utils/logger.js';
import { isWholesaleRefusal, refusalLanguage } from '../refusalDetection.js';
import { createIdleDeadline } from '../streamIdleDeadline.js';

import type { LanguageModel, ModelMessage, ToolSet } from 'ai';

const log = createLogger('AgenticLoopEngine');

/**
 * How long the SYNTH stream may be completely silent before it counts as hung.
 * Matches the single-pass reasoning lane's window, since it guards the same
 * thing: a lane that accepted the request and then produced nothing.
 *
 * Only the synth phase is guarded. In the tool phases a legitimate tool call
 * blocks the iterator for as long as it runs (a deep research call was measured
 * at 16.5s), so silence there does not mean "hung" and would need its own,
 * larger budget — separate work. Synthesis runs WITHOUT tools, so any silence
 * is the model thinking or stalling, and reasoning deltas keep it alive.
 */
const SYNTH_IDLE_DEADLINE_MS = 20_000;

/** The synth lane accepted the request and then went silent. Named
 *  `TimeoutError` so the caller's existing abort branch surfaces its friendly
 *  "das hat zu lange gedauert" text rather than the generic failure line. */
export class SynthStallError extends Error {
  constructor(idleMs: number) {
    super(`Synth stream idle for ${idleMs}ms`);
    this.name = 'TimeoutError';
  }
}

export function isSynthStall(err: unknown): err is SynthStallError {
  return err instanceof SynthStallError;
}

export type LoopMode = 'unified' | 'split';

/** streamText/generateText are injected so the engine can be driven by fakes
 *  in tests without real models or the SDK's internal tool loop. */
export interface LoopDeps {
  streamText: typeof streamTextReal;
  generateText: typeof generateTextReal;
}
const defaultDeps: LoopDeps = { streamText: streamTextReal, generateText: generateTextReal };

/**
 * Langfuse settings for one loop phase, ready to spread into a streamText call.
 * The caller has already opened the turn's root span, so these land under it as
 * named generations — otherwise an agentic turn shows a trace with no LLM work
 * in it at all. Empty object when Langfuse is off, which is also what the unit
 * tests see (they never init the telemetry module).
 */
const phaseTelemetry = (phase: 'unified' | 'gather' | 'synth') => {
  const telemetry = buildAiTelemetry(`chat-graph.agentic.${phase}`);
  return telemetry ? { experimental_telemetry: telemetry } : {};
};

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
  '- Für grüne Positionen, Programme und Beschlüsse ZUERST gruenerator_search (interne Dokumente). Nutze die Websuche NUR, wenn die internen Dokumente die Frage nicht abdecken oder es um tagesaktuelle Ereignisse/Zahlen geht — NICHT parallel oder auf Vorrat. Bei Fragen OHNE Parteibezug (Allgemeinwissen, Personen, Ereignisse, Zahlen) suchst du DIREKT im Web — gruenerator_search kennt ausschließlich Parteidokumente.',
  '- Verlass dich NICHT auf dein eigenes Wissen — belege mit Tools. Aber STOPPE, sobald die ersten 1–2 Treffer die Frage beantworten; sammle nicht auf Vorrat und wiederhole keine ähnlichen Suchen.',
  '- scrape_url NUR für URLs, die tatsächlich in Suchergebnissen erscheinen — rate keine Adressen.',
  '- Wenn der*die Nutzer*in ausdrücklich eine ERSTELLUNG wünscht (z.B. ein Sharepic, Bild, eine Präsentation, Tabelle, ein Dokument oder ein Board), MUSST du das passende Erstellungs-Tool (z.B. sharepic / generate_image / create_presentation / create_sheet / create_document / create_board) in dieser Phase aufrufen — recherchiere zuerst die Fakten, dann rufe das Tool mit dem belegten, konkreten Auftrag auf. Verweigere die Erstellung NICHT.',
  '- Schreibe in dieser Phase KEINE finale Antwort und KEINE Zusammenfassung. Du darfst vor einem Tool-Aufruf in EINEM kurzen Satz ankündigen, was du als Nächstes tust (z.B. "Ich suche jetzt im Wahlprogramm nach Windkraft."). Sobald die Belege reichen und angeforderte Inhalte erstellt sind, beende die Tool-Aufrufe ohne weiteren Text.',
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
  forceFirstToolCall: boolean,
  /** Names a tool the NEXT step must call (see guards.emptyResultFallback), or
   *  null to leave the choice to the model. Consulted on every step but the
   *  first — step 0 has no tool result to react to yet. */
  forcedTool: () => string | null = () => null
): ({ stepNumber }: { stepNumber: number }) => {
  toolChoice?: 'none' | 'required' | { type: 'tool'; toolName: string };
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
    if (stepNumber > 0) {
      const toolName = forcedTool();
      // `required` would only guarantee SOME call — the model would happily
      // re-run the internal search that just came back empty. Name the tool.
      if (toolName) return { toolChoice: { type: 'tool' as const, toolName } };
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

/**
 * Buffers streamed text deltas and hands `emit` ONE trimmed sentence at a time.
 * A sentence flushes as soon as the buffer holds a sentence-end char `[.!?…:]`
 * followed by whitespace/end, contains a newline, or grows past 160 chars. On a
 * mid-buffer sentence end only the completed sentence is emitted; the remainder
 * stays buffered. `flush()` emits whatever is left (run at phase end). Pure — no
 * deps, so the split-gather narration path is unit-testable in isolation.
 */
export function createSentenceChunker(emit: (sentence: string) => void): {
  push(delta: string): void;
  flush(): void;
} {
  let buffer = '';
  const sentenceEnd = /[.!?…:](?=\s|$)/;

  const doEmit = (raw: string): void => {
    const trimmed = raw.trim();
    if (trimmed.length > 0) emit(trimmed);
  };

  const drainReady = (): void => {
    let progressed = true;
    while (progressed) {
      progressed = false;
      const match = sentenceEnd.exec(buffer);
      const newline = buffer.indexOf('\n');
      // Earliest boundary wins. Sentence end keeps the punctuation; a newline is
      // consumed (trimmed away anyway) so the next sentence starts clean.
      let emitEnd = -1;
      let cutEnd = -1;
      if (match) {
        emitEnd = match.index + 1;
        cutEnd = emitEnd;
      }
      if (newline >= 0 && (cutEnd < 0 || newline < cutEnd)) {
        emitEnd = newline;
        cutEnd = newline + 1;
      }
      if (cutEnd >= 0) {
        doEmit(buffer.slice(0, emitEnd));
        buffer = buffer.slice(cutEnd);
        progressed = true;
        continue;
      }
      if (buffer.length > 160) {
        doEmit(buffer);
        buffer = '';
        progressed = true;
      }
    }
  };

  return {
    push(delta: string): void {
      if (!delta) return;
      buffer += delta;
      drainReady();
    },
    flush(): void {
      doEmit(buffer);
      buffer = '';
    },
  };
}

export interface LoopEngineParams {
  mode: LoopMode;
  /** Runs the tool loop. Equals synthModel in `unified`. */
  plannerModel: LanguageModel;
  /** Writes the user-facing answer. */
  synthModel: LanguageModel;
  /** Split mode: sibling lane, tried once when `synthModel` goes silent. Omit
   *  and a stall simply surfaces as the turn's timeout message. */
  synthFallbackModel?: LanguageModel;
  /** Already wrapped by wrapToolsForLoop. */
  tools: ToolSet;
  /** System for the tool phase: base + tool-usage block (+ mcp note). */
  toolSystem: string;
  /** Builds the synthesizer system from the gathered numbered sources block. */
  buildSynthSystem: (sourcesBlock: string) => string;
  getSourcesBlock: () => string;
  messages: ModelMessage[];
  /** Split mode only: the message list the SYNTH phase writes over. Defaults to
   *  `messages`. The caller passes the history WITHOUT the cross-turn tool
   *  replay here — synthesis runs with no tools, and a history full of
   *  tool-call/tool-result messages primes the model to imitate the pattern in
   *  prose instead of answering (observed live: the whole answer was
   *  "Let's perform web_search."). */
  synthMessages?: ModelMessage[];
  maxSteps: number;
  temperature: number;
  /** Optional output cap. Omitted on answer paths (OpenWebUI-style: the
   *  provider/context window is the backstop) — explicit caps truncated
   *  think-lane answers mid-sentence because reasoning tokens count too. */
  maxOutputTokens?: number;
  abortSignal: AbortSignal;
  /**
   * Split mode: the signal the WRITE phase runs under. Defaults to
   * `abortSignal`.
   *
   * Exists because the two phases fail differently. The tool phase is bounded
   * by a turn budget — it may be cut off, and the answer still gets written
   * from what was gathered. The write phase must not be cut off at all: an
   * abort there lands mid-word, and the stump ships as a finished answer (the
   * `catch` only substitutes text when NOTHING was written). Give the writer
   * the request signal plus the absolute ceiling, never the elapsed turn
   * budget, which a slow artifact generation has already spent.
   */
  writeAbortSignal?: AbortSignal;
  /** Extra force-finish trigger (e.g. an image was generated). */
  forceFinish: () => boolean;
  /** Force a tool call on the first step (explicit-scope MCP follow-ups). */
  forceFirstToolCall?: boolean;
  /** Names a specific tool the next step must call — used to turn the "web is
   *  now allowed" permission after an empty internal search into an actual
   *  fallback. Evaluated per step; null leaves the choice to the model. */
  forcedToolForStep?: () => string | null;
  onText: (delta: string) => void;
  onReasoning: (delta: string) => void;
  /** Split mode: fires when the synth phase begins — i.e. tools are done and
   *  the silent wait for the answer starts. The caller uses it to show progress
   *  during a window that otherwise emits nothing at all. */
  onSynthStart?: () => void;
  /** Fires when the synth stalled and the sibling lane takes over, so the
   *  client can surface the switch the same way the single-pass path does. */
  onSynthFallback?: () => void;
  /** Split-gather only: the planner's inter-tool prose, delivered ONE sentence
   *  at a time (via createSentenceChunker) so the client can show "Ich suche
   *  jetzt …" narration. Never fires in unified mode. */
  onNarration?: (sentence: string) => void;
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
    stopWhen: isStepCount(p.maxSteps),
    temperature: p.temperature,
    ...(p.maxOutputTokens != null && { maxOutputTokens: p.maxOutputTokens }),
    abortSignal: p.abortSignal,
    prepareStep: buildPrepareStep(
      p.toolSystem,
      FORCE_FINISH_SYSTEM_SUFFIX,
      p.maxSteps,
      p.forceFinish,
      p.forceFirstToolCall ?? false,
      p.forcedToolForStep
    ),
    experimental_repairToolCall: repairToolCall,
    ...phaseTelemetry('unified'),
  });
  return drain(result, p.onText, p.onReasoning);
}

/** Split phase 1: the planner runs the tool loop and fills the source registry.
 *  Its prose is NOT the answer (synthesis writes that) — but when onNarration is
 *  set we stream the planner's inter-tool sentences to the client as narration.
 *  The stream is consumed in EVERY case (even without onNarration): the AI SDK's
 *  tool loop only advances as the stream is drained. */
async function gather(p: LoopEngineParams, deps: LoopDeps): Promise<void> {
  try {
    const gatherSystem = `${p.toolSystem}${GATHER_SUFFIX}`;
    const result: Drainable = deps.streamText({
      model: p.plannerModel,
      system: gatherSystem,
      messages: p.messages,
      tools: p.tools,
      stopWhen: isStepCount(p.maxSteps),
      temperature: p.temperature,
      ...(p.maxOutputTokens != null && { maxOutputTokens: p.maxOutputTokens }),
      abortSignal: p.abortSignal,
      prepareStep: buildPrepareStep(
        gatherSystem,
        FORCE_FINISH_GATHER_SUFFIX,
        p.maxSteps,
        p.forceFinish,
        p.forceFirstToolCall ?? false,
        p.forcedToolForStep
      ),
      experimental_repairToolCall: repairToolCall,
      ...phaseTelemetry('gather'),
    });
    const chunker = p.onNarration ? createSentenceChunker(p.onNarration) : null;
    const iterator = result.stream[Symbol.asyncIterator]();
    try {
      while (true) {
        const next = await iterator.next();
        if (next.done) break;
        const part = next.value;
        if (part.type === 'error') throw part.error;
        // reasoning-delta discarded; text-delta becomes narration (or is drained
        // silently when no onNarration is wired).
        if (part.type === 'text-delta' && part.text != null && part.text.length > 0) {
          chunker?.push(part.text);
        }
      }
    } finally {
      chunker?.flush();
    }
  } catch (err) {
    // Tools that already ran filled the registry before any error — degrade to
    // synthesis over whatever was collected rather than failing the whole turn.
    // A genuinely aborted request re-throws in the synthesis stream below.
    log.warn(`[Engine] gather phase error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Answers at or below this length are candidates for the degeneracy check, and
 *  the gate holds them back until the verdict is in. Above it the answer is real
 *  prose by definition and streams through unbuffered. */
const DEGENERATE_MAX_CHARS = 200;

// Any of these means real German prose — umlauts or the closed-class words no
// German sentence avoids. Their ABSENCE in a short answer is the signal.
const GERMAN_MARKER_RE =
  /[äöüßÄÖÜ]|\b(der|die|das|dass|und|oder|ich|du|dir|wir|hier|nicht|kein\w*|ist|sind|war\w*|wurde\w*|habe?n?|hat|eine?[nmrs]?|dem|den|mit|von|auf|aus|bei|zum|zur|es|sich)\b/i;

/** A fenced block, an HTML/XML tag, or a JSON object — content, not prose. */
const MARKUP_OR_CODE_RE = /```|<\/?[a-z][\w-]*(?:\s[^>]*)?>|^\s*[[{]/i;

/**
 * What the user reads when the synth DECLINED the request. Distinct from the
 * caller's no-answer fallback on purpose: that one says "ich konnte nichts
 * finden … magst du die Frage anders formulieren?", which reads as a technical
 * failure and coaches the retry of a request we deliberately refused (observed
 * live on the fabricated-quote turn). A decline is an outcome, not an error.
 */
export const SYNTH_REFUSAL_TEXT =
  'Diese Anfrage setze ich nicht um — sie widerspricht den inhaltlichen Regeln des Grünerators, etwa erfundene Zitate, erfundene Quellen oder ausgrenzende Aussagen. Für ein anderes Anliegen bin ich gern da.';

export const SYNTH_RETRY_SYSTEM_SUFFIX =
  '\n\nWICHTIG: Schreibe JETZT die vollständige, ausformulierte Antwort für die*den Nutzer*in — auf Deutsch. Du hast KEINE Tools und kannst keine aufrufen; kündige KEINE Tool-Aufrufe, Suchen oder Arbeitsschritte an, sondern nutze ausschließlich die oben gelieferten Quellen. Beginne direkt mit dem Inhalt.';

/**
 * Whether the synth DECLINED rather than degenerated. Both look alike from the
 * outside — short, and (when the model falls back to English boilerplate) devoid
 * of German markers — but they need opposite handling: a degenerate answer is
 * retried, a refusal must be surfaced as a refusal and never retried.
 *
 * Bounded by {@link DEGENERATE_MAX_CHARS} for two reasons. Precision: a long
 * answer that merely contains a refusal-shaped clause is prose, not a decline.
 * And correctness: past that length the emitter gate has already opened and the
 * text is on the wire, so it can no longer be swapped for the German message.
 *
 * The length bound alone is not enough, hence {@link isWholesaleRefusal} rather
 * than `looksLikeRefusal`: a short summary that ends by calling out an injected
 * instruction fits inside 200 characters, and was being discarded whole.
 */
export function looksLikeSynthRefusal(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > DEGENERATE_MAX_CHARS) return false;
  return isWholesaleRefusal(trimmed);
}

/**
 * Whether a synthesized answer is a degenerate non-answer rather than prose.
 *
 * The live failure this catches: with the cross-turn tool replay in its context
 * but no tools mounted, the synth model imitated the tool-call pattern and the
 * ENTIRE answer was "Let's perform web_search." Short + names a mounted tool, or
 * short + not German at all. Long answers are never degenerate — a real answer
 * that happens to be brief ("Erledigt — die Spalte wurde ergänzt.") carries
 * German markers and passes.
 */
export function looksDegenerateSynth(text: string, toolNames: readonly string[]): boolean {
  const trimmed = text.trim();
  // Empty is the caller's existing fallback case, not this one's.
  if (trimmed.length === 0 || trimmed.length > DEGENERATE_MAX_CHARS) return false;
  // Needs to read as a SENTENCE before we judge its language — a bare token
  // ("Erledigt", "Ja") is a legitimate answer, not a leaked plan.
  if (trimmed.split(/\s+/).filter(Boolean).length < 3) return false;
  // Markup and code are legitimately un-German. "Gib mir den Absatz mit
  // HTML-Tags" answers with `<p>…</p>`, which carries no German function word
  // and was silently discarded — the user got the generic fallback and no error.
  if (MARKUP_OR_CODE_RE.test(trimmed)) return false;
  if (toolNames.some((name) => name.length > 3 && trimmed.includes(name))) return true;
  return !GERMAN_MARKER_RE.test(trimmed);
}

/**
 * Holds the first {@link DEGENERATE_MAX_CHARS} of the answer back so a degenerate
 * one can be discarded and retried before the client ever sees it. Once the
 * answer grows past the threshold the gate opens and every delta passes straight
 * through — so normal answers only pay a one-paragraph delay on first token, and
 * long answers stream as before.
 */
function createGatedEmitter(
  onText: (delta: string) => void,
  holdChars: number
): { push: (d: string) => void; flush: () => void; discard: () => void } {
  let buffer = '';
  let open = false;
  return {
    push(delta) {
      if (open) {
        onText(delta);
        return;
      }
      buffer += delta;
      if (buffer.length > holdChars) {
        onText(buffer);
        buffer = '';
        open = true;
      }
    },
    flush() {
      if (buffer.length > 0) onText(buffer);
      buffer = '';
      open = true;
    },
    discard() {
      buffer = '';
    },
  };
}

/** Split phase 2: the selected model writes the answer over the gathered
 *  sources — no tools. One retry when the first pass degenerates. */
async function synthesize(p: LoopEngineParams, deps: LoopDeps): Promise<{ text: string }> {
  // Synthesis runs WITHOUT tools, so it must not see the tool-call/tool-result
  // replay the gather phase needs — see `synthMessages`.
  const messages = p.synthMessages ?? p.messages;
  const baseSystem = p.buildSynthSystem(p.getSourcesBlock());
  const toolNames = Object.keys(p.tools);

  const runPass = async (
    system: string,
    model: LanguageModel
  ): Promise<{ text: string; flush: () => void; discard: () => void }> => {
    const gate = createGatedEmitter(p.onText, DEGENERATE_MAX_CHARS);
    const idle = createIdleDeadline(
      SYNTH_IDLE_DEADLINE_MS,
      () => new SynthStallError(SYNTH_IDLE_DEADLINE_MS)
    );
    const result = deps.streamText({
      model,
      system,
      messages,
      temperature: p.temperature,
      ...(p.maxOutputTokens != null && { maxOutputTokens: p.maxOutputTokens }),
      // Combined so a stalled provider call is torn down, not just abandoned.
      // `writeAbortSignal` deliberately, NOT the turn budget — see its doc.
      abortSignal: AbortSignal.any([p.writeAbortSignal ?? p.abortSignal, idle.signal]),
      ...phaseTelemetry('synth'),
    });
    try {
      const { text } = await drain(result, gate.push, p.onReasoning, idle);
      return { text, flush: gate.flush, discard: gate.discard };
    } catch (err) {
      // Nothing buffered may leak on the error path — the caller's catch writes
      // its own user-facing message.
      gate.discard();
      throw err;
    }
  };

  /**
   * A stalled lane costs the user the whole turn, so try the sibling once —
   * the same move `streamWithFallback` makes on the single-pass path. Safe to
   * restart rather than resume because the gated emitter has held everything
   * back: the client has seen nothing from the dead pass.
   */
  const runPassWithFallback = async (
    system: string
  ): Promise<{ text: string; flush: () => void; discard: () => void }> => {
    try {
      return await runPass(system, p.synthModel);
    } catch (err) {
      if (!isSynthStall(err) || !p.synthFallbackModel) throw err;
      log.warn(
        `[Engine] synth lane silent for ${SYNTH_IDLE_DEADLINE_MS}ms — retrying once on the fallback lane`
      );
      p.onSynthFallback?.();
      return runPass(system, p.synthFallbackModel);
    }
  };

  p.onSynthStart?.();
  const first = await runPassWithFallback(baseSystem);
  // A decline is checked BEFORE degeneracy: an English refusal trips the
  // no-German-marker rule, so without this it would be retried (a second model
  // call that refuses again) and then reported as "keine Antwort gefunden".
  if (looksLikeSynthRefusal(first.text)) {
    first.discard();
    // The discarded text goes into the line on purpose: an over-refusal is
    // invisible without it — the wire only ever shows the canned message, so a
    // wrongly swapped answer looks exactly like a correct decline in the logs.
    const lang = refusalLanguage(first.text) ?? 'de';
    log.info(
      `[Engine] synth declined the request (${lang}) — ` +
        `surfacing the German refusal instead of retrying; discarded: ${JSON.stringify(
          first.text.trim().slice(0, 120)
        )}`
    );
    recordDecision('loop.synth_verdict', 'refusal_swapped', {
      inputs: { refusalLanguage: lang },
    });
    p.onText(SYNTH_REFUSAL_TEXT);
    return { text: SYNTH_REFUSAL_TEXT };
  }
  if (!looksDegenerateSynth(first.text, toolNames)) {
    recordDecision('loop.synth_verdict', 'accepted', {
      inputs: { textLength: first.text.length },
    });
    first.flush();
    return { text: first.text };
  }

  log.warn(
    `[Engine] synth degenerated into a non-answer (${first.text.length} chars: ${JSON.stringify(
      first.text.trim().slice(0, 80)
    )}) — retrying once`
  );
  recordDecision('loop.synth_verdict', 'degenerate_retried', {
    inputs: { textLength: first.text.length },
  });
  const retry = await runPassWithFallback(`${baseSystem}${SYNTH_RETRY_SYSTEM_SUFFIX}`);
  if (retry.text.trim().length === 0 || looksDegenerateSynth(retry.text, toolNames)) {
    // Neither pass produced an answer — emit NEITHER (both are still buffered)
    // and return empty, so the caller's honest no-answer fallback fires instead
    // of a leaked tool-planning line.
    log.warn('[Engine] synth retry did not recover — degrading to the no-answer fallback');
    recordDecision('loop.synth_verdict', 'retry_failed_empty', {
      inputs: { retryTextLength: retry.text.length },
    });
    return { text: '' };
  }
  retry.flush();
  return { text: retry.text };
}

interface Drainable {
  stream: AsyncIterable<{ type: string; text?: string; error?: unknown; finishReason?: string }>;
}

async function drain(
  result: Drainable,
  onText: (d: string) => void,
  onReasoning: (d: string) => void,
  /** Optional stall guard. Every chunk — text OR reasoning — counts as liveness,
   *  so a thinking model is never mistaken for a hung one. */
  idle?: { deadline: Promise<never>; clear: () => void; touch: () => void }
): Promise<{ text: string }> {
  let text = '';
  let finishReason: string | null = null;
  const iterator = result.stream[Symbol.asyncIterator]();
  try {
    while (true) {
      // Racing the deadline is what makes a stall observable: awaiting `next()`
      // alone parks here until the turn's wall clock fires two minutes later.
      const next = idle
        ? await Promise.race([iterator.next(), idle.deadline])
        : await iterator.next();
      if (next.done) break;
      idle?.touch();
      const part = next.value;
      if (part.type === 'error') throw part.error;
      if (part.type === 'reasoning-delta' && part.text != null && part.text.length > 0) {
        onReasoning(part.text);
      } else if (part.type === 'text-delta' && part.text != null && part.text.length > 0) {
        text += part.text;
        onText(part.text);
      } else if (part.type === 'finish') {
        finishReason = part.finishReason ?? null;
      }
    }
  } finally {
    idle?.clear();
  }
  // Anything but a clean stop means the upstream cut the generation short:
  // `length` (an output cap — the answer paths set none, so this would be the
  // provider's own), `content-filter`, `error` or `other`. Previously only
  // `length` was checked, so an abnormally terminated stream was persisted and
  // shipped as a finished answer with nothing in the logs to say otherwise.
  if (finishReason != null && finishReason !== 'stop' && finishReason !== 'tool-calls') {
    log.warn(
      `[Engine] stream ended with finishReason=${finishReason} after ${text.length} chars — the answer is likely truncated`
    );
  }
  return { text };
}
