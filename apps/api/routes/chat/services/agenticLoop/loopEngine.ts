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
import { reportBackgroundError } from '../../../../utils/reportBackgroundError.js';
import { createControlTokenFilter, stripToolControlTokens } from '../outputSanity.js';
import { isWholesaleRefusal, refusalLanguage } from '../refusalDetection.js';
import { createIdleDeadline, type IdleDeadline } from '../streamIdleDeadline.js';

import {
  createDegenerationGuard,
  DEGENERATE_FINISH_REASON,
  DEGENERATION_NOTICE,
  cutLostContent,
} from './degeneration.js';
import { DEFAULT_LOOP_BUDGET, TOOL_TIMEOUT_OVERRIDES_MS } from './types.js';

import type { LanguageModel, ModelMessage, ToolSet } from 'ai';

const log = createLogger('AgenticLoopEngine');

/**
 * How long the SYNTH stream may be completely silent before it counts as hung.
 * Matches the single-pass reasoning lane's window, since it guards the same
 * thing: a lane that accepted the request and then produced nothing.
 *
 * Das engste der drei Fenster, und es darf das sein: Synthese läuft OHNE
 * Werkzeuge, jede Stille ist also Denken oder Sterben, und Reasoning-Deltas
 * halten sie am Leben. Die Werkzeugphasen haben ihr eigenes, weiteres Fenster
 * (TOOL_PHASE_IDLE_DEADLINE_MS / mountedToolCeilingMs) — dort blockiert ein
 * laufender Aufruf den Iterator legitim.
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

/**
 * Headroom on top of the longest tool a turn could legitimately be waiting on:
 * the model still has to receive the tool result and decide the next step.
 */
const TOOL_PHASE_IDLE_SLACK_MS = 15_000;

/**
 * Fenster der Werkzeugphase, wenn NIEMAND mitzählt, welche Aufrufe laufen.
 *
 * Die Phase war lange unbewacht, weil ein laufendes Werkzeug den Iterator
 * blockiert: Stille ist dort kein Beleg für einen Hänger, und flache 20 s
 * hätten legitime Arbeit erschlagen. Das stimmt — die Antwort darauf ist aber
 * nicht „keine Uhr", sondern ein Budget aus dem, was uns überhaupt blockieren
 * kann: das längste Aufruf-Timeout unter den DIESEN ZUG gemounteten Werkzeugen
 * (`create_pdf` 90 s, `web_search` 20 s). Ein Zug ohne Erzeugungswerkzeuge
 * bekommt so ein enges Fenster, einer mit ihnen ein weites.
 *
 * Ohne jede Uhr war die wirksame Frist GreenPTs eigenes 120-s-Fetch-Timeout:
 * am 20.08.2026 sass ein Zug nach seinem letzten Werkzeug exakt 120 s stumm da
 * und endete nach 139,7 s.
 */
function mountedToolCeilingMs(tools: ToolSet): number {
  const longestTool = Object.keys(tools).reduce(
    (max, name) =>
      Math.max(max, TOOL_TIMEOUT_OVERRIDES_MS[name] ?? DEFAULT_LOOP_BUDGET.perCallTimeoutMs),
    DEFAULT_LOOP_BUDGET.perCallTimeoutMs
  );
  return longestTool + TOOL_PHASE_IDLE_SLACK_MS;
}

/**
 * Fenster, wenn `toolActivity` mitzählt.
 *
 * Der Deckel oben beschränkt die Stille auf das, was blockieren KÖNNTE; der
 * Zähler weiss, was blockiert. Da die Erzeugungswerkzeuge auf fast jedem Zug
 * gemountet sind, hiesse „könnte" in der Praxis 105 s — auch für eine Frage,
 * die nie ein Werkzeug anfasst. Läuft ein Aufruf, gilt das über `isBusy` als
 * Lebenszeichen, und übrig bleibt nur die Stille, die keiner erklärt: die Zeit
 * bis zum ersten Token einer neuen Provider-Anfrage. 45 s liegt weit darüber
 * (der Median eines ganzen Zuges lag im gemessenen Lauf bei 19 s).
 */
const TOOL_PHASE_IDLE_DEADLINE_MS = 45_000;

/** Die Werkzeugphase — planner (split) oder das eine Modell (unified) — hat die
 *  Anfrage angenommen und dann geschwiegen. */
export class ToolPhaseStallError extends Error {
  constructor(idleMs: number) {
    super(`Tool phase stream idle for ${idleMs}ms`);
    this.name = 'TimeoutError';
  }
}

/** Die Uhr der Werkzeugphase, für beide Modi identisch gestellt. */
function createToolPhaseIdle(p: LoopEngineParams): { idle: IdleDeadline; idleMs: number } {
  const idleMs = p.toolActivity ? TOOL_PHASE_IDLE_DEADLINE_MS : mountedToolCeilingMs(p.tools);
  return {
    idle: createIdleDeadline(
      idleMs,
      () => new ToolPhaseStallError(idleMs),
      () => (p.toolActivity?.inFlight() ?? 0) > 0
    ),
    idleMs,
  };
}

/**
 * Which lane stalled — the whole point of reporting it. `LanguageModel` is
 * either the id itself or a provider instance carrying one.
 *
 * Der HOST gehört dazu, nicht nur der Modellname. Am 28.08.2026 meldete der
 * Stall `mistral-small-3.2-24b-instruct-2506` — ein Name, den die Mistral-API
 * genauso trägt, während die Planer-Lane in Wahrheit auf GreenPT läuft
 * (`LOOP_PLANNER_PRIMARY`). Wer den Befund liest, sucht dann am falschen Host,
 * und in Glitchtip fallen zwei verschiedene Anbieter unter denselben Namen.
 * Die Instanz weiss es: `provider` steht in der Anbieter-Spezifikation
 * ausdrücklich „for logging purposes".
 */
