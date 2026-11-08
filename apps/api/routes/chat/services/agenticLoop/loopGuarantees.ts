/**
 * Die zwei Zusicherungen, die ein Turn einlöst, wenn das Loop-Modell es nicht
 * tut: es behandelt einen Erstellungs- oder Bearbeitungsauftrag als reine
 * Recherche und hört nach dem Suchen auf. Was der Turn ZUGESAGT hat, kann davon
 * nicht abhängen — also führt der Turn das Werkzeug selbst aus. Idempotent (der
 * `already`-Test bzw. `editorEditsSummary`); loopEngine ruft sie nach dem Strom.
 */
import {
  BOARD_MODIFY_PATTERN,
  DOC_MODIFY_PATTERN,
} from '../../../../agents/langgraph/ChatGraph/nodes/classifierHeuristics.js';
import { artifactKind } from '../artifactKindRegistry.js';
import { isPdfEditAsk } from '../pdfEditContext.js';

import { withResearchedSources, type SourceRegistry } from './sourceRegistry.js';
import { EDIT_TOOL_NAMES } from './types.js';

import type { CompoundGenerationKind, EditorSurfaceKind } from './routing.js';
import type { ChatGraphState } from '../../../../agents/langgraph/ChatGraph/types.js';
import type { SSEWriter } from '../sseHelpers.js';
import type { PersistedStep } from './types.js';
import type { ModelMessage, ToolSet } from 'ai';

/**
 * Was auf einem Sharepic eine Änderung ist, ein Text aber nicht kennt: Lage,
 * Größe, Farbe. Live am 07.10.2026 traf „Verschieb den Text nach oben" kein
 * Dokument-Muster, der Planer rief nichts (steps=0), und die Antwort behauptete
 * die Verschiebung. Es gibt keine Klassifikator-Schnellbahn für den Canvas, die
 * dieses Muster teilen müsste.
 */
const ELEMENT = String.raw`(?:headline|(?:ü|ue)berschrift|dachzeile|text|schrift|logo|bild|foto|hintergrund|zeile|block|folie|zitat|quelle|st(?:ö|oe)rer|datum|button|fl(?:ä|ae)che)\p{L}*`;
const COMPARATIVE = String.raw`(?:gr(?:ö|oe)(?:ß|ss)er|kleiner|heller|dunkler|breiter|schmaler|h(?:ö|oe)her|tiefer|fetter|d(?:ü|ue)nner)\p{L}*`;
// Verbs in their imperative/finite forms only: bare stems also hit nouns
// („Rückblick", „Bewegung", „Drehbuch", „Wechselwähler").
const CANVAS_CHANGE_PATTERN = new RegExp(
  [
    String.raw`(?<!\p{L})(?:(?:ver)?schieb|r(?:ü|ue)ck|beweg|platzier|zentrier|dreh|spiegel|vergr(?:ö|oe)(?:ß|ss)er|verkleiner|tausch|wechsel|f(?:ä|ae)rb)(?:e|t|en)?(?!\p{L})`,
    String.raw`(?<!\p{L})richte\s+\S.{0,40}?\s+aus(?!\p{L})`,
    String.raw`(?<!\p{L})nach\s+(?:oben|unten|links|rechts)(?!\p{L})`,
    String.raw`(?<!\p{L})${ELEMENT}(?:\s+\S+){0,3}?\s+${COMPARATIVE}`,
    String.raw`(?<!\p{L})${COMPARATIVE}\s+${ELEMENT}`,
    String.raw`(?<!\p{L})mach\s+\S.{0,40}?\s+${COMPARATIVE}`,
    String.raw`(?:farbe|hintergrund|fl(?:ä|ae)che)\p{L}*\s+(?:auf|in|zu)\s+\p{L}`,
    String.raw`(?<!\p{L})${ELEMENT}(?:\s+\S+)?\s+(?:weg|raus)[\s.!]*$`,
  ].join('|'),
  'iu'
);

