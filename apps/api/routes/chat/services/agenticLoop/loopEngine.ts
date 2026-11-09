/**
 * Agentic loop engine, extracted so the "which model runs which phase" logic is
 * unit-testable in isolation (streamText/generateText are injected; see
 * loopEngine.vitest.ts).
 *
 * One model drives the tools AND writes the answer in one streamed pass
 * (`streamWithTools`), over a lane chain that switches only before any tool
 * call or output (`runLaneChain`). A tool-less writer (`writeRepair`) re-writes
 * an answer that came out unusable (`repairAnswer`). The former split
 * mode (planner gathers, writer answers) was removed in #5441.
 *
 * Tool cards, guards, timeouts, truncation and step recording are already baked
 * into the wrapped `tools` (wrapToolsForLoop) and fire during the tool phase.
 */
import {
  streamText as streamTextReal,
  generateText as generateTextReal,
  isStepCount,
  InvalidToolInputError,
  RetryError,
  ToolChoiceViolationError,
} from 'ai';

import { NO_CAPABILITY_DENIAL_RULE } from '../../../../agents/langgraph/ChatGraph/nodes/artifactInventory.js';
import { classifyProviderError } from '../../../../services/providers/providerErrors.js';
import { buildAiTelemetry } from '../../../../services/telemetry/langfuseTelemetry.js';
import { recordDecision } from '../../../../utils/decisionJournal.js';
import { createLogger } from '../../../../utils/logger.js';
import { reportBackgroundError } from '../../../../utils/reportBackgroundError.js';
import { createControlTokenFilter, stripToolControlTokens } from '../outputSanity.js';
import { prefillAllowanceForModel } from '../prefillAllowance.js';
import { isWholesaleRefusal, refusalLanguage } from '../refusalDetection.js';
import { createIdleDeadline, type IdleDeadline } from '../streamIdleDeadline.js';

import { CAPABILITY_NOTE_TEXT } from './artifactNotes.js';
import {
  createDegenerationGuard,
  DEGENERATE_FINISH_REASON,
  trimDegenerate,
} from './degeneration.js';
import { toolsForProvider } from './providerTools.js';
import { findSourceEchoCut } from './sourceRegistry.js';
import { ANSWER_CONCRETELY_RULE } from './synthPrompt.js';
import { DEFAULT_LOOP_BUDGET, TOOL_TIMEOUT_OVERRIDES_MS } from './types.js';

import type { LanguageModel, ModelMessage, SystemModelMessage, ToolSet } from 'ai';

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
class SynthStallError extends Error {
  constructor(idleMs: number) {
    super(`Synth stream idle for ${idleMs}ms`);
    this.name = 'TimeoutError';
  }
}