function modelLabel(model: LanguageModel): string {
  if (typeof model === 'string') return model;
  const id = model.modelId ?? 'unknown';
  return model.provider ? `${model.provider}/${id}` : id;
}

/**
 * Replace the AI SDK's default `onError`, which is a bare `console.error(error)`
 * — no level, no timestamp, no service, no request id. That is where the naked
 * `DOMException [TimeoutError]` stack in the 20.08.2026 log came from, printed
 * one line above our own WARN for the same failure.
 *
 * Logging only: every stream here is drained by hand and still surfaces its
 * errors through the `error` part, so control flow is unchanged.
 */
const logStreamError =
  (phase: string) =>
  ({ error }: { error: unknown }): void => {
    log.warn(
      `[Engine] ${phase} stream error: ${error instanceof Error ? error.message : String(error)}`
    );
  };

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
  // Live am 02.08.2026: eine Rückfrage zu einer eingefügten Fallstudie löste
  // `web_search "Projekt GrünMobil Mobilitätsprojekt Pilotgebiet Budget"` aus —
  // ein Name, den es nur in dieser Unterhaltung gab. Das Web kann dazu per
  // Konstruktion nur Fremdes liefern, und genau das landete in der Antwort.
  '- PRÜFE ZUERST das Material im Gespräch: eingefügter Text, Anhänge, ein geöffnetes Dokument, Quellen aus früheren Turns. Steht die Antwort dort, antworte DARAUS und suche NICHT. Suche nur nach Fakten, die dieses Material gar nicht enthalten KANN (tagesaktuelle Zahlen, externe Ereignisse). Nach einem Namen, den es nur in diesem Gespräch gibt — ein internes Projekt, ein zitierter Entwurf, eine erfundene Fallstudie — suchst du NIE.',
  '- scrape_url NUR für URLs, die tatsächlich in Suchergebnissen erscheinen — rate keine Adressen.',
  '- Wenn der*die Nutzer*in ausdrücklich eine ERSTELLUNG wünscht (z.B. ein Sharepic, Bild, eine Präsentation, Tabelle, ein Dokument oder ein Board), MUSST du das passende Erstellungs-Tool (z.B. sharepic / generate_image / create_presentation / create_sheet / create_document / create_board) in dieser Phase aufrufen — recherchiere zuerst die Fakten, dann rufe das Tool mit dem belegten, konkreten Auftrag auf. Verweigere die Erstellung NICHT.',
  '- Schreibe in dieser Phase KEINE finale Antwort und KEINE Zusammenfassung. Du darfst vor einem Tool-Aufruf in EINEM kurzen Satz ankündigen, was du als Nächstes tust (z.B. "Ich suche jetzt im Wahlprogramm nach Windkraft."). Verlangt der Turn erkennbar MEHRERE Erstellungen (z.B. Board UND Dokument UND PDF), nenne in der ERSTEN Ankündigung gleich das ganze Vorhaben (z.B. "Ich erstelle zuerst ein Board, dann ein Dokument und ein PDF."), nicht nur den nächsten einzelnen Schritt. Sobald die Belege reichen und angeforderte Inhalte erstellt sind, beende die Tool-Aufrufe ohne weiteren Text.',
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
  forcedTool: () => string | null = () => null,
  /**
   * Text appended to the system on EVERY step once it is non-empty — a GETTER,
   * not a captured string, because it fills up mid-loop (`rezept_laden`
   * registers during the run).
   *
   * Unified mode's only channel for the recipe body. Note the branch above:
   * force-finish is the step where the model writes the answer WITHOUT tools,
   * so a recipe missing there is lost exactly where it matters. It has to land
   * in both branches, and in the plain `{}` one — hence the `system` override
   * appearing where previously nothing was returned.
   */
  extraSystem: () => string = () => '',
  /** Names the tool the FIRST step must call, when an @-mention pinned one
   *  (see {@link pinnedFirstTool}). Only consulted while `forceFirstToolCall`
   *  holds — the research ban vetoes both, and it vetoes first. */
  firstToolName: string | null = null
): ({ stepNumber }: { stepNumber: number }) => {
  toolChoice?: 'none' | 'required' | { type: 'tool'; toolName: string };
  system?: string;
} {
  return ({ stepNumber }) => {
    const extra = extraSystem();
    if (stepNumber >= maxSteps - 1 || forceFinish()) {
      return { toolChoice: 'none' as const, system: `${baseSystem}${extra}${finishSuffix}` };
    }
    // Explicit-scope MCP FOLLOW-UP: the small planner otherwise answers from
    // prose without ever calling the connector (observed: intent=mcp steps=0,
    // "Tally gibt nur die interne ID zurück" fabricated). Require a tool call on
    // the first step so it actually hits the server. Gated off for the first
    // scope turn (clarification allowed) and meta questions by the caller.
    if (forceFirstToolCall && stepNumber === 0) {
      // Eine @-Erwähnung hat ein Werkzeug benannt: `required` liesse das Modell
      // stattdessen die generische Suche rufen — den Erwähnungstext sieht es
      // gar nicht mehr.
      const choice = firstToolName
        ? ({ type: 'tool' as const, toolName: firstToolName } as const)
        : ('required' as const);
      return { toolChoice: choice, ...(extra && { system: `${baseSystem}${extra}` }) };
    }
    if (stepNumber > 0) {
      const toolName = forcedTool();
      // `required` would only guarantee SOME call — the model would happily
      // re-run the internal search that just came back empty. Name the tool.
      if (toolName)
        return {
          toolChoice: { type: 'tool' as const, toolName },
          ...(extra && { system: `${baseSystem}${extra}` }),
        };
    }
    return extra ? { system: `${baseSystem}${extra}` } : {};
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
  /**
   * Zähler der gerade LAUFENDEN Werkzeugaufrufe, gefüllt von demselben
   * Umschlag. Fehlt er, fällt die Stillstands-Uhr auf den weiteren Deckel aus
   * den gemounteten Werkzeugen zurück (`mountedToolCeilingMs`) — sonst hielte
   * sie einen legitimen 90-Sekunden-Aufruf für einen Hänger.
   */
  toolActivity?: { inFlight: () => number };
  /** System for the tool phase: base + tool-usage block (+ mcp note). */
  toolSystem: string;
  /** Builds the synthesizer system from the gathered numbered sources block. */
  buildSynthSystem: (sourcesBlock: string) => string;
  getSourcesBlock: () => string;
  /**
   * Recipe block for the TOOL phase, read fresh on every step because
   * `rezept_laden` fills it mid-loop. Split mode's writer gets the same text
   * through `buildSynthSystem` instead — the caller owns that side.
   */
  getRecipeBlock?: () => string;
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
  /**
   * Per-request provider options for the phases that run on the SELECTED model
   * — unified and synth. Today this carries exactly one thing: Mistral's
   * `reasoningEffort`.
   *
   * It has to be threaded through rather than baked into the model instance
   * because `@ai-sdk/mistral` takes the effort per request, not per client. And
   * it must not reach the GATHER phase: that runs on the fixed planner lane
   * (Mistral Small on Regolo), an OpenAI-compat client that would drop a
   * `mistral` block in silence — and the planner has no prose to think about
   * anyway.
   */
  providerOptions?: Record<string, Record<string, string>>;
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
  /** Names the tool that first step must call, when an @-mention pinned one. */
  firstToolName?: string | null;
  /** Names a specific tool the next step must call — used to turn the "web is
   *  now allowed" permission after an empty internal search into an actual
   *  fallback. Evaluated per step; null leaves the choice to the model. */
  forcedToolForStep?: () => string | null;
  onText: (delta: string) => void;
  onReasoning: (delta: string) => void;
  /** Fires when the synth stalled and the sibling lane takes over, so the
   *  client can surface the switch the same way the single-pass path does. */
  onSynthFallback?: () => void;
  /**
   * SPLIT ONLY: fires when the planner accepted the request and then sent
   * nothing until the tool-phase deadline. Separate from `onSynthFallback`
   * because there is nothing to fall back to here — the caller uses it to
   * remember the lane, not to switch mid-turn.
   *
   * The unified path deliberately does NOT fire it, and that is a scoping
   * decision rather than a gap to fill in later. Two reasons: its stream is the
   * USER's selected lane, whose health `responseStreamingService` already
   * records, so firing here would double-count one lane while the split's fixed
   * planner is recorded nowhere else; and a unified stall can follow a COMPLETE
   * answer (a `finish` part arrived, only the stream stayed open — see the
   * branch at the bottom of `streamWithTools`), where a slow verdict against a
   * lane that just answered in full would simply be wrong.
   */
  onToolPhaseStall?: () => void;
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
  /**
   * Split mode only: output-integrity check on the ACCEPTED answer (after the
   * refusal/tool-plan verdicts). Returns a system suffix describing what to fix
   * (e.g. {@link SYNTH_INVALID_JSON_RETRY_SUFFIX}) — the synth then reruns ONCE,
   * silently, and the retry replaces the answer only if it validates. Returns
   * null for a valid answer. An abnormal finishReason (`length`,
   * `content-filter`, …) triggers the same retry without this hook.
   */
  validateAnswer?: (text: string) => string | null;
  /**
   * Wahr, sobald ein Werkzeugaufruf auf eine Freigabe wartet. Wird NACH der
   * Werkzeugphase und VOR `afterGather`/Synthese geprüft: `gather()` fängt jeden
   * Fehler und würde sonst trotzdem eine Antwort schreiben — und die
   * Artefakt-Garantien würden Artefakte erzeugen, während die Person noch
   * entscheidet.
   */
  suspended?: () => boolean;
}

/** Der Zug endet, weil eine Freigabe aussteht — kein Fehler, sondern eine Pause. */
export class TurnSuspendedError extends Error {
  constructor() {
    super('Zug wartet auf eine Werkzeug-Freigabe');
    this.name = 'TurnSuspendedError';
  }
}

/**
 * Why the returned answer is not the first synth pass — carried OUT of the loop
 * purely so the turn summary can name it.
 *
 * Without it the strongest change this loop makes to what a human reads (a
 * whole answer swapped for another) is indistinguishable from a plain turn in
 * the operational logs: `recordDecision` writes to the development-only journal
 * (`utils/decisionLog.ts` bails out when no directory is configured), so on test
 * and production those entries do not exist at all.
 */
export type AnswerReplacement =
  /** Split: the invalid pass never reached the client, the retry took its place. */
  | 'validation_retry'
  /** Split: the invalid pass was already on the wire when the retry replaced it. */
  | 'validation_retry_streamed'
  /** Split: the retry did not recover, the trimmed prefix replaces the streamed spam. */
  | 'degeneration_trim'
  /** Unified: the trimmed prefix replaces the streamed spam. */
  | 'unified_degeneration'
  /** Either mode: a foreign-language refusal swapped for the canned German one. */
  | 'refusal_swap';

/** How `runAgenticLoop`'s answer relates to what was already streamed. */
export interface LoopResult {
  text: string;
  /**
   * True when a validation retry produced `text` AFTER part of the first
   * (invalid) pass had already reached the client. The caller must replace the
   * streamed answer (`completion` event) — the deltas on the wire are the
   * invalid pass, not this text.
   */
  replacedStreamed?: boolean;
  /** Set whenever `text` is not what the first pass wrote. Log-only. */
  replacement?: AnswerReplacement;
}

export async function runAgenticLoop(
  p: LoopEngineParams,
  deps: LoopDeps = defaultDeps
): Promise<LoopResult> {
  if (p.mode === 'unified') {
    const result = await streamWithTools(p, p.synthModel, deps);
    if (p.suspended?.()) throw new TurnSuspendedError();
    // Unified mode has no separate synth phase, so the artifact/edit guarantees
    // run AFTER the stream (idempotent — the hooks no-op when the model already
    // created/edited). Without this, a Mistral turn that only searched left the
    // compound sharepic/doc uncreated.
    if (p.afterGather) await p.afterGather();
    return result;
  }
  await gather(p, deps);
  if (p.suspended?.()) throw new TurnSuspendedError();
  if (p.afterGather) await p.afterGather();
  return synthesize(p, deps);
}

/** Unified mode: one model holds the tools and streams the answer. */
async function streamWithTools(
  p: LoopEngineParams,
  model: LanguageModel,
  deps: LoopDeps
): Promise<LoopResult> {
  const { idle, idleMs } = createToolPhaseIdle(p);
  const result = deps.streamText({
    model,
    system: p.toolSystem,
    messages: p.messages,
    tools: p.tools,
    stopWhen: isStepCount(p.maxSteps),
    temperature: p.temperature,
    ...(p.maxOutputTokens != null && { maxOutputTokens: p.maxOutputTokens }),
    ...(p.providerOptions != null && { providerOptions: p.providerOptions }),
    // Kombiniert, damit eine verstummte Lane wirklich abgebaut wird statt nur
    // verlassen — dieselbe Form wie in gather und synth.
    abortSignal: AbortSignal.any([p.abortSignal, idle.signal]),
    prepareStep: buildPrepareStep(
      p.toolSystem,
      FORCE_FINISH_SYSTEM_SUFFIX,
      p.maxSteps,
      p.forceFinish,
      p.forceFirstToolCall ?? false,
      p.forcedToolForStep,
      p.getRecipeBlock,
      p.firstToolName ?? null
    ),
    experimental_repairToolCall: repairToolCall,
    ...phaseTelemetry('unified'),
    onError: logStreamError('unified'),
  });
  // Der unified-Pfad hatte gar keine Steuertoken-Säuberung: er schreibt MIT
  // gemounteten Werkzeugen, also genau dort, wo das Chat-Template das Token
  // erzeugt. Dass der Ausfall bisher nur im split-Modus auffiel, heißt nur, dass
  // Mistral seltener geprüft wurde — nicht, dass der Pfad sauber ist.
  const unifiedFilter = createControlTokenFilter();
  const emitFiltered = (delta: string) => {
    const clean = unifiedFilter.push(delta);
    if (clean.length > 0) p.onText(clean);
  };
  const { text, finishReason, stalled } = await drain(
    result,
    emitFiltered,
    p.onReasoning,
    idle,
    'stop'
  );
  const tail = unifiedFilter.flush();
  if (tail.length > 0) p.onText(tail);
  if (stalled) {
    log.warn(
      `[Engine] unified stream silent for ${idleMs}ms after ${text.length} chars (finishReason=${finishReason ?? 'none'}) — tearing it down`
    );
    reportBackgroundError(new ToolPhaseStallError(idleMs), {
      job: 'agentic-unified-stall',
      model: modelLabel(model),
      idleMs,
    });
    // Ein `finish`-Part heisst: die Generierung war fertig, nur der Stream ging
    // nicht zu. Dann ist die Antwort vollständig und darf NICHT die
    // Abbruch-Fussnote des Aufrufers bekommen — genau diese Lüge produzierte
    // #2948, wo alle sechs Deckel-Züge inhaltlich richtig geantwortet hatten.
    // Ohne `finish` steht der Text mitten im Satz: als Abbruch melden.
    if (finishReason == null) throw new ToolPhaseStallError(idleMs);
  }
  if (finishReason === DEGENERATE_FINISH_REASON) {
    // Unified streams live, so the spam is already on the wire — drain has
    // trimmed the returned text back to the healthy prefix, and the caller's
    // `completion` replace (the same channel the split validation retry uses)
    // swaps what the client shows and what gets persisted.
    return { text, replacedStreamed: true, replacement: 'unified_degeneration' };
  }
  return { text };
}

/** Split phase 1: the planner runs the tool loop and fills the source registry.
 *  Its prose is NOT the answer (synthesis writes that) — but when onNarration is
 *  set we stream the planner's inter-tool sentences to the client as narration.
 *  The stream is consumed in EVERY case (even without onNarration): the AI SDK's
 *  tool loop only advances as the stream is drained. */
async function gather(p: LoopEngineParams, deps: LoopDeps): Promise<void> {
  const { idle, idleMs } = createToolPhaseIdle(p);
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
      // Combined so a stalled planner call is torn down, not merely abandoned —
      // same shape as the synth phase below.
      abortSignal: AbortSignal.any([p.abortSignal, idle.signal]),
      prepareStep: buildPrepareStep(
        gatherSystem,
        FORCE_FINISH_GATHER_SUFFIX,
        p.maxSteps,
        p.forceFinish,
        p.forceFirstToolCall ?? false,
        p.forcedToolForStep,
        p.getRecipeBlock,
        p.firstToolName ?? null
      ),
      experimental_repairToolCall: repairToolCall,
      ...phaseTelemetry('gather'),
      onError: logStreamError('gather'),
    });
    const chunker = p.onNarration ? createSentenceChunker(p.onNarration) : null;
    const iterator = result.stream[Symbol.asyncIterator]();
    try {
      while (true) {
        // Racing the deadline is what makes the stall observable: awaiting
        // `next()` alone parks here until the PROVIDER gives up.
        const next = await Promise.race([iterator.next(), idle.deadline]);
        if (next.done) break;
        // Any part counts as liveness — a tool-call/tool-result pair means the
        // loop is working, not hanging.
        idle.touch();
        const part = next.value;
        if (part.type === 'error') throw part.error;
        // text-delta becomes narration (or is drained silently when no
        // onNarration is wired). The planner's reasoning goes to the SAME
        // channel as the synth's: the split lanes ARE the thinking models, and
        // dropping it here left every non-Mistral turn with no thinking at all
        // for the whole tool phase — the client's "Gedanken" panel only ever
        // filled up once the answer was already being written.
        if (part.type === 'reasoning-delta' && part.text != null && part.text.length > 0) {
          p.onReasoning(part.text);
        } else if (part.type === 'text-delta' && part.text != null && part.text.length > 0) {
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
    // …but degrading silently is how a systematic planner outage stays
    // invisible. A stall is a health signal about the lane, not a property of
    // this one turn, so it goes to Glitchtip with the model that produced it.
    if (err instanceof ToolPhaseStallError) {
      reportBackgroundError(err, {
        job: 'agentic-gather-stall',
        model: modelLabel(p.plannerModel),
        idleMs,
      });
      // …und in das Register, das sich Lanes merkt. Ohne diese Zeile blieb der
      // Befund eine Einzelmeldung: `modelHealth` sah den Stillstand nie, also
      // galt die Lane weiter als gesund und der nächste Zug wartete dieselben
      // 45 s noch einmal ab. Genau der Preis, den das Register nicht zweimal
      // zahlen will (siehe seinen Kopfkommentar).
      p.onToolPhaseStall?.();
    }
  } finally {
    idle.clear();
  }
}

/** Answers at or below this length are candidates for the tool-plan check, and
 *  the gate holds them back until the verdict is in. Above it the answer is real
 *  prose by definition and streams through unbuffered. */
const SHORT_ANSWER_MAX_CHARS = 200;

/** A fenced block, an HTML/XML tag, or a JSON object — content, not prose. */
const MARKUP_OR_CODE_RE = /```|<\/?[a-z][\w-]*(?:\s[^>]*)?>|^\s*[[{]/i;

/**
 * The answer ANNOUNCES an action instead of being one — the second half of the
 * leaked-plan shape, for the case where the plan names no mounted tool ("I will
 * search for that now.").
 *
 * English only, and anchored to the opening. A German equivalent would have to
 * read "Ich werde …", which is also how a perfectly good short answer starts
 * ("Ich werde das kurz zusammenfassen."), and no bounded pattern separates the
 * two.
 */
const PLAN_ANNOUNCEMENT_RE =
  /^\s*(?:okay|ok|sure|alright|first|now)?[,:\s]*(?:let'?s\b|i'?ll\b|i\s+will\b|i\s+am\s+going\s+to\b|i\s+need\s+to\b|we'?ll\b|we\s+will\b|we\s+need\s+to\b)/i;

/**
 * What the user reads when the synth DECLINED the request. Distinct from the
 * caller's no-answer fallback on purpose: that one says "ich konnte nichts
 * finden … magst du die Frage anders formulieren?", which reads as a technical
 * failure and coaches the retry of a request we deliberately refused (observed
 * live on the fabricated-quote turn). A decline is an outcome, not an error.
 */
export const SYNTH_REFUSAL_TEXT =
  'Diese Anfrage setze ich nicht um — sie widerspricht den inhaltlichen Regeln des Grünerators, etwa erfundene Zitate, erfundene Quellen oder ausgrenzende Aussagen. Für ein anderes Anliegen bin ich gern da.';

/**
 * Retry nudges for an INVALID accepted answer (see `validateAnswer`). The
 * validation retry runs silently — nothing of it reaches the client unless it
 * comes back valid — so these can be blunt about what went wrong.
 */
export const SYNTH_CUTOFF_RETRY_SUFFIX =
  '\n\nWICHTIG: Dein letzter Versuch brach mitten im Satz ab. Schreibe die Antwort JETZT vollständig zu Ende — gleiche Sprache, gleiches Format, aber mit einem echten Schluss.';
export const SYNTH_INVALID_JSON_RETRY_SUFFIX =
  '\n\nWICHTIG: Dein letzter Versuch enthielt syntaktisch UNGÜLTIGES JSON. Gib das angeforderte JSON jetzt vollständig und valide aus (mit JSON.parse parsebar), ohne Kommentare und ohne abgebrochene Strukturen.';
export const SYNTH_DEGENERATE_RETRY_SUFFIX =
  '\n\nWICHTIG: Dein letzter Versuch verlor sich in endlosen Wiederholungen ("Ende", "Fertig", wiederholte Zeichenfolgen) statt aufzuhören. Schreibe die Antwort JETZT genau EINMAL, beende sie mit einem normalen Schlusssatz und gib danach NICHTS mehr aus — keine Abschlussmarker, keine Wiederholungen.';

/**
 * The retry nudge. Says nothing about LENGTH on purpose: an output format the
 * message prescribed ("Antworte in genau einer Zeile") must survive the retry,
 * and a suffix demanding "die vollständige, ausformulierte Antwort" would leave
 * the model no compliant move.
 */
export const SYNTH_RETRY_SYSTEM_SUFFIX =
  '\n\nWICHTIG: Schreibe JETZT die Antwort für die*den Nutzer*in — auf Deutsch und in dem Format, das die Nachricht verlangt. Du hast KEINE Tools und kannst keine aufrufen; kündige KEINE Tool-Aufrufe, Suchen oder Arbeitsschritte an, sondern nutze ausschließlich die oben gelieferten Quellen. Beginne direkt mit dem Inhalt.';

/**
 * Whether the synth DECLINED rather than leaked its plan. Both look alike from
 * the outside — short and English — but they need opposite handling: a leaked
 * plan is retried, a refusal must be surfaced as a refusal and never retried.
 *
 * Bounded by {@link SHORT_ANSWER_MAX_CHARS} for two reasons. Precision: a long
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
  if (trimmed.length === 0 || trimmed.length > SHORT_ANSWER_MAX_CHARS) return false;
  return isWholesaleRefusal(trimmed);
}

/**
 * Whether the synth leaked its TOOL PLAN instead of writing an answer.
 *
 * The live failure this catches: with the cross-turn tool replay in its context
 * but no tools mounted, the synth model imitated the tool-call pattern and the
 * ENTIRE answer was "Let's perform web_search." Short, plus either a mounted
 * tool's name or an opening that announces an action.
 *
 * It used to carry a third rule — short and carrying no German umlaut or
 * function word — and that rule is deliberately gone. It was a LANGUAGE test
 * doing duty as a quality test, and on 02.08.2026 it destroyed two correct
 * answers in one QA run: "ALT=45000 €; NEU=49500 €; DIFFERENZ=4500 €" and
 * "ZUSTAND=ORIGINAL; STANDORTE=75|80; SATZ=600EUR" — both exactly the format
 * the message had prescribed, both replaced with "Ich konnte dazu leider keine
 * passende Antwort finden". A guard against a made-up answer must never be able
 * to withhold a real one, so it now only recognises the one shape it was built
 * for.
 */
export function looksLikeToolPlanLeak(text: string, toolNames: readonly string[]): boolean {
  const trimmed = text.trim();
  // Empty is the caller's existing fallback case, not this one's.
  if (trimmed.length === 0 || trimmed.length > SHORT_ANSWER_MAX_CHARS) return false;
  // Needs to read as a SENTENCE — a bare token ("Erledigt", "Ja") is a
  // legitimate answer, not a leaked plan.
  if (trimmed.split(/\s+/).filter(Boolean).length < 3) return false;
  // "Gib mir den Absatz mit HTML-Tags" answers with `<p>…</p>`, and a JSON
  // answer may legitimately quote a tool name.
  if (MARKUP_OR_CODE_RE.test(trimmed)) return false;
  if (toolNames.some((name) => name.length > 3 && trimmed.includes(name))) return true;
  return PLAN_ANNOUNCEMENT_RE.test(trimmed);
}

/**
 * Holds the first {@link SHORT_ANSWER_MAX_CHARS} of the answer back so a leaked
 * plan can be discarded and retried before the client ever sees it. Once the
 * answer grows past the threshold the gate opens and every delta passes straight
 * through — so normal answers only pay a one-paragraph delay on first token, and
 * long answers stream as before.
 */
function createGatedEmitter(
  onText: (delta: string) => void,
  holdChars: number
): { push: (d: string) => void; flush: () => void; discard: () => void; isOpen: () => boolean } {
  let buffer = '';
  let open = false;
  // Der Steuertoken-Filter läuft über den GANZEN Strom, nicht nur über das
  // Haltefenster. Die frühere Fassung säuberte allein den Puffer, weil sie
  // annahm, das Token stehe immer vor der ersten Prosa — am 13.08.2026 kam es in
  // einem Turn mit Werkzeugschritt erneut durch, nachdem das Gitter offen war.
  const filter = createControlTokenFilter();
  const emit = (text: string) => {
    if (text.length > 0) onText(text);
  };
  return {
    push(delta) {
      if (open) {
        emit(filter.push(delta));
        return;
      }
      buffer += delta;
      if (buffer.length > holdChars) {
        emit(filter.push(buffer));
        buffer = '';
        open = true;
      }
    },
    flush() {
      if (buffer.length > 0) emit(filter.push(buffer));
      emit(filter.flush());
      buffer = '';
      open = true;
    },
    discard() {
      buffer = '';
    },
    // Whether anything has reached the client — decides if a validation retry
    // can swap the answer silently or must go through a `completion` replace.
    isOpen: () => open,
  };
}

/** Split phase 2: the selected model writes the answer over the gathered
 *  sources — no tools. One retry when the first pass leaks its tool plan. */
async function synthesize(p: LoopEngineParams, deps: LoopDeps): Promise<LoopResult> {
  // Synthesis runs WITHOUT tools, so it must not see the tool-call/tool-result
  // replay the gather phase needs — see `synthMessages`.
  const messages = p.synthMessages ?? p.messages;
  const baseSystem = p.buildSynthSystem(p.getSourcesBlock());
  const toolNames = Object.keys(p.tools);

  interface SynthPass {
    text: string;
    finishReason: string | null;
    flush: () => void;
    discard: () => void;
    isOpen: () => boolean;
  }

  const runPass = async (
    system: string,
    model: LanguageModel,
    /** Validation retry: collect the text without emitting anything — the
     *  caller decides afterwards whether it replaces the first pass. */
    silent = false
  ): Promise<SynthPass> => {
    const gate = createGatedEmitter(silent ? () => {} : p.onText, SHORT_ANSWER_MAX_CHARS);
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
      ...(p.providerOptions != null && { providerOptions: p.providerOptions }),
      // Combined so a stalled provider call is torn down, not just abandoned.
      // `writeAbortSignal` deliberately, NOT the turn budget — see its doc.
      abortSignal: AbortSignal.any([p.writeAbortSignal ?? p.abortSignal, idle.signal]),
      ...phaseTelemetry('synth'),
      onError: logStreamError('synth'),
    });
    try {
      const { text, finishReason } = await drain(result, gate.push, p.onReasoning, idle);
      // Stripped again on the accumulated text: `drain` collects it from the
      // SDK independently of the gate, and this copy is what gets persisted and
      // what every validator downstream reads.
      return {
        text: stripToolControlTokens(text),
        finishReason,
        flush: gate.flush,
        discard: gate.discard,
        isOpen: gate.isOpen,
      };
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
  const runPassWithFallback = async (system: string, silent = false): Promise<SynthPass> => {
    try {
      return await runPass(system, p.synthModel, silent);
    } catch (err) {
      if (!isSynthStall(err) || !p.synthFallbackModel) throw err;
      log.warn(
        `[Engine] synth lane silent for ${SYNTH_IDLE_DEADLINE_MS}ms — retrying once on the fallback lane`
      );
      p.onSynthFallback?.();
      return runPass(system, p.synthFallbackModel, silent);
    }
  };

  /** Why the answer is unusable as-is — a retry suffix, or null for valid. An
   *  abnormal finishReason means the upstream cut the stream; the caller's
   *  validators see the text alone and cannot know that. */
  const invalidReason = (pass: { text: string; finishReason: string | null }): string | null => {
    if (pass.finishReason === DEGENERATE_FINISH_REASON) {
      return SYNTH_DEGENERATE_RETRY_SUFFIX;
    }
    if (
      pass.finishReason != null &&
      pass.finishReason !== 'stop' &&
      pass.finishReason !== 'tool-calls'
    ) {
      return SYNTH_CUTOFF_RETRY_SUFFIX;
    }
    return p.validateAnswer?.(pass.text) ?? null;
  };

  /**
   * One silent re-run for an answer that is syntactically broken (cut off
   * mid-sentence, invalid JSON). The retry replaces the first pass only when it
   * is demonstrably better: non-empty, itself valid, no tool-plan leak, no
   * refusal (a long streamed answer must never be swapped for a canned decline).
   */
  const retryInvalidAnswer = async (
    first: SynthPass,
    reason: string
  ): Promise<LoopResult | null> => {
    log.warn(
      `[Engine] synth answer failed validation (${first.text.length} chars) — one silent retry`
    );
    recordDecision('loop.synth_verdict', 'invalid_retried', {
      inputs: { textLength: first.text.length, alreadyStreamed: first.isOpen() },
    });
    let retry: SynthPass;
    try {
      retry = await runPassWithFallback(`${baseSystem}${reason}`, true);
    } catch (err) {
      log.warn(
        `[Engine] validation retry failed (${err instanceof Error ? err.message : String(err)}) — keeping the first answer`
      );
      return null;
    }
    const usable =
      retry.text.trim().length > 0 &&
      !looksLikeToolPlanLeak(retry.text, toolNames) &&
      !looksLikeSynthRefusal(retry.text) &&
      invalidReason(retry) == null;
    if (!usable) {
      log.warn('[Engine] validation retry did not validate either — keeping the first answer');
      recordDecision('loop.synth_verdict', 'invalid_retry_failed', {
        inputs: { retryTextLength: retry.text.length },
      });
      return null;
    }
    const streamed = first.isOpen();
    recordDecision('loop.synth_verdict', 'invalid_replaced', {
      inputs: { retryTextLength: retry.text.length, alreadyStreamed: streamed },
    });
    // The one path here that changes the answer a human reads the MOST — a whole
    // answer swapped for another — was the only silent one: every neighbour logs
    // (both retry failures, the decline, the tool-plan leak) while the SUCCESS
    // wrote nothing outside the development-only decision journal. From the
    // operational log a swapped turn then looked exactly like an ordinary one;
    // ruling it out took a stopwatch (a second synth pass costs ~10s), which
    // stops working as soon as a retry is fast or a first pass is slow.
    log.warn(
      `[Engine] validation retry replaced the answer (${first.text.length} → ${retry.text.length} chars, ` +
        `${streamed ? 'already streamed — client sees a completion replace' : 'not yet streamed — swapped silently'})`
    );
    if (!streamed) {
      // The invalid pass never reached the client — swap it silently.
      first.discard();
      p.onText(retry.text);
      return { text: retry.text, replacement: 'validation_retry' };
    }
    // The invalid pass is already on the wire; the caller must replace it.
    return {
      text: retry.text,
      replacedStreamed: true,
      replacement: 'validation_retry_streamed',
    };
  };

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
    return { text: SYNTH_REFUSAL_TEXT, replacement: 'refusal_swap' };
  }
  if (!looksLikeToolPlanLeak(first.text, toolNames)) {
    // A degenerate pass earns the retry even when the trim left NOTHING — spam
    // from the first token is the most complete failure, exactly where a fresh
    // pass helps most. Plain-empty answers stay the caller's fallback case.
    const reason =
      first.text.trim().length > 0 || first.finishReason === DEGENERATE_FINISH_REASON
        ? invalidReason(first)
        : null;
    if (reason != null && !(p.writeAbortSignal ?? p.abortSignal).aborted) {
      const replaced = await retryInvalidAnswer(first, reason);
      if (replaced) return replaced;
    }
    recordDecision('loop.synth_verdict', 'accepted', {
      inputs: { textLength: first.text.length },
    });
    // Captured BEFORE flush() — flush opens the gate unconditionally, so
    // afterwards isOpen() no longer says whether the CLIENT saw anything.
    const spamReachedWire = first.isOpen();
    first.flush();
    if (first.finishReason === DEGENERATE_FINISH_REASON && spamReachedWire) {
      // The retry didn't recover, so the trimmed text stands — but the wire
      // still carries the degenerate tail drain cut off. Replace it.
      return { text: first.text, replacedStreamed: true, replacement: 'degeneration_trim' };
    }
    return { text: first.text };
  }

  log.warn(
    `[Engine] synth announced a tool plan instead of answering (${first.text.length} chars: ${JSON.stringify(
      first.text.trim().slice(0, 80)
    )}) — retrying once`
  );
  recordDecision('loop.synth_verdict', 'tool_plan_retried', {
    inputs: { textLength: first.text.length },
  });
  const retry = await runPassWithFallback(`${baseSystem}${SYNTH_RETRY_SYSTEM_SUFFIX}`);
  if (retry.text.trim().length === 0 || looksLikeToolPlanLeak(retry.text, toolNames)) {
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

type StreamPart = { type: string; text?: string; error?: unknown; finishReason?: string };

interface Drainable {
  stream: AsyncIterable<StreamPart>;
}

async function drain(
  result: Drainable,
  onText: (d: string) => void,
  onReasoning: (d: string) => void,
  /** Optional stall guard. Every chunk — text OR reasoning — counts as liveness,
   *  so a thinking model is never mistaken for a hung one. */
  idle?: { deadline: Promise<never>; clear: () => void; touch: () => void },
  /**
   * Was ein Stillstand bedeutet. `throw` (Standard) für die Synth-Phase, die
   * darauf ihre Geschwister-Lane startet. `stop` für die Werkzeugphase: dort
   * ist das bereits Geschriebene weiter brauchbar, also endet nur das Auslesen
   * und der Aufrufer entscheidet — deshalb kommt `stalled` mit zurück statt
   * eines Fehlers, der den Text mitnähme.
   */
  onStall: 'throw' | 'stop' = 'throw'
): Promise<{ text: string; finishReason: string | null; stalled: boolean }> {
  let text = '';
  let finishReason: string | null = null;
  let stalled = false;
  const degeneration = createDegenerationGuard();
  const iterator = result.stream[Symbol.asyncIterator]();
  try {
    while (true) {
      // Racing the deadline is what makes a stall observable: awaiting `next()`
      // alone parks here until the turn's wall clock fires two minutes later.
      let next: IteratorResult<StreamPart>;
      if (idle) {
        try {
          next = await Promise.race([iterator.next(), idle.deadline]);
        } catch (err) {
          // Nur der eigene Stillstands-Fehler wird hier abgefangen; ein echter
          // Stream-Fehler aus `next()` muss durchgereicht werden.
          if (onStall === 'throw' || !(err instanceof ToolPhaseStallError)) throw err;
          stalled = true;
          // swallow-ok: Abbau eines bereits verlassenen, verstummten Streams
          void Promise.resolve(iterator.return?.()).catch(() => {});
          break;
        }
      } else {
        next = await iterator.next();
      }
      if (next.done) break;
      idle?.touch();
      const part = next.value;
      if (part.type === 'error') throw part.error;
      if (part.type === 'reasoning-delta' && part.text != null && part.text.length > 0) {
        onReasoning(part.text);
      } else if (part.type === 'text-delta' && part.text != null && part.text.length > 0) {
        text += part.text;
        onText(part.text);
        // A model that cannot stop ("Ende. Fertig. 😊" loops, digit/smiley runs)
        // has no limit on our side to run into — the answer paths deliberately
        // set no maxOutputTokens, so without this it streams until the PROVIDER's
        // cap fires (live 12.08.2026: 32.826 chars over 263s). Cut it here, keep
        // the healthy prefix, and let the caller's finishReason handling take
        // over (split: silent retry; unified: completion replace).
        if (degeneration.check(text)) {
          // The guard's own cut: when the long-range detector fired it knows
          // the exact offset where the repetition began. No backscan can
          // reconstruct that once the spam changed shape mid-run — live
          // 12.08.2026 it removed 1.800 of 45.711 chars for exactly that reason.
          const cut = degeneration.cutAt(text);
          log.warn(
            `[Engine] repetitive degeneration detected after ${text.length} chars — aborting the stream, keeping ${cut}`
          );
          finishReason = DEGENERATE_FINISH_REASON;
          // The kept prefix says it was cut. Both answer paths replace what the
          // client shows with this string (unified always, split when the
          // silent retry fails), so the note travels with the trim instead of
          // the trim passing for a finished answer. A successful split retry
          // discards this text wholesale — and with it the note, correctly.
          const kept = text.slice(0, cut).trimEnd();
          // ...but only when there is something to warn about. Removing a run
          // of dashes leaves a COMPLETE answer, and "may be incomplete" under
          // it would be a false alarm about a correct result.
          const lost = cutLostContent(kept, text.slice(cut));
          text = kept.length > 0 ? (lost ? `${kept}\n\n${DEGENERATION_NOTICE}` : kept) : '';
          // Best-effort teardown so the upstream stops billing us for spam.
          // swallow-ok: cleanup of an already-abandoned degenerate stream
          void Promise.resolve(iterator.return?.()).catch(() => {});
          break;
        }
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
  // Degeneration has its own log line above.
  if (
    finishReason != null &&
    finishReason !== 'stop' &&
    finishReason !== 'tool-calls' &&
    finishReason !== DEGENERATE_FINISH_REASON
  ) {
    log.warn(
      `[Engine] stream ended with finishReason=${finishReason} after ${text.length} chars — the answer is likely truncated`
    );
  }
  return { text, finishReason, stalled };
}