/**
 * Not a change, whatever words follow: a question (unless it is a polite
 * request), or research and small talk („Recherchiere …", „Danke, …").
 */
function canvasAskIsNoChange(ask: string): boolean {
  const text = ask.trim();
  if (/^(?:recherchier|such|find|erz(?:ä|ae)hl|gib\s+mir|danke)/iu.test(text)) return true;
  if (/^(?:warum|wieso|weshalb|was|wie|welche[rsmn]?|wer|wo)(?!\p{L})/iu.test(text)) return true;
  return (
    text.endsWith('?') && !/^(?:kannst|k(?:ö|oe)nntest|w(?:ü|ue)rdest)\s+du(?!\p{L})/iu.test(text)
  );
}

/**
 * Nennt die Bitte selbst eine Bearbeitung? Dieselben Muster, die der
 * Klassifikator für seine `edit_current_*`-Schnellbahn benutzt — bewusst
 * geteilt statt kopiert, denn die Zusicherung springt genau dann ein, wenn die
 * Schnellbahn NICHT gefeuert hat (der Klassifikator kehrte früher zurück, oder
 * der Turn kam als `agentic`/`produktion` heraus). Zwei Muster, die
 * auseinanderdriften, hiessen: Werkzeug montiert, niemand ruft es, und der Turn
 * endet mit „keine passende Antwort" statt mit der Änderung.
 */
function askNamesAnEdit(surface: EditorSurfaceKind, ask: string): boolean {
  if (surface === 'board') return BOARD_MODIFY_PATTERN.test(ask);
  if (DOC_MODIFY_PATTERN.test(ask)) return true;
  // The gate guards only the canvas words: a doc-pattern hit forces as before.
  return surface === 'canvas' && !canvasAskIsNoChange(ask) && CANVAS_CHANGE_PATTERN.test(ask);
}

/** A GFM table: header row followed by a delimiter row. Used to recognise that
 *  a "Tabelle"-turn was already answered inline in chat. */
const MARKDOWN_TABLE_RE = /^\s*\|.+\|\s*\r?\n\s*\|(?:\s*:?-+:?\s*\|)+\s*$/m;

/** The compound-generation guarantee is owed: a fat artifact tool was named AND
 *  ordered (a bare mention leaves the decision to the planner). */
function compoundGenerationOwed(state: ChatGraphState): boolean {
  return Boolean(state.compoundGenerationKind) && state.compoundGenerationOrdered !== false;
}

/** The forced-edit guarantee is owed: the open artefact must be edited. Not the
 *  intent alone — see the note in `ensureOwedTools` — the surface and the ask count too. */
function editGuaranteeOwed(state: ChatGraphState, userAsk: string): boolean {
  const editSurface = state.editToolSurface;
  return Boolean(
    editSurface &&
    (state.intent === 'edit_current_doc' ||
      state.intent === 'edit_current_board' ||
      state.compoundEdit === true ||
      askNamesAnEdit(editSurface, userAsk)) &&
    !state.editorEditsSummary &&
    !state.editorEditUnchanged
  );
}

/** An artefact this turn already produced: the creation guarantee is met. */
function turnHasArtifact(state: ChatGraphState): boolean {
  return (
    state.generatedImage != null ||
    (state.sharepicVariants?.length ?? 0) > 0 ||
    state.createdDocument != null ||
    state.createdBoard != null
  );
}

/**
 * The tool this turn still owes: the fat tool of an ordered compound
 * generation, or the edit tool of an open surface the ask wants changed. Null
 * once that tool ran (`calledToolNames`) or the artefact exists.
 *
 * The loop forces it as a named step — at step 0 when nothing else is forced,
 * otherwise as soon as the forced first call is done (`forcedToolForStep`) — so
 * the writer sees the tool result BEFORE it writes. `ensureOwedTools` stays as the
 * net for a host that ignores `tool_choice`.
 *
 * `userAsk` is the turn's last user text (the forced edit reads it too).
 */