function isSynthStall(err: unknown): err is SynthStallError {
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

/**
 * Frist bis zum ERSTEN Lebenszeichen eines Planer-Versuchs, solange danach
 * noch eine Ausweich-Lane wartet.
 *
 * Vor dem ersten Aufruf ist jede Stille ein Ausfall: es läuft kein Werkzeug,
 * und der Planer antwortet sonst in 1–3 s (Probe 29.09.2026: p90 963 ms; am
 * 21.10.2026 unter neunfacher Parallellast bis 11 s). Mit den 45 s oben wartete
 * der Zug aus #4785 58 s auf seine erste Antwort. Die letzte Stufe bekommt die
 * kurze Frist nicht: ohne Ausweich gibt es nichts, wohin sie umspringen könnte.
 *
 * 8 s statt 15 s seit 06.11.2026 (#5399): die nächste Stufe hinter Melious
 * `:balanced` ist `:speed` — dieselben Gewichte, erstes Token 1,5–2 s. Reisst
 * `:balanced` die Frist unter Last, ist der Wechsel also kein Qualitätsverlust,
 * sondern genau das Gewollte. Der Prefill-Zuschlag (`prefillAllowanceForModel`)
 * kommt für lange Prompts weiter oben drauf.
 */
const FIRST_RESPONSE_DEADLINE_MS = 8_000;

/** Stream-Teile, die das SDK selbst erzeugt, bevor der Anbieter geantwortet hat. */
/** finishReason, wenn das Modell einen erzwungenen Werkzeugschritt ignorierte. */
const TOOL_CHOICE_VIOLATION_FINISH = 'tool_choice_violation';

const SDK_PREAMBLE_PARTS = new Set(['start', 'start-step']);

/** Das Loop-Modell hat die Anfrage angenommen und dann geschwiegen. */
export class ToolPhaseStallError extends Error {
  constructor(readonly idleMs: number) {
    super(`Tool phase stream idle for ${idleMs}ms`);
    this.name = 'TimeoutError';
  }
}

/** Die Uhr der Werkzeugphase. `prefillMs`
 *  liegt auf dem ganzen Fenster, nicht nur dem ersten: jeder Schritt ist eine
 *  neue Anfrage mit dem ganzen Verlauf, und ihr Einlesen schweigt jedes Mal
 *  (prefillAllowance.ts). */
function createToolPhaseIdle(
  p: LoopEngineParams,
  prefillMs: number
): { idle: IdleDeadline; idleMs: number } {
  const idleMs =
    (p.toolActivity ? TOOL_PHASE_IDLE_DEADLINE_MS : mountedToolCeilingMs(p.tools)) + prefillMs;
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
 * genauso trägt, während die Planer-Lane damals in Wahrheit auf GreenPT lief.
 * Wer den Befund liest, sucht dann am falschen Host,
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
const phaseTelemetry = (phase: 'unified' | 'synth') => {
  const telemetry = buildAiTelemetry(`chat-graph.agentic.${phase}`);
  return telemetry ? { experimental_telemetry: telemetry } : {};
};

/** Injected via prepareStep's `system` override on the force-finish step
 *  (LobeHub pattern: strip tools AND tell the model why, instead of a bare
 *  toolChoice:'none' it can't interpret). */
export const FORCE_FINISH_SYSTEM_SUFFIX =
  '\n\nWICHTIG: Du hast das Schritt-Limit erreicht. Rufe KEINE Tools mehr auf. Fasse zusammen, was du herausgefunden hast, und gib JETZT die endgültige Antwort auf Basis der vorhandenen Belege. Wenn etwas offen bleibt, sag ehrlich, was fehlt.';
/**
 * The finish step after the turn's artefact exists — not a step limit. The
 * limit wording („Fasse zusammen, was du herausgefunden hast") made a pure
 * order end on a second, empty success line („Tabelle erstellt: Erfolg.").
 */
export const ARTIFACT_FINISH_SYSTEM_SUFFIX =
  '\n\nWICHTIG: Das Artefakt dieses Turns ist erstellt und der*dem Nutzer*in als Karte angezeigt (siehe Werkzeugergebnis). Rufe KEINE Tools mehr auf. Antworte kurz: nenne in einem Satz, was entstanden ist, und schließe nicht mit einer zweiten Erfolgsmeldung. Meldet das Werkzeugergebnis Probleme, nenne sie.';
/** Tool rules of the loop. Every rule line is preceded by a newline. */
export const TOOL_USE_RULES: string = [
  '',
  '- Für grüne Positionen, Programme und Beschlüsse ZUERST gruenerator_search (interne Dokumente). Nutze die Websuche NUR, wenn die internen Dokumente die Frage nicht abdecken oder es um tagesaktuelle Ereignisse/Zahlen geht — NICHT parallel oder auf Vorrat. Bei Fragen OHNE Parteibezug (Allgemeinwissen, Personen, Ereignisse, Zahlen) suchst du DIREKT im Web — gruenerator_search kennt ausschließlich Parteidokumente.',
  '- Verlass dich NICHT auf dein eigenes Wissen — belege mit Tools. Aber STOPPE, sobald die ersten 1–2 Treffer die Frage beantworten; sammle nicht auf Vorrat und wiederhole keine ähnlichen Suchen.',
  // Live am 02.08.2026: eine Rückfrage zu einer eingefügten Fallstudie löste
  // `web_search "Projekt GrünMobil Mobilitätsprojekt Pilotgebiet Budget"` aus —
  // ein Name, den es nur in dieser Unterhaltung gab. Das Web kann dazu per
  // Konstruktion nur Fremdes liefern, und genau das landete in der Antwort.
  '- PRÜFE ZUERST das Material im Gespräch: eingefügter Text, Anhänge, ein geöffnetes Dokument, Quellen aus früheren Turns. Steht die gefragte Angabe dort wirklich (nicht nur ihr Thema), antworte DARAUS und suche NICHT. Suche nur nach Fakten, die dieses Material gar nicht enthalten KANN (tagesaktuelle Zahlen, externe Ereignisse). Nach einem Namen, den es nur in diesem Gespräch gibt — ein internes Projekt, ein zitierter Entwurf, eine erfundene Fallstudie — suchst du NIE.',
  '- scrape_url NUR für URLs, die tatsächlich in Suchergebnissen erscheinen — rate keine Adressen.',
  '- Wenn der*die Nutzer*in ausdrücklich eine ERSTELLUNG wünscht (z.B. ein Sharepic, Bild, eine Präsentation, Tabelle, ein Dokument, ein Explainable oder ein Board), MUSST du das passende Erstellungs-Tool (z.B. sharepic / generate_image / create_presentation / create_sheet / create_document / create_explainable / create_board) in dieser Phase aufrufen — recherchiere zuerst die Fakten, dann rufe das Tool mit dem belegten, konkreten Auftrag auf. Verweigere die Erstellung NICHT.',
].join('\n');

/** What the loop model is told about writing the answer (the repair writer gets
 *  the same through `buildRepairSystem`). */
export const UNIFIED_WRITER_RULES: string = [
  '',
  '',
  'ANTWORTPHASE (brauchst du keine Tools mehr, schreibst du selbst die Antwort):',
  ANSWER_CONCRETELY_RULE,
  NO_CAPABILITY_DENIAL_RULE,
  CAPABILITY_NOTE_TEXT.trim(),
  'Steht in einem Werkzeugergebnis ein Feld `fuerSchreiber` oder `antwortregel`, ist das eine verbindliche Anweisung an deine Antwort — beachte sie vor allem anderen.',
].join('\n');

export const LOOP_SUFFIX = TOOL_USE_RULES + UNIFIED_WRITER_RULES;

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

/** Was `prepareStep` von einem gelaufenen Schritt liest — ein Ausschnitt von
 *  `StepResult`, damit die Tests ohne das SDK auskommen. */
export interface PreparedStepView {
  content: ReadonlyArray<{ type: string; toolName?: string; output?: unknown; error?: unknown }>;
}

const errorText = (value: unknown): string =>
  value instanceof Error
    ? value.message
    : typeof value === 'string'
      ? value
      : JSON.stringify(value);

/**
 * Hat JEDER Werkzeugaufruf dieses Schritts gescheitert, die Nudge für den
 * nächsten — sonst null. Gescheitert heißt: ein `tool-error` (geworfen) oder
 * ein Ergebnis `{ error }` (so meldet `wrapToolsForLoop` jeden Fehlschlag).
 *
 * Live 23.09.2026: `notebook_quellen` scheiterte mit „Kein Notebook ausgewählt
 * — gib notebookId an (aus notebooks action="list", Feld ref)", der Planer
 * hörte nach diesem einen Schritt auf, und die Antwort behauptete, eine solche
 * Funktion gebe es nicht. Die Meldung sagte, wie es weitergeht; gelesen hat sie
 * niemand. Kein erzwungener Aufruf (`toolChoice`): ist der Fehler nicht zu
 * beheben (Dienst down), soll das Modell ehrlich antworten dürfen.
 */
function failedStepRetryNudge(step: PreparedStepView | null): string | null {
  if (!step) return null;
  const outcomes = step.content.flatMap((part) => {
    if (part.type === 'tool-error') {
      return [{ toolName: part.toolName, error: part.error, guarded: false }];
    }
    if (part.type !== 'tool-result') return [];
    const output =
      part.output && typeof part.output === 'object'
        ? (part.output as { error?: unknown; guard?: unknown })
        : null;
    return [
      { toolName: part.toolName, error: output?.error ?? null, guarded: output?.guard != null },
    ];
  });
  // Eine Wächter-Absage (`wrapToolsForLoop`, Feld `guard`) ist eine Weisung
  // („hör auf", „andere Suche") — keine Nudge, die ihr widerspricht.
  if (outcomes.length === 0 || outcomes.some((o) => o.error == null || o.guarded)) return null;
  const lines = outcomes
    .map((o) => `- ${o.toolName ?? 'Werkzeug'}: ${errorText(o.error).slice(0, 300)}`)
    .join('\n');
  return (
    `\n\nDER LETZTE WERKZEUGAUFRUF IST FEHLGESCHLAGEN:\n${lines}\n` +
    'Lies die Fehlermeldung. Sagt sie, was fehlt oder falsch war (z. B. eine Angabe, die ein anderes Werkzeug liefert), dann korrigiere den Aufruf und versuche es JETZT genau einmal erneut. ' +
    'Behaupte NIE, dir fehle dafür eine Funktion oder ein Werkzeug — das Werkzeug gibt es, nur dieser Aufruf ist fehlgeschlagen. ' +
    'Lässt sich der Fehler nicht beheben, sag ehrlich, dass der Aufruf fehlgeschlagen ist und warum.'
  );
}

/**
 * Der Rückblick auf frühere Gespräche ändert sich mit jeder Frage. Als eigene
 * System-Nachricht HINTER dem Prompt bleibt dessen Prefix (samt Werkzeugen, die
 * der Anbieter danach rendert) cachebar. Direkt hinter der ersten, nie nach einer
 * Assistenten-Nachricht: GreenPT lehnt das ab.
 */
export function withTurnContext(
  system: string,
  turnContext: string | null | undefined
): string | SystemModelMessage[] {
  if (!turnContext) return system;
  return [
    { role: 'system', content: system },
    { role: 'system', content: turnContext },
  ];
}

/** Ein `system` aus prepareStep ERSETZT das des Aufrufs — also ebenfalls einpacken. */
function withTurnContextOnSteps<
  F extends (...args: never[]) => { system?: string | SystemModelMessage[] },
>(prepare: F, turnContext: string | null | undefined): F {
  if (!turnContext) return prepare;
  return ((...args: Parameters<F>) => {
    const step = prepare(...args);
    return step.system === undefined || typeof step.system !== 'string'
      ? step
      : { ...step, system: withTurnContext(step.system, turnContext) };
  }) as F;
}

/** On the last step (or when forceFinish trips) strip tools AND explain why
 *  via a per-step system override. */
export function buildPrepareStep(
  baseSystem: string,
  /** A getter: the wording depends on WHY the step finishes (artefact vs. limit). */
  finishSuffix: string | (() => string),
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
   * The loop model's only channel for the recipe body. Note the branch above:
   * force-finish is the step where the model writes the answer WITHOUT tools,
   * so a recipe missing there is lost exactly where it matters. It has to land
   * in both branches, and in the plain `{}` one — hence the `system` override
   * appearing where previously nothing was returned.
   */
  extraSystem: () => string = () => '',
  /** Names the tool the FIRST step must call, when an @-mention pinned one
   *  (see {@link pinnedFirstTool}). Only consulted while `forceFirstToolCall`
   *  holds — the research ban vetoes both, and it vetoes first. */
  firstToolName: string | null = null,
  /**
   * Welche Werkzeuge dieser Schritt MITSCHICKT, oder `undefined` für alle
   * montierten (siehe toolScope.ts). Ein GETTER, aus demselben Grund wie
   * `extraSystem`: die Menge wächst mitten im Lauf, wenn das Modell einen Lader
   * ruft. Ein einmal eingefangenes Array wäre der Stand von Schritt 0.
   */
  activeTools: (steps?: ReadonlyArray<PreparedStepView>) => readonly string[] | undefined = () =>
    undefined,
  /**
   * Welche Werkzeuge der ERZWUNGENE erste Schritt sieht (`forcedFirstStepTools`),
   * oder `null` für den vollen Umfang. Nur auf Schritt 0 gelesen, und nur
   * wenn kein Werkzeug benannt ist — ein benanntes trägt sich selbst.
   */
  firstStepTools: readonly string[] | null = null
): ({ stepNumber, steps }: { stepNumber: number; steps?: ReadonlyArray<PreparedStepView> }) => {
  toolChoice?: 'none' | 'required' | { type: 'tool'; toolName: string };
  system?: string;
  activeTools?: readonly string[];
} {
  // Eine Nudge pro Zug: scheitert auch der zweite Versuch, bleibt es dabei.
  let retryNudged = false;
  return ({ stepNumber, steps }) => {
    const active = activeTools(steps);
    // Auf JEDEM Zweig, nicht nur dem letzten: `toolChoice: 'none'` unterdrückt
    // den Aufruf, nicht die Definitionen — der Katalog wird auch auf dem
    // Schlussschritt mitgeschickt und bezahlt.
    const scope = active ? { activeTools: active } : {};
    /**
     * Ein BENANNTER Schritt schickt NUR das benannte Werkzeug mit. Das deckt
     * zweierlei: die Definition geht mit, auch wenn der Umfang sie
     * zurückgestellt hat (sonst verlangt der Schritt einen Aufruf ohne
     * Definition), und kein anderes Werkzeug steht daneben.
     *
     * Das Zweite ist der Stillstand vom 28.10.2026: `tool_choice` mit Namen über
     * den vollen Katalog (25 Werkzeuge, ~44k Zeichen Schemata) liess Gemma 4 bei
     * Cortecs 26 214 unsichtbare Tokens bis `finish_reason: length` erzeugen
     * (60 s, kein Delta) und bei Melious nach ~30 s mit „malformed" scheitern —
     * jedes Mal, sobald der Prompt das Modell zu einem anderen ersten Werkzeug
     * zog (Bürger*innen-Mail: „Schritt 1: gruenerator_search"). GreenPT setzt
     * den Namen gar nicht durch und rief `web_search`. Mit nur dem benannten
     * Werkzeug antworteten alle drei in 2–5 s. Mehr als dieses eine kann der
     * Schritt ohnehin nicht rufen; die anderen Definitionen sind nur Ablenkung.
     * Die Absicherung sitzt hier, weil jeder Zwang durch diesen Trichter läuft:
     * `forcedTool`, `firstToolName`, was danach kommt.
     */
    const onlyTool = (name: string) => ({ activeTools: [name] as readonly string[] });
    /**
     * Der Systemprompt zieht das Modell sonst zu einem Werkzeug, das dieser
     * Schritt nicht mehr führt: „Fragen nach Reden gehen immer an
     * `bundestag_reden`, nicht an `bundestag`" bei erzwungenem `bundestag` —
     * Stillstand vom 28.10.2026 („Wann hat Katrin Uhlig … gesprochen?"):
     * Cortecs und Melious schwiegen je 15 s, GreenPT rief nichts. Gleiche Frage
     * mit gestrichener Zeile oder mit diesem Hinweis: Aufruf nach 2–3 s. Der
     * Hinweis steht am Ende, wo er die Zuordnung weiter oben überstimmt.
     */
    const namedStepNote = (name: string) =>
      `\n\n## DIESER SCHRITT\nDein einziger Aufruf in diesem Schritt ist \`${name}\`. Andere Werkzeuge aus der Zuordnung oben gelten erst für die folgenden Schritte; sie stehen diesem Schritt nicht zur Wahl.`;
    if (stepNumber >= maxSteps - 1 || forceFinish()) {
      return {
        toolChoice: 'none' as const,
        system: `${baseSystem}${extraSystem()}${typeof finishSuffix === 'function' ? finishSuffix() : finishSuffix}`,
        ...scope,
      };
    }
    let nudge = '';
    if (stepNumber > 0 && !retryNudged) {
      nudge = failedStepRetryNudge(steps?.at(-1) ?? null) ?? '';
      if (nudge) retryNudged = true;
    }
    const extra = `${extraSystem()}${nudge}`;
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
      const system = `${baseSystem}${extra}${firstToolName ? namedStepNote(firstToolName) : ''}`;
      return {
        toolChoice: choice,
        ...(system !== baseSystem && { system }),
        ...(firstToolName
          ? onlyTool(firstToolName)
          : firstStepTools
            ? { activeTools: firstStepTools }
            : scope),
      };
    }
    if (stepNumber > 0) {
      const toolName = forcedTool();
      // `required` would only guarantee SOME call — the model would happily
      // re-run the internal search that just came back empty. Name the tool.
      if (toolName)
        return {
          toolChoice: { type: 'tool' as const, toolName },
          system: `${baseSystem}${extra}${namedStepNote(toolName)}`,
          ...onlyTool(toolName),
        };
    }
    return extra ? { system: `${baseSystem}${extra}`, ...scope } : { ...scope };
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
  /** Runs the tool loop and writes the user-facing answer in one stream. */
  model: LanguageModel;
  /** Repair writer only: sibling lane, tried once when the tool-less writer
   *  goes silent or returns nothing. Set by `repairAnswer` from `repairFallback`. */
  repairSiblingModel?: LanguageModel;
  /** The tool-less writer that re-writes a failed answer (`LOOP_SYNTH_PRIMARY`
   *  chain). Omit and a failed answer stays as it was. */
  repairModel?: LanguageModel;
  /** Sibling lane of `repairModel` (`LOOP_SYNTH_FALLBACK`). */
  repairFallback?: LanguageModel;
  /** Whether the turn created or edited an artifact. An empty answer after one
   *  is confirmed by the caller, not repaired. Read AFTER `ensureOwedTools`, which
   *  may still produce one. */
  producedArtifact?: () => boolean;
  /** Tried in order when `model` rejects or stays silent before any tool
   *  call or output (see `runLaneChain`). Empty or omitted, the error
   *  surfaces. */
  fallbackModels?: readonly LanguageModel[];
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
  /** Per-turn recall, sent as a second system message (see {@link withTurnContext}). */
  turnContext?: string | null;
  /** Builds the repair writer's system from the numbered sources block. */
  buildRepairSystem: (sourcesBlock: string) => string;
  getSourcesBlock: () => string;
  /**
   * Recipe block for the TOOL phase, read fresh on every step because
   * `rezept_laden` fills it mid-loop. The repair writer gets the same text
   * through `buildRepairSystem` — the caller owns that side.
   */
  getRecipeBlock?: () => string;
  messages: ModelMessage[];
  /** The message list the tool-less repair writer writes over. Defaults to
   *  `messages`. The caller passes the history WITHOUT the cross-turn tool
   *  replay here — the writer runs with no tools, and a history full of
   *  tool-call/tool-result messages primes the model to imitate the pattern in
   *  prose instead of answering (observed live: the whole answer was
   *  "Let's perform web_search."). */
  repairMessages?: ModelMessage[];
  /** The writer history for `repairSiblingModel`, built only when
   *  the fallback fires, from the system prompt that pass sends — re-pruned
   *  when its window is smaller (#4201, #4204). Defaults to the synth messages. */
  repairSiblingMessages?: (system: string) => ModelMessage[];
  maxSteps: number;
  temperature: number;
  /** Optional output cap. Omitted on answer paths (OpenWebUI-style: the
   *  provider/context window is the backstop) — explicit caps truncated
   *  think-lane answers mid-sentence because reasoning tokens count too. */
  maxOutputTokens?: number;
  /**
   * Per-request provider options for the loop and the repair writer. Today
   * this carries Mistral's `reasoningEffort` and `promptCacheKey`; non-Mistral
   * clients ignore the `mistral` block.
   *
   * It has to be threaded through rather than baked into the model instance
   * because `@ai-sdk/mistral` takes the effort per request, not per client.
   */
  providerOptions?: Record<string, Record<string, string>>;
  /** The absolute turn ceiling plus request and approval gates — never the
   *  soft tool budget, which ends tool work via `forceFinish` (loopBudget.ts). */
  abortSignal: AbortSignal;
  /** Extra force-finish trigger (e.g. an image was generated). */
  forceFinish: () => boolean;
  /** Force a tool call on the first step (explicit-scope MCP follow-ups). */
  forceFirstToolCall?: boolean;
  /**
   * Welche der montierten Werkzeuge mitgeschickt werden — `undefined` heisst
   * alle, also das Verhalten vor `toolScope.ts`. Getter: eine zurückgestellte
   * Gruppe kann sich mitten im Lauf öffnen.
   */
  activeTools?: (steps?: ReadonlyArray<PreparedStepView>) => readonly string[] | undefined;
  /** Names the tool that first step must call, when an @-mention pinned one. */
  firstToolName?: string | null;
  /** Tool set the forced first step sees (`forcedFirstStepTools`); null = full scope. */
  firstStepTools?: readonly string[] | null;
  /** Names a specific tool the next step must call — used to turn the "web is
   *  now allowed" permission after an empty internal search into an actual
   *  fallback. Evaluated per step; null leaves the choice to the model. */
  forcedToolForStep?: () => string | null;
  onText: (delta: string) => void;
  onReasoning: (delta: string) => void;
  /** The repair writer's sibling took over because the writer stalled or came
   *  back without a word. The caller remembers the writer lane (`modelHealth`). */
  onRepairWriterUnhealthy?: (grund: 'synth_stall' | 'synth_empty') => void;
  /**
   * A lane of the tool phase's ladder failed in a way that says something
   * about the LANE, not about this request: it went silent, or the provider
   * was down or rate-limited. The caller uses it to remember the lane
   * (`modelHealth`), not to switch — the ladder switches by itself.
   *
   * `laneIndex` is the position in the ladder `[model,
   * ...fallbackModels]`. EVERY stage reports, not only the first: until 06.11.2026 only the
   * turn's own planner lane was recorded, so a stalled fallback stage stayed
   * first choice behind it and the next turn paid its deadline again.
   *
   * Not reported: `invalid_request` (an overfull context window is our request,
   * not a sick model — it would block the lane for everyone), and a lane that
   * already left a trace: a stall can follow a COMPLETE answer (a `finish` part
   * arrived, only the stream stayed open — see the end of `streamWithTools`).
   */
  onLaneUnhealthy?: (laneIndex: number, grund: LaneUnhealthyReason) => void;
  /** Runs AFTER the stream: the net for an owed artifact or edit the model did
   *  not call even under the named step (`owedToolName`), e.g. on a host that
   *  ignores `tool_choice`. Idempotent — no-op when the tool already ran. */
  ensureOwedTools?: () => Promise<boolean | void>;
  /**
   * Output-integrity check on the answer (after the refusal/tool-plan
   * verdicts). Returns a system suffix describing what to fix (e.g.
   * {@link SYNTH_INVALID_JSON_RETRY_SUFFIX}) — a non-null result sends the
   * answer to the repair writer, which reruns ONCE with that suffix. Returns
   * null for a valid answer. An abnormal finishReason (`length`,
   * `content-filter`, …) triggers the same retry without this hook.
   */
  validateAnswer?: (text: string) => string | null;
  /**
   * Wahr, sobald ein Werkzeugaufruf auf eine Freigabe wartet. Wird NACH der
   * Werkzeugphase und VOR `ensureOwedTools` und Reparatur geprüft: sonst würden
   * die Artefakt-Garantien Artefakte erzeugen, während die Person noch
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
  /** The trimmed prefix replaces the streamed spam. */
  | 'unified_degeneration'
  /** The answer before the copied source register replaces the stream. */
  | 'unified_source_echo'
  /** The tool-less writer re-wrote an empty, invalid, leaked or cut-off answer. */
  | 'unified_repair'
  /** A foreign-language refusal swapped for the canned German one (needs a
   *  repair lane). */
  | 'refusal_swap';

/** How `runAgenticLoop`'s answer relates to what was already streamed. */
export interface LoopResult {
  text: string;
  /**
   * Set whenever `text` is not what was streamed. The caller must then replace
   * the streamed answer (`completion` event); the turn summary names it.
   */
  replacement?: AnswerReplacement;
}

export type UnifiedRepairReason =
  'empty' | 'invalid' | 'plan_leak' | 'degenerate' | 'abnormal_finish';

type StreamWithToolsResult = LoopResult & { finishReason: string | null };

/** Why a unified answer is unusable as written. An empty answer after an artifact is NOT one:
 *  the caller confirms the artifact instead. */
function unifiedRepairReason(
  result: StreamWithToolsResult,
  p: LoopEngineParams
): UnifiedRepairReason | null {
  if (result.finishReason === DEGENERATE_FINISH_REASON) return 'degenerate';
  if (
    result.finishReason != null &&
    result.finishReason !== 'stop' &&
    result.finishReason !== 'tool-calls'
  ) {
    return 'abnormal_finish';
  }
  if (result.text.trim().length === 0) return p.producedArtifact?.() ? null : 'empty';
  if (looksLikeToolPlanLeak(result.text, Object.keys(p.tools))) return 'plan_leak';
  if (p.validateAnswer?.(result.text) != null) return 'invalid';
  return null;
}

/** Re-write a failed answer with the tool-less writer; the caller's
 *  `completion` replace carries the result. Null when the repair produced no
 *  answer. */
async function repairAnswer(
  p: LoopEngineParams,
  deps: LoopDeps,
  reason: UnifiedRepairReason,
  failed: StreamWithToolsResult
): Promise<LoopResult | null> {
  if (p.repairModel == null) return null;
  log.warn(
    `[Engine] unified answer unusable (${reason}, ${failed.text.length} chars, finish=${failed.finishReason ?? 'none'}) — re-writing it with the tool-less writer`
  );
  recordDecision('loop.unified_repair', reason, {
    inputs: { textLength: failed.text.length, finishReason: failed.finishReason },
  });
  try {
    const repaired = await writeRepair(
      {
        ...p,
        model: p.repairModel,
        ...(p.repairFallback != null && { repairSiblingModel: p.repairFallback }),
      },
      deps
    );
    if (repaired.trim().length === 0) {
      log.warn('[Engine] unified repair produced no answer — keeping the original');
      return null;
    }
    return { text: repaired, replacement: 'unified_repair' };
  } catch (err) {
    log.warn(
      `[Engine] unified repair failed (${err instanceof Error ? err.message : String(err)}) — keeping the original`
    );
    return null;
  }
}

export async function runAgenticLoop(
  p: LoopEngineParams,
  deps: LoopDeps = defaultDeps
): Promise<LoopResult> {
  const lanes = [p.model, ...(p.fallbackModels ?? [])];
  const { finishReason, ...streamed } = await runLaneChain(
    lanes,
    async (model, isLast, index): Promise<LaneAttempt<StreamWithToolsResult>> => {
      const probe: LaneProbe = { sawToolCall: false, sawToolResult: false, sawOutput: false };
      try {
        const value = await streamWithTools(p, model, deps, probe, !isLast);
        return { ...probe, error: null, value };
      } catch (error) {
        // Only a lane that left no trace — see `onLaneUnhealthy`.
        const health = probe.sawToolCall || probe.sawOutput ? null : laneHealthReason(error);
        if (health) p.onLaneUnhealthy?.(index, health);
        return { ...probe, error, value: null };
      }
    },
    (from, to, error) => {
      log.warn(
        `[Engine] unified ${modelLabel(from)} ${error instanceof ToolPhaseStallError ? 'stalled' : 'rejected the request'} before any call or output — retrying on ${modelLabel(to)}`
      );
    },
    () => p.abortSignal.aborted
  );
  const result: StreamWithToolsResult = { ...streamed, finishReason };
  if (p.suspended?.()) throw new TurnSuspendedError();
  // The artifact/edit guarantees run AFTER the stream (idempotent — the hooks
  // no-op when the model already created/edited).
  if (p.ensureOwedTools) await p.ensureOwedTools();
  if (p.repairModel != null && !p.abortSignal.aborted) {
    // An English decline is surfaced as a decline, never re-written.
    if (looksLikeSynthRefusal(result.text) && refusalLanguage(result.text) === 'en') {
      log.info(
        `[Engine] unified answer declined the request (en) — surfacing the German refusal; discarded: ${JSON.stringify(
          result.text.trim().slice(0, 120)
        )}`
      );
      recordDecision('loop.synth_verdict', 'refusal_swapped', {
        inputs: { refusalLanguage: 'en' },
      });
      return { text: SYNTH_REFUSAL_TEXT, replacement: 'refusal_swap' };
    }
    const reason = unifiedRepairReason(result, p);
    if (reason != null) {
      const repaired = await repairAnswer(p, deps, reason, result);
      if (repaired) return repaired;
      // Ein geleakter Werkzeugplan ist keine Antwort, auch wenn die Reparatur
      // scheitert: leer zurück, dann schreibt der Aufrufer seinen ehrlichen
      // Kein-Antwort-Satz (#5441).
      if (reason === 'plan_leak') {
        return { text: '', replacement: 'unified_repair' };
      }
    }
  }
  return streamed;
}

/** One model holds the tools and streams the answer. */
async function streamWithTools(
  p: LoopEngineParams,
  model: LanguageModel,
  deps: LoopDeps,
  /** Filled while the stream is read, so a thrown error still says how far the
   *  lane got (see `runLaneChain`). */
  probe: LaneProbe,
  /** Another lane waits behind this one: silence before the first response
   *  then only costs FIRST_RESPONSE_DEADLINE_MS. */
  hasNextLane: boolean
): Promise<StreamWithToolsResult> {
  const unifiedSystem = `${p.toolSystem}${LOOP_SUFFIX}`;
  const prefillMs = prefillAllowanceForModel(
    model,
    `${unifiedSystem}${p.turnContext ?? ''}`,
    p.messages
  );
  const { idle, idleMs } = createToolPhaseIdle(p, prefillMs);
  const firstResponseMs = FIRST_RESPONSE_DEADLINE_MS + prefillMs;
  let firstResponse: IdleDeadline | null = hasNextLane
    ? createIdleDeadline(firstResponseMs, () => new ToolPhaseStallError(firstResponseMs))
    : null;
  const result = deps.streamText({
    model,
    system: withTurnContext(unifiedSystem, p.turnContext),
    messages: p.messages,
    tools: toolsForProvider(p.tools),
    stopWhen: isStepCount(p.maxSteps),
    temperature: p.temperature,
    ...(p.maxOutputTokens != null && { maxOutputTokens: p.maxOutputTokens }),
    ...(p.providerOptions != null && { providerOptions: p.providerOptions }),
    // Kombiniert, damit eine verstummte Lane wirklich abgebaut wird statt nur
    // verlassen.
    abortSignal: AbortSignal.any([
      p.abortSignal,
      idle.signal,
      ...(firstResponse ? [firstResponse.signal] : []),
    ]),
    prepareStep: withTurnContextOnSteps(
      buildPrepareStep(
        unifiedSystem,
        () => (p.producedArtifact?.() ? ARTIFACT_FINISH_SYSTEM_SUFFIX : FORCE_FINISH_SYSTEM_SUFFIX),
        p.maxSteps,
        p.forceFinish,
        p.forceFirstToolCall ?? false,
        p.forcedToolForStep,
        p.getRecipeBlock,
        p.firstToolName ?? null,
        p.activeTools,
        p.firstStepTools ?? null
      ),
      p.turnContext
    ),
    experimental_repairToolCall: repairToolCall,
    ...phaseTelemetry('unified'),
    onError: logStreamError('unified'),
  });
  // Er schreibt MIT gemounteten Werkzeugen, also genau dort, wo das
  // Chat-Template Steuertoken erzeugt.
  const unifiedFilter = createControlTokenFilter();
  const emitFiltered = (delta: string) => {
    const clean = unifiedFilter.push(delta);
    if (clean.length > 0) p.onText(clean);
  };
  const observed: Drainable = {
    stream: observeLane(
      result.stream,
      probe,
      () => firstResponse,
      () => {
        firstResponse?.clear();
        firstResponse = null;
      }
    ),
  };
  // Was schon auf dem Draht ist, falls `drain` wirft.
  let streamed = '';
  let drained: Awaited<ReturnType<typeof drain>>;
  try {
    drained = await drain(
      observed,
      (delta) => {
        streamed += delta;
        emitFiltered(delta);
      },
      p.onReasoning,
      idle,
      'stop'
    );
  } catch (error) {
    // Ein Modell, das den erzwungenen Schritt ignoriert (benannter
    // `toolChoice` für ein geschuldetes Artefakt), beendet nur den Strom, nicht
    // den Zug: danach legt `ensureOwedTools` das Artefakt an, und die
    // Reparatur schreibt die Antwort (`abnormal_finish`). Live 07.11.2026:
    // Mistral Large 4 ohne `create_sheet` → Fehlermeldung statt Tabelle.
    if (!ToolChoiceViolationError.isInstance(error)) throw error;
    log.warn(`[Engine] ${modelLabel(model)} ignored the forced tool step — ${error.message}`);
    firstResponse?.clear();
    return { text: streamed, finishReason: TOOL_CHOICE_VIOLATION_FINISH };
  }
  const { text, finishReason, stalled, echoCut } = drained;
  // Which window fired: the first-response deadline (still armed, aborted) or
  // the idle window. The log said 45 s for 8 s misses (#5481).
  const silentMs = firstResponse?.signal.aborted === true ? firstResponseMs : idleMs;
  firstResponse?.clear();
  const tail = unifiedFilter.flush();
  if (tail.length > 0) p.onText(tail);
  if (stalled) {
    log.warn(
      `[Engine] unified stream silent for ${silentMs}ms after ${text.length} chars (finishReason=${finishReason ?? 'none'}) — tearing it down`
    );
    reportBackgroundError(new ToolPhaseStallError(silentMs), {
      job: 'agentic-unified-stall',
      model: modelLabel(model),
      idleMs: silentMs,
    });
    // Ein `finish`-Part heisst: die Generierung war fertig, nur der Stream ging
    // nicht zu. Dann ist die Antwort vollständig und darf NICHT die
    // Abbruch-Fussnote des Aufrufers bekommen — genau diese Lüge produzierte
    // #2948, wo alle sechs Deckel-Züge inhaltlich richtig geantwortet hatten.
    // Ohne `finish` steht der Text mitten im Satz: als Abbruch melden.
    if (finishReason == null) throw new ToolPhaseStallError(silentMs);
  }
  if (finishReason === DEGENERATE_FINISH_REASON) {
    // The spam is already on the wire; drain trimmed `text` to the healthy
    // prefix, and the caller's `completion` replace swaps it in.
    return { text, finishReason, replacement: 'unified_degeneration' };
  }
  if (echoCut) {
    // The start of the copied register is already on the wire.
    return { text, finishReason, replacement: 'unified_source_echo' };
  }
  return { text, finishReason };
}

/** One attempt on one lane; never throws. */
interface LaneProbe {
  /** The lane emitted at least one tool call — it may have executed, so the
   *  attempt must not be repeated (a retry could create the same form twice). */
  sawToolCall: boolean;
  /** A tool came back with a result. A CALL alone does not mean that: an
   *  enforced `toolChoice` the response ignored throws AFTER its tool-call part
   *  arrived (`ToolChoiceViolationError`, live 28.10.2026: GreenPT called
   *  `web_search` under a pinned `bundestag`) — nothing ran, but `sawToolCall`
   *  already said so, and the writer, missing the failure note, announced a
   *  research plan with tool names and asked „Soll ich starten?". */
  sawToolResult: boolean;
  /** Reasoning or text already reached the client. A second lane would
   *  stream its own next to it, so the attempt is not repeated either. */
  sawOutput: boolean;
}

interface LaneAttempt<T> extends LaneProbe {
  error: unknown;
  /** What the attempt produced. Null with an `error` means the chain rethrows
   *  it when it stops there; a non-null value on an error is the caller's own
   *  degraded outcome. */
  value: T | null;
}

/** Provider verdicts a different lane can plausibly accept: a rejected request
 *  (the 400 "malformed" of an overfull context window), a rate limit, an
 *  outage. Not an abort. A stall before any output counts too (see
 *  `runLaneChain`). */
const LANE_SWITCH_CODES = new Set(['invalid_request', 'rate_limited', 'provider_unavailable']);

/** Why a lane is reported to `onLaneUnhealthy`. */
export type LaneUnhealthyReason = 'stall' | 'provider_unavailable' | 'rate_limited';

/** The subset of switchable failures that is about the lane's health — see
 *  `onLaneUnhealthy` for why `invalid_request` is not one of them. */
function laneHealthReason(err: unknown): LaneUnhealthyReason | null {
  if (err instanceof ToolPhaseStallError) return 'stall';
  const code = providerVerdict(err);
  return code === 'provider_unavailable' || code === 'rate_limited' ? code : null;
}

/** The provider's verdict. The SDK wraps an exhausted 429/5xx retry in a
 *  `RetryError` that carries no status of its own — the last attempt does. */
function providerVerdict(err: unknown): string {
  return classifyProviderError(RetryError.isInstance(err) ? err.lastError : err).code;
}

/**
 * The loop's lane ladder.
 * Runs `attempt` on each lane in order and moves on only when the lane failed
 * with a switchable verdict (or stalled before its first response) and left no
 * trace: no tool call, no output. Anything else stops the chain — a call may
 * have executed, and output is already on the client.
 *
 * Returns the stopping attempt's value; a failure without one is rethrown.
 */
async function runLaneChain<T>(
  lanes: readonly LanguageModel[],
  attempt: (model: LanguageModel, isLast: boolean, index: number) => Promise<LaneAttempt<T>>,
  onSwitch: (from: LanguageModel, to: LanguageModel, error: unknown) => void,
  aborted: () => boolean = () => false
): Promise<T> {
  let last: LaneAttempt<T> | null = null;
  for (const [i, model] of lanes.entries()) {
    const hasNext = i < lanes.length - 1;
    last = await attempt(model, !hasNext, i);
    if (last.error == null && last.value != null) return last.value;
    if (
      !hasNext ||
      last.sawToolCall ||
      last.sawOutput ||
      aborted() ||
      // A lane that stayed silent has already cost its deadline, but the
      // alternative was an empty "technisch gescheitert" turn. Live 12.10.2026:
      // Melious gemma went silent on 3 of 14 pinned notebook_quellen calls
      // (#4480), and the fallback lane answered each one. The turn's own wall
      // clock (`abortSignal`) still caps every further attempt.
      !(
        last.error instanceof ToolPhaseStallError ||
        LANE_SWITCH_CODES.has(providerVerdict(last.error))
      )
    ) {
      break;
    }
    onSwitch(model, lanes[i + 1], last.error);
  }
  if (last?.value != null) return last.value;
  throw last?.error ?? new Error('no lane produced an answer');
}

/** Passes `stream` through and records how far the lane got. The first part
 *  that is not the SDK's own preamble ends the first-response window. */
function observeLane(
  stream: AsyncIterable<StreamPart>,
  probe: LaneProbe,
  firstResponse: () => IdleDeadline | null,
  onFirstResponse: () => void
): AsyncIterable<StreamPart> {
  return {
    [Symbol.asyncIterator]() {
      const iterator = stream[Symbol.asyncIterator]();
      return {
        async next() {
          const waiting = firstResponse();
          const next = await Promise.race([
            iterator.next(),
            ...(waiting ? [waiting.deadline] : []),
          ]);
          if (next.done) return next;
          const part = next.value;
          if (!SDK_PREAMBLE_PARTS.has(part.type)) onFirstResponse();
          if (part.type === 'tool-call') probe.sawToolCall = true;
          if (part.type === 'tool-result') probe.sawToolResult = true;
          if (
            (part.type === 'reasoning-delta' || part.type === 'text-delta') &&
            part.text != null &&
            part.text.length > 0
          ) {
            probe.sawOutput = true;
          }
          return next;
        },
        return: (value?: unknown) =>
          iterator.return ? iterator.return(value) : Promise.resolve({ done: true, value }),
      } as AsyncIterator<StreamPart>;
    },
  };
}

/** Answers at or below this length are candidates for the tool-plan and
 *  refusal checks. Above it the answer is real prose by definition. */
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
 * What the user reads when the synth DECLINED the request in English (a German
 * decline goes out as written). Distinct from the
 * caller's no-answer fallback on purpose: that one says "ich konnte nichts
 * finden … magst du die Frage anders formulieren?", which reads as a technical
 * failure and coaches the retry of a request we deliberately refused (observed
 * live on the fabricated-quote turn). A decline is an outcome, not an error.
 */
export const SYNTH_REFUSAL_TEXT =
  'Diese Anfrage setze ich nicht um — sie widerspricht den inhaltlichen Regeln des Grünerators, etwa erfundene Zitate, erfundene Quellen oder ausgrenzende Aussagen. Für ein anderes Anliegen bin ich gern da.';

/**
 * Retry nudges for an INVALID accepted answer (see `validateAnswer`). The
 * repair writer never streams, so these can be blunt about what went wrong.
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
 * Bounded by {@link SHORT_ANSWER_MAX_CHARS}: a long answer that merely contains
 * a refusal-shaped clause is prose, not a decline.
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

/** The repair writer: re-writes a failed loop answer over the collected
 *  sources, without tools. Nothing of it streams — the caller's `completion`
 *  replace carries the returned text. */
async function writeRepair(p: LoopEngineParams, deps: LoopDeps): Promise<string> {
  // Runs WITHOUT tools, so it must not see the tool-call/tool-result replay the
  // loop needs — see `repairMessages`.
  const messages = p.repairMessages ?? p.messages;
  const baseSystem = p.buildRepairSystem(p.getSourcesBlock());
  const toolNames = Object.keys(p.tools);

  interface SynthPass {
    text: string;
    finishReason: string | null;
  }

  const runPass = async (
    system: string,
    model: LanguageModel,
    passMessages: ModelMessage[]
  ): Promise<SynthPass> => {
    // Plus das Einlesen: Synthese schweigt sonst nur beim Denken oder Sterben,
    // aber vor dem ersten Delta liest der Anbieter den ganzen Verlauf ein.
    const idleMs =
      SYNTH_IDLE_DEADLINE_MS +
      prefillAllowanceForModel(model, `${system}${p.turnContext ?? ''}`, passMessages);
    const idle = createIdleDeadline(idleMs, () => new SynthStallError(idleMs));
    const result = deps.streamText({
      model,
      system: withTurnContext(system, p.turnContext),
      messages: passMessages,
      temperature: p.temperature,
      ...(p.maxOutputTokens != null && { maxOutputTokens: p.maxOutputTokens }),
      ...(p.providerOptions != null && { providerOptions: p.providerOptions }),
      // Combined so a stalled provider call is torn down, not just abandoned.
      abortSignal: AbortSignal.any([p.abortSignal, idle.signal]),
      ...phaseTelemetry('synth'),
      onError: logStreamError('synth'),
    });
    const { text, finishReason } = await drain(result, () => {}, p.onReasoning, idle);
    // What gets persisted and what every validator downstream reads.
    return { text: stripToolControlTokens(text), finishReason };
  };

  /** A stalled or empty pass costs the user the whole turn, so try the sibling
   *  once — the same move `streamWithFallback` makes on the single-pass path. */
  const runPassWithFallback = async (system: string): Promise<SynthPass> => {
    const onFallback = (fallback: LanguageModel) =>
      runPass(
        system,
        fallback,
        p.repairSiblingMessages?.(`${system}${p.turnContext ?? ''}`) ?? messages
      );
    let pass: SynthPass;
    try {
      pass = await runPass(system, p.model, messages);
    } catch (err) {
      if (!isSynthStall(err) || !p.repairSiblingModel) throw err;
      log.warn(
        `[Engine] synth lane silent past its window (${err.message}) — retrying once on the fallback lane`
      );
      p.onRepairWriterUnhealthy?.('synth_stall');
      return onFallback(p.repairSiblingModel);
    }
    // Live 03.11.2026 Mistral Large 4 closed a thinking stream three times in
    // one thread with no text and no finish reason. A degenerate pass has its
    // own retry below.
    if (
      pass.text.trim().length > 0 ||
      pass.finishReason === DEGENERATE_FINISH_REASON ||
      !p.repairSiblingModel ||
      p.abortSignal.aborted
    ) {
      return pass;
    }
    log.warn(
      `[Engine] synth lane returned no text (finish=${pass.finishReason ?? 'none'}) — retrying once on the fallback lane`
    );
    p.onRepairWriterUnhealthy?.('synth_empty');
    return onFallback(p.repairSiblingModel);
  };

  /** Why the answer is unusable as-is — a retry suffix, or null for valid. An
   *  abnormal finishReason means the upstream cut the stream; the caller's
   *  validators see the text alone and cannot know that. */
  const invalidReason = (pass: SynthPass): string | null => {
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
   * One re-run for an answer that is syntactically broken (cut off, invalid
   * JSON, degenerate). The retry replaces the first pass only when it is
   * demonstrably better: non-empty, itself valid, no tool-plan leak, no refusal.
   */
  const retryInvalidAnswer = async (first: SynthPass, reason: string): Promise<string | null> => {
    log.warn(`[Engine] synth answer failed validation (${first.text.length} chars) — one retry`);
    recordDecision('loop.synth_verdict', 'invalid_retried', {
      inputs: { textLength: first.text.length },
    });
    let retry: SynthPass;
    try {
      retry = await runPassWithFallback(`${baseSystem}${reason}`);
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
    recordDecision('loop.synth_verdict', 'invalid_replaced', {
      inputs: { retryTextLength: retry.text.length },
    });
    // Logged because the decision journal is development-only.
    log.warn(
      `[Engine] validation retry replaced the answer (${first.text.length} → ${retry.text.length} chars)`
    );
    return retry.text;
  };

  const first = await runPassWithFallback(baseSystem);
  // A decline is checked BEFORE degeneracy, or it would be retried (a second
  // call that refuses again). Only an ENGLISH decline is swapped: whether a
  // German one is a policy decline or a missing capability ("Ich kann keine
  // Websuche durchführen", #3799) cannot be read reliably from prose.
  const refusalLang = looksLikeSynthRefusal(first.text) ? refusalLanguage(first.text) : null;
  if (refusalLang === 'en') {
    // The discarded text goes into the line on purpose: without it a wrongly
    // swapped answer looks exactly like a correct decline in the logs.
    log.info(
      `[Engine] synth declined the request (en) — ` +
        `surfacing the German refusal instead of retrying; discarded: ${JSON.stringify(
          first.text.trim().slice(0, 120)
        )}`
    );
    recordDecision('loop.synth_verdict', 'refusal_swapped', {
      inputs: { refusalLanguage: refusalLang },
    });
    return SYNTH_REFUSAL_TEXT;
  }
  if (refusalLang === 'de') {
    log.info(
      `[Engine] synth declined in German — passing its own words through: ${JSON.stringify(
        first.text.trim().slice(0, 120)
      )}`
    );
  }
  if (!looksLikeToolPlanLeak(first.text, toolNames)) {
    // A degenerate pass earns the retry even when the trim left NOTHING — spam
    // from the first token is where a fresh pass helps most. Plain-empty
    // answers stay the caller's fallback case.
    const reason =
      first.text.trim().length > 0 || first.finishReason === DEGENERATE_FINISH_REASON
        ? invalidReason(first)
        : null;
    if (reason != null && !p.abortSignal.aborted) {
      const replaced = await retryInvalidAnswer(first, reason);
      if (replaced != null) return replaced;
    }
    recordDecision('loop.synth_verdict', 'accepted', {
      inputs: { textLength: first.text.length },
    });
    // A degenerate pass keeps its trimmed prefix (`drain`).
    return first.text;
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
    // Empty, so the caller's honest no-answer fallback fires instead of a
    // leaked tool-planning line.
    log.warn('[Engine] synth retry did not recover — degrading to the no-answer fallback');
    recordDecision('loop.synth_verdict', 'retry_failed_empty', {
      inputs: { retryTextLength: retry.text.length },
    });
    return '';
  }
  return retry.text;
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
): Promise<{ text: string; finishReason: string | null; stalled: boolean; echoCut: boolean }> {
  let text = '';
  let finishReason: string | null = null;
  let stalled = false;
  let echoCut = false;
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
        // The writer started copying the source register out of its prompt
        // (#5409). What came before is the finished answer: stop pulling, keep
        // it, and report a clean stop — the caller replaces what the wire saw.
        // A marker split across two deltas is still found: the search reaches
        // back past the start of this one.
        const echoAt = findSourceEchoCut(text, text.length - part.text.length - ECHO_LOOKBACK);
        if (echoAt != null) {
          log.warn(
            `[Engine] writer is copying the source register after ${text.length} chars — stopping the stream, keeping ${echoAt}`
          );
          text = text.slice(0, echoAt);
          finishReason = 'stop';
          echoCut = true;
          // swallow-ok: cleanup of an abandoned stream that only repeats our prompt
          void Promise.resolve(iterator.return?.()).catch(() => {});
          break;
        }
        // A model that cannot stop ("Ende. Fertig. 😊" loops, digit/smiley runs)
        // has no limit on our side to run into — the answer paths deliberately
        // set no maxOutputTokens, so without this it streams until the PROVIDER's
        // cap fires (live 12.08.2026: 32.826 chars over 263s). Cut it here, keep
        // the healthy prefix, and let the caller's finishReason handling take
        // over (repair writer: retry; loop: completion replace).
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
          // The kept prefix says it was cut, so the trim does not pass for a
          // finished answer — but only when there is something to warn about:
          // removing a run of dashes leaves a COMPLETE answer.
          text = trimDegenerate(text, cut);
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
  return { text, finishReason, stalled, echoCut };
}

/** How far back the echo search reaches before the newest delta — the marker is 23 chars. */
const ECHO_LOOKBACK = 40;