export function owedToolName(
  state: ChatGraphState,
  userAsk: string,
  isMounted: (name: string) => boolean,
  calledToolNames: readonly string[]
): string | null {
  const ran = (name: string): boolean => calledToolNames.includes(name);
  const kind = state.compoundGenerationKind;
  if (kind && compoundGenerationOwed(state) && !turnHasArtifact(state)) {
    const name = artifactKind(kind).loopToolName;
    if (isMounted(name) && !ran(name)) return name;
  }
  if (editGuaranteeOwed(state, userAsk)) {
    const name = EDIT_TOOL_NAMES.find(isMounted);
    if (name && !ran(name)) return name;
  }
  return null;
}

export interface GuaranteeContext {
  state: ChatGraphState;
  messages: ModelMessage[];
  /** The UNWRAPPED catalog — the guarantees bypass the loop guards on purpose. */
  tools: ToolSet;
  sourceRegistry: SourceRegistry;
  sse: SSEWriter;
  recordStep: (step: PersistedStep) => void;
  /** Der Katalog MIT Umschlag (Karten, Wächter, Schritt-Aufzeichnung). */
  wrappedTools: ToolSet;
  /** Welche Werkzeuge in diesem Turn schon gelaufen sind (Name je Schritt). */
  calledToolNames: () => readonly string[];
  /** Read at CALL time: the answer is already written when this runs, and
   *  that is exactly what the inline-table check asks about. */
  answerText: () => string;
  onInfo: (message: string) => void;
  onWarn: (message: string) => void;
}

/** The last user message as plain text: the order the generation is briefed with. */
function lastUserAskOf(messages: ModelMessage[]): string {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  return typeof lastUser?.content === 'string'
    ? lastUser.content
    : (lastUser?.content ?? [])
        .map((part) => (part.type === 'text' ? part.text : ''))
        .join(' ')
        .trim();
}

/**
 * Runs the kind's fat tool directly and records it as a first-class tool step
 * (the same `tool_step_*` SSE and persisted step a model-issued call leaves).
 * It bypasses the loop guards on purpose: both callers run it because the
 * model is not asked for the call. Null when the tool is not mounted.
 */
async function runOwedGeneration(
  p: GuaranteeContext,
  kind: CompoundGenerationKind,
  userAsk: string,
  stepId: string
): Promise<PersistedStep | null> {
  // The tool name comes from the registry: a missing kind does not compile.
  const toolName = artifactKind(kind).loopToolName;
  const genTool = p.tools[toolName] as
    { execute?: (input: unknown, opts: { toolCallId: string }) => Promise<unknown> } | undefined;
  if (!genTool?.execute) return null;
  // The doc/PDF tools append the source block themselves, so their brief stays
  // the bare ask; `sharepic`/`board` have no registry of their own.
  const selfSourcing = kind !== 'sharepic' && kind !== 'board';
  const brief = selfSourcing
    ? userAsk
    : withResearchedSources(userAsk, p.sourceRegistry.renderAll());
  // Both arg shapes: doc/board tools read `prompt`, sharepic reads `text`. A
  // PDF edit ask („Ändere das PDF: …") re-renders the stored spec, as on the
  // single-pass door (`PDF_SPEC`), instead of building a new one from the ask.
  const args = {
    prompt: brief,
    text: brief,
    ...(kind === 'pdf' && isPdfEditAsk(userAsk) && { aendert_letztes_pdf: true }),
  };
  p.sse.send('tool_step_start', { stepId, toolName, args });
  let result: unknown;
  try {
    result = await genTool.execute(args, { toolCallId: stepId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    p.onWarn(`[Agentic] ${toolName} failed: ${message}`);
    result = { error: message };
  }
  const resultRecord =
    result && typeof result === 'object' && !Array.isArray(result)
      ? (result as Record<string, unknown>)
      : { value: result };
  p.sse.send('tool_step_result', {
    stepId,
    toolName,
    ok: resultRecord.error == null,
    result: resultRecord,
  });
  const step: PersistedStep = { toolCallId: stepId, toolName, args, result: resultRecord };
  p.recordStep(step);
  return step;
}

/**
 * A pure artefact order (`isPureArtifactOrder`): build the artefact BEFORE the
 * stream, with the order as the brief — the single-pass dispatcher's input,
 * without a model step for the arguments. Returns the call and its result as
 * messages to append after the order, so the model writes the answer with the
 * result in view; the artefact then trips `forceFinish`, which strips the tools
 * from that step. Empty when nothing ran.
 */
export async function runOrderedArtifact(p: GuaranteeContext): Promise<ModelMessage[]> {
  const kind = p.state.compoundGenerationKind;
  if (!kind || !compoundGenerationOwed(p.state) || turnHasArtifact(p.state)) return [];
  const step = await runOwedGeneration(p, kind, lastUserAskOf(p.messages), 'ordered-artifact');
  if (!step) return [];
  p.onInfo(`[Agentic] ${step.toolName} ran before the answer (pure order)`);
  return [
    {
      role: 'assistant',
      content: [
        {
          type: 'tool-call',
          toolCallId: step.toolCallId,
          toolName: step.toolName,
          input: step.args,
        },
      ],
    },
    {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: step.toolCallId,
          toolName: step.toolName,
          output: { type: 'json', value: step.result as never },
        },
      ],
    },
  ];
}

/** Builds the `ensureOwedTools` hook loopEngine calls after the stream. */
export function createEnsureOwedTools(p: GuaranteeContext): () => Promise<boolean> {
  // The compound turn's whole point is the artifact. If the loop produced
  // none, invoke the mounted generation tool directly with the researched
  // sources as the brief.
  const lastUserAsk = (): string => lastUserAskOf(p.messages);

  // Compound generation guarantee (spawns a NEW artefact). Idempotent via the
  // artefact check, so it is safe to call more than once. The loop forces the
  // tool itself first (`owedToolName`); this only catches a host that ignored
  // the named step.
  const forceCompoundGeneration = async (): Promise<void> => {
    const kind = p.state.compoundGenerationKind;
    // Nur genannt, nicht bestellt: ob das Artefakt entsteht, entscheidet der
    // Planer. Nachholen hiesse, die blosse Erwähnung doch wieder zu erzwingen.
    if (!kind || !compoundGenerationOwed(p.state)) return;
    if (turnHasArtifact(p.state)) return; // planner already created it
    // The tool ran and failed: the answer already says so, and a second try
    // after it would put a card under „ging nicht“. The net is for a host that
    // never made the call.
    if (p.calledToolNames().includes(artifactKind(kind).loopToolName)) return;
    // The model's own inline answer can BE the deliverable. In unified mode
    // this hook runs AFTER the stream, so when a "Tabelle"-turn was answered
    // with a markdown table in chat, spawning a spreadsheet on top duplicates
    // the answer — and the unwanted artifact then hijacks the NEXT turn via
    // the lastToolContext sheet-edit follow-up (QA 08/2026). Split mode is
    // unaffected: there the hook runs before synthesis, while `text` is
    // still empty.
    if (kind === 'sheet' && MARKDOWN_TABLE_RE.test(p.answerText())) {
      p.onInfo(
        '[Agentic] create_sheet not called — answer already carries an inline table, skipping forced generation'
      );
      return;
    }
    p.onInfo(
      `[Agentic] ${artifactKind(kind).loopToolName} not called — forcing compound generation`
    );
    await runOwedGeneration(p, kind, lastUserAsk(), 'forced-generation');
  };

  // Pin-Zusicherung: eine @-Erwähnung hat `bundestag` benannt, der Planer hat es
  // nicht gerufen. Live 28.10.2026 (r1, Katrin Uhlig/Wasserstoff): Melious stand
  // 15 s still, GreenPT ignorierte den erzwungenen `tool_choice` — steps=0, und
  // der Schreiber musste einen Ausfall melden, obwohl nichts mehr fehlte als ein
  // Aufruf. `bundestag` nimmt die Frage selbst als Thema (leere Argumente),
  // also läuft es hier ohne Planer. Liefert `true`, wenn es lief.
  const forcePinnedBundestag = async (): Promise<boolean> => {
    if (p.state.mentionPinnedTool !== 'bundestag') return false;
    if (p.calledToolNames().length > 0) return false;
    // Der UMSCHLAG, nicht der rohe Katalog: er sendet die Karte, trägt die
    // Quellen ein und schreibt den Schritt — dieselben Spuren wie ein Planer-Aufruf.
    const tool = p.wrappedTools.bundestag as
      { execute?: (input: unknown, opts: { toolCallId: string }) => Promise<unknown> } | undefined;
    if (!tool?.execute) return false;
    p.onInfo('[Agentic] pinned bundestag not called — running it before synth');
    try {
      const result = await tool.execute({}, { toolCallId: 'forced-pinned-bundestag' });
      const error = (result as { error?: unknown } | null)?.error;
      return error == null;
    } catch (err) {
      p.onWarn(
        `[Agentic] forced bundestag failed: ${err instanceof Error ? err.message : String(err)}`
      );
      return false;
    }
  };

  const ensureOwedTools = async (): Promise<boolean> => {
    const pinnedRan = await forcePinnedBundestag();
    // (a) Editor-surface edit guarantee: an edit_current_* turn MUST edit the
    //     open artefact. The loop model unreliably calls edit_document
    //     (observed live: steps=0 on most sheet/deck edits) — force it here, so
    //     editorEditsSummary is set and the caller confirms the change instead
    //     of the no-answer fallback or a false refusal.
    //     Der Intent ist NICHT das Kriterium, sondern nur eines von dreien: das
    //     Werkzeug hängt an der FLÄCHE, nicht am Intent, und der Klassifikator
    //     verfehlt seine `edit_current_*`-Schnellbahn regelmässig (live am
    //     19.08.2026: „Erstelle eine Aufgabe …" auf einem offenen Board kam als
    //     `agentic` heraus, der Planer rief nichts, steps=0 — und der*die
    //     Nutzer*in bekam „keine passende Antwort" auf eine glasklare Bitte).
    //     Also fragt die Zusicherung zusätzlich den TEXT, mit genau den Mustern
    //     der Schnellbahn: eine reine Frage ans Board („wie viele Aufgaben sind
    //     offen?") trifft keines davon und löst weiterhin keine Änderung aus.
    const editSurface = p.state.editToolSurface;
    const userAsk = lastUserAsk();
    if (editSurface && editGuaranteeOwed(p.state, userAsk)) {
      const editToolName = EDIT_TOOL_NAMES.find((name) => p.tools[name] != null);
      const editTool = (editToolName ? p.tools[editToolName] : undefined) as
        | { execute?: (input: unknown, opts: { toolCallId: string }) => Promise<unknown> }
        | undefined;
      if (editTool?.execute && userAsk) {
        // The spec path appends the registry's sources itself; doubling them
        // here would spend the creator's prompt budget twice on the same text.
        const sourcesBlock =
          editToolName === 'edit_current_sharepic' ? '' : p.sourceRegistry.renderReference();
        const instruction = sourcesBlock
          ? `${userAsk}\n\nRecherchierte Quellen dazu:\n${sourcesBlock}`
          : userAsk;
        p.onInfo(`[Agentic] planner skipped ${editToolName} — forcing edit before synth`);
        try {
          await editTool.execute({ instruction }, { toolCallId: 'forced-edit' });
        } catch (err) {
          p.onWarn(
            `[Agentic] forced ${editToolName} failed: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    }

    // (b) Compound generation guarantee (spawns a NEW artefact).
    await forceCompoundGeneration();
    return pinnedRan;
  };

  return ensureOwedTools;
}
