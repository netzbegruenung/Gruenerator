/**
 * Editor edit tool for the agentic loop.
 *
 * Mounted only when the router resolved an editor surface with a tool path
 * (see routing.decideEditToolLoop / TOOL_EDIT_SURFACES). Lets the loop model edit
 * the OPEN artifact mid-conversation — search first, then edit, and write an
 * answer that knows what it changed — instead of a client round-trip to a
 * bespoke /api/{sheets,presentations}/:id/ai endpoint or a classifier verdict.
 *
 * TWO strategies, and the difference is who composes the change:
 *
 *  - `plan-and-send` (sheet/presentation/board/canvas): `execute` calls the
 *    per-surface op-planning core (Mistral-Medium prompt, unchanged) with the
 *    loop's gathered sources as reference material, emits an
 *    `editor_operations` SSE event carrying the typed ops, and returns a lean
 *    summary. The client applies the ops in place (Univer / Yjs).
 *  - `dispatch` (doc): the server plans nothing. It forwards the model's
 *    instruction as `trigger_doc_edit`, and BlockNote's xl-ai extension forks
 *    the Y.Doc, calls POST /api/docs/ai and applies the result as suggestion
 *    marks the person accepts or rejects. What moved into the loop here is the
 *    DECISION and the INSTRUCTION, not the apply path.
 *
 * Either way the artifact lives in the browser, so apply is always client-side
 * and there is NO acknowledgement channel back — a dispatched edit is never
 * reported as saved (see the `Vorschlag` wording below and artifactNotes).
 *
 * Add a surface by adding an {@link EditSurfaceSpec} to EDIT_SURFACE_SPECS AND
 * the matching client handler (`editorOpsHandler` for plan-and-send, the
 * `documentEditHandler` for the doc dispatch).
 */
import { isDeepStrictEqual } from 'node:util';

import {
  SHAREPIC_PROMPT_MAX,
  type EditorOperationsEvent,
  type SharepicDraftFocus,
} from '@gruenerator/contracts';
import { tool, type Tool } from 'ai';
import { z } from 'zod';

import { lastUserText } from '../../../agents/langgraph/ChatGraph/nodes/classifierHeuristics.js';
import { draftSharepic } from '../../../services/sharepicCreator/draftAgent.js';
import {
  DRAFT_LIMIT_TEXTS,
  DraftFailedError,
} from '../../../services/sharepicCreator/draftFailure.js';
import {
  describeBackgrounds,
  withoutPaletteHinweis,
} from '../../../services/sharepicCreator/paletteColors.js';
import { createLogger } from '../../../utils/logger.js';
import { generateBoardOperations } from '../../boards/boardAiService.js';
import { runCanvasSuggest } from '../../canvas/services/runCanvasSuggest.js';
import { generatePresentationOperations } from '../../presentations/presentationAiService.js';
import { generateSheetOperations } from '../../sheets/sheetAiService.js';
import { EDITOR_SURFACE_NOUNS, type EditorSurfaceKind } from '../services/agenticLoop/routing.js';
import { type SourceRegistry } from '../services/agenticLoop/sourceRegistry.js';
import { editToolNameFor } from '../services/agenticLoop/types.js';
import { emitEditorOperations, planEditorOps, type EditorOp } from '../services/editorOpsCore.js';
import { orderText } from '../services/orderText.js';
import { paintersFor } from '../services/sharepicCreatorVariant.js';
import { type SSEWriter } from '../services/sseHelpers.js';
import { buildPriorTurnReference, EDIT_REFERENCE_CHAR_CAP } from '../streamStages/editReference.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';

const log = createLogger('EditorTool');

export interface EditorToolCtx {
  sse: SSEWriter;
  state: ChatGraphState;
  sourceRegistry: SourceRegistry;
  /**
   * Per-turn scratch: compact summaries of ops already emitted this turn. After
   * edit #1 is applied client-side the server's currentDocument snapshot is
   * stale, so each subsequent planning call is told what has already happened.
   */
  appliedOpsLog: string[];
}

/** What every surface's spec carries. The artefact's noun and gender are NOT
 *  here: they live in `EDITOR_SURFACE_NOUNS`, because the synth's "cannot edit
 *  this turn" note names the same thing. */
interface EditSurfaceBase {
  /** Model-facing tool description. */
  description: string;
  /** The open artefact for this surface, or null if none is open. */
  getTarget: (state: ChatGraphState) => { id: string } | null;
}

/** The server plans the typed operations and streams them. */
interface PlanAndSendSpec extends EditSurfaceBase {
  strategy: 'plan-and-send';
  /**
   * Plan the typed operations. Each surface reads its own context off `state`
   * (currentDocument.markdown for sheet/presentation, structured currentBoard
   * for board, currentCanvas.snapshot for canvas). `appliedNote` describes ops
   * already emitted this turn (the server snapshot is stale after client-side
   * apply); `referenceContent` is the loop's gathered sources.
   */
  planOperations: (input: {
    instruction: string;
    state: ChatGraphState;
    appliedNote: string;
    referenceContent: string | null;
  }) => Promise<PlannedOps>;
}

/**
 * The server plans nothing — it hands the instruction to the surface's own
 * client-side AI pipeline and says so. `note` is what the model is told to
 * report; it must not read as "saved", because nothing acknowledges the apply.
 *
 * `target` comes from {@link EditSurfaceBase.getTarget}, which `execute` has
 * already refused a turn without — passing it keeps the dispatch free of a
 * second, unreachable null check on the same field.
 */
interface DispatchSpec extends EditSurfaceBase {
  strategy: 'dispatch';
  dispatch: (input: {
    instruction: string;
    state: ChatGraphState;
    referenceContent: string | null;
    target: { id: string };
    sse: SSEWriter;
  }) => { note: string };
}

type EditSurfaceSpec = PlanAndSendSpec | DispatchSpec;

/**
 * What a surface's planner hands back: the typed ops, optionally with a human
 * LABEL for the batch. Only canvas supplies one — its planner names every
 * suggestion in German ("Zitat geschärft"), and that name is what the studio's
 * Behalten/Verwerfen banner prints ("Vorschlag: …"). The op-type tally
 * `summarizeEditorOps` produces would read "Vorschlag: 2× set-text" there.
 */
type PlannedOps = EditorOp[] | { operations: EditorOp[]; label: string };

/**
 * The note the doc dispatch returns to the model. Deliberately not past tense
 * and deliberately not "gespeichert": BlockNote shows the change as suggestion
 * marks, and whether it survives is the PERSON's decision, taken after this
 * turn has ended. The server never learns the outcome.
 */
const DOC_DISPATCH_NOTE =
  'Die Änderung wird im Dokument als Vorschlag angezeigt; die Person nimmt sie dort an oder verwirft sie.';

/** How much of the model's instruction rides in the per-turn log and the edit
 *  summary — enough to tell two edits apart, not a second copy of the brief. */
const INSTRUCTION_ECHO_CHARS = 120;

/**
 * Both reference channels the docs AI gets, under their own headings.
 *
 * Two different questions the same field answers: "welche Fakten sollen rein"
 * (the loop's gathered sources — `recherchiere X und bau es ein`) and "welchen
 * Text meint die Person" (the previous assistant turn — `füge das ein`). The
 * docs AI sees only the document, so both have to travel with the instruction.
 *
 * Capped TOGETHER, because the cap protects the docs-AI system prompt and that
 * prompt carries the concatenation, not either half. And the PRIOR TURN comes
 * first, because the cap cuts the tail: a turn that both searched and points at
 * an earlier answer ("füge das ein") would otherwise lose exactly the text the
 * word "das" refers to, while keeping sources nobody asked to insert. The
 * prior turn is itself capped at the same ceiling upstream, so it can crowd the
 * sources out entirely — which is the right way round: sources are material the
 * instruction already quotes, the referenced text is not.
 */
function buildDocReferenceContent(state: ChatGraphState, sources: string | null): string | null {
  const prior = buildPriorTurnReference(state.messages ?? []);
  const blocks = [
    prior ? `VORHERIGE ANTWORT AUS DIESEM CHAT:\n${prior}` : '',
    sources ? `RECHERCHIERTE QUELLEN:\n${sources}` : '',
  ].filter(Boolean);
  if (blocks.length === 0) return null;
  const joined = blocks.join('\n\n---\n\n');
  return joined.length > EDIT_REFERENCE_CHAR_CAP
    ? joined.slice(0, EDIT_REFERENCE_CHAR_CAP)
    : joined;
}

const EDIT_SURFACE_SPECS: Record<EditorSurfaceKind, EditSurfaceSpec> = {
  doc: {
    strategy: 'dispatch',
    description:
      'Bearbeite das aktuell geöffnete Dokument (umschreiben, kürzen, ergänzen, Abschnitte einfügen). Nutze dies, nachdem du – falls nötig – recherchiert hast. Beschreibe im instruction-Feld vollständig, was geändert werden soll, inkl. der Inhalte/Fakten, die eingearbeitet werden sollen.',
    getTarget: (state) => (state.currentDocument ? { id: state.currentDocument.id } : null),
    dispatch: ({ instruction, state, referenceContent, target, sse }) => {
      const reference = buildDocReferenceContent(state, referenceContent);
      // Unchanged wire format (`triggerDocEditSchema`): what moved is WHO wrote
      // `userPrompt`. It used to be the raw user text forwarded by the
      // classifier stage; it is now the model's own, self-contained
      // instruction, which already carries the researched facts.
      sse.send('trigger_doc_edit', {
        targetDocumentId: target.id,
        userPrompt: instruction,
        useSelection: !!state.currentDocument?.selectionText,
        ...(reference ? { referenceContent: reference } : {}),
      });
      return { note: DOC_DISPATCH_NOTE };
    },
  },
  sheet: {
    strategy: 'plan-and-send',
    description:
      'Bearbeite die aktuell geöffnete Tabelle direkt: Werte, Formeln, Zahlformate, Formatierung (Schrift, Farben, Ausrichtung, Rahmen), Spaltenbreiten, fixierte Zeilen, Arbeitsblätter (anlegen, umbenennen, kopieren, löschen), Sortieren, Filter, Tabellen, bedingte Formate (auch Farbskalen und Datenbalken), Dropdowns, Notizen, Links, Suchen und Ersetzen, Reihen fortsetzen. „Markiert:" im Tabellenkontext ist die Auswahl der Person. Nutze dies, nachdem du – falls nötig – recherchiert hast, um die Ergebnisse einzutragen. Beschreibe im "instruction"-Feld genau, was geändert werden soll, inkl. der konkreten Zahlen.',
    getTarget: (state) => (state.currentDocument ? { id: state.currentDocument.id } : null),
    planOperations: ({ instruction, state, appliedNote, referenceContent }) =>
      generateSheetOperations({
        userPrompt: instruction,
        sheetContext: `${state.currentDocument?.markdown ?? ''}${appliedNote}`,
        referenceContent,
      }),
  },
  presentation: {
    strategy: 'plan-and-send',
    description:
      'Bearbeite die aktuell geöffnete Präsentation direkt (Folien hinzufügen/ändern/löschen/verschieben, Layout, Design). Nutze dies, nachdem du – falls nötig – recherchiert hast, um die Inhalte einzuarbeiten. Beschreibe im "instruction"-Feld genau, was geändert werden soll, inkl. der konkreten Inhalte.',
    getTarget: (state) => (state.currentDocument ? { id: state.currentDocument.id } : null),
    planOperations: ({ instruction, state, appliedNote, referenceContent }) =>
      generatePresentationOperations({
        userPrompt: instruction,
        presentationContext: `${state.currentDocument?.markdown ?? ''}${appliedNote}`,
        referenceContent,
        // The loop context has no deck meta — the user's locale is the best
        // proxy for the accent palette offered to the planner.
        brand: state.userLocale ?? null,
      }),
  },
  board: {
    strategy: 'plan-and-send',
    description:
      'Bearbeite das aktuell geöffnete Board direkt (neue Aufgaben, Spalten, Felder oder Ansichten anlegen). Nutze dies, nachdem du – falls nötig – recherchiert hast, um die Ergebnisse einzutragen. Beschreibe im "instruction"-Feld genau, was angelegt werden soll.',
    getTarget: (state) => (state.currentBoard ? { id: state.currentBoard.id } : null),
    planOperations: ({ instruction, state, appliedNote, referenceContent }) =>
      generateBoardOperations({
        userPrompt: instruction,
        board: state.currentBoard!,
        // boardAiService takes structured board + today, not a markdown string;
        // the applied-ops note rides along in referenceContent.
        referenceContent: appliedNote
          ? `${referenceContent ?? ''}${appliedNote}`
          : referenceContent,
        today: new Date().toISOString().slice(0, 10),
      }),
  },
  canvas: {
    strategy: 'plan-and-send',
    description:
      'Bearbeite das aktuell geöffnete Sharepic direkt (Texte, Farbschema, Elemente). Nutze dies, nachdem du – falls nötig – recherchiert hast, um die Ergebnisse einzuarbeiten. Beschreibe im "instruction"-Feld genau, was geändert werden soll, inkl. der konkreten Texte.',
    getTarget: (state) => (state.currentCanvas ? { id: state.currentCanvas.id } : null),
    planOperations: async ({ instruction, state, appliedNote, referenceContent }) => {
      const canvas = state.currentCanvas;
      // getTarget already refused a turn without a canvas; this keeps the
      // planner honest without widening the snapshot type with a cast.
      if (!canvas) return [];
      const prose = referenceContent ? `${referenceContent}${appliedNote}` : appliedNote;
      const result = await runCanvasSuggest({
        prompt: instruction,
        snapshot: canvas.snapshot,
        capabilities: canvas.capabilities,
        selectedElementIds: canvas.selectedElementIds ?? null,
        ...(prose ? { contextHints: { prose } } : {}),
        logTag: 'editor_tool_canvas',
      });
      // Thrown, not returned empty: planEditorOps contains it as
      // `planning_failed`, which the loop feeds back to the model. An empty
      // list is the DIFFERENT outcome "nothing to change".
      if (!result.ok) throw new Error(result.error);
      return { operations: result.operations, label: result.title };
    },
  },
};

const INSTRUCTION_DESC =
  'Vollständiger, in sich geschlossener Bearbeitungsauftrag auf Deutsch — inklusive der recherchierten Fakten/Inhalte, die eingearbeitet werden sollen. Der Auftrag wird unverändert an die Bearbeitung der Fläche weitergegeben und muss für sich allein verständlich sein.';

const SHAREPIC_EDIT_DESCRIPTION =
  'Überarbeite das aktuell geöffnete Sharepic (auch Karussell) über seinen Entwurf: Texte, Aufbau, Form, Hintergrund, Folien hinzufügen oder entfernen. Die Folie, die die Person gerade ansieht, und ihre Auswahl werden automatisch berücksichtigt. Nutze dies, nachdem du – falls nötig – recherchiert hast. Beschreibe im "instruction"-Feld vollständig, was geändert werden soll, inkl. der konkreten Texte. Fasse alle Änderungen in EINEN Aufruf.';

/**
 * Spec path for creator sharepics: instead of planning canvas ops, the
 * freitext creator drafts the deck again from its own spec (`current`), and the
 * client recomposes the pages from the returned spec. The event carries no
 * operations, only `sharepic`.
 */
function makeSharepicSpecEditTool(ctx: EditorToolCtx): Tool {
  // Set when a draft STARTS, not when it lands: a call the loop wrote off on
  // timeout keeps drafting (aiObject takes no abort signal), and a retry would
  // run a second draft next to it.
  let draftStarted = false;
  return tool({
    description: SHAREPIC_EDIT_DESCRIPTION,
    inputSchema: z.object({
      instruction: z.string().min(1).describe(INSTRUCTION_DESC),
    }),
    execute: async (
      { instruction }: { instruction: string },
      options?: { abortSignal?: AbortSignal }
    ) => {
      const canvas = ctx.state.currentCanvas;
      const source = canvas?.sharepic;
      if (!canvas || !source) {
        return { error: 'Es ist kein Sharepic geöffnet, das bearbeitet werden könnte.' };
      }
      // Each draft rewrites the WHOLE deck from the spec the request carried; a
      // second one would start from that stale spec and undo the first.
      if (draftStarted) {
        // A draft still running after an unchanged one: the honest answer is
        // still "nothing changed", not "being revised".
        if (ctx.state.editorEditUnchanged && !ctx.state.editorEditsSummary) {
          return { ok: true, unchanged: true, note: ctx.state.editorEditUnchanged };
        }
        return {
          error:
            'Das Sharepic wird in diesem Zug schon überarbeitet — weitere Änderungen bitte in der nächsten Nachricht.',
        };
      }

      // The person's own words are the change request: the model's brief
      // paraphrased them live (an extra headline change, "die Folie soll leer
      // bleiben"). The brief rides along to make it concrete (researched facts)
      // and, on a bare confirmation ("ja, mach das"), to say what the change is.
      const order =
        orderText(ctx.state.lastUserTextNoMentions ?? lastUserText(ctx.state)) || instruction;
      const referenceContent = ctx.sourceRegistry.renderReference() || null;
      const prompt = [
        order,
        instruction !== order
          ? `Notizen aus dem Gespräch (konkretisieren den Wunsch oben; bei kurzer Zustimmung wie „ja, mach das“ beschreiben sie die gewünschte Änderung):\n${instruction}`
          : '',
        referenceContent ? `Recherchierte Quellen dazu:\n${referenceContent}` : '',
      ]
        .filter(Boolean)
        .join('\n\n')
        .slice(0, SHAREPIC_PROMPT_MAX);
      const focus: SharepicDraftFocus = {
        slide: source.focusSlide,
        ...(source.selection.length > 0 && { elements: source.selection }),
      };

      draftStarted = true;
      let draft;
      try {
        draft = await draftSharepic(
          prompt,
          ctx.state.userLocale === 'de-AT' ? 'de-AT' : 'de-DE',
          source.deckSpec,
          source.photos ?? [],
          paintersFor(ctx.state.agentConfig?.userId ?? null),
          null,
          order,
          focus,
          instruction !== order ? instruction : null
        );
      } catch (err) {
        // Finished, just unsuccessfully — a retry runs alone.
        draftStarted = false;
        log.warn(
          `[EditorTool] canvas spec draft failed: ${err instanceof Error ? err.message : String(err)}`
        );
        return {
          error:
            err instanceof DraftFailedError && err.reason
              ? `Die Änderung am Sharepic ist nicht gelungen. ${DRAFT_LIMIT_TEXTS[err.reason]}`
              : 'Die Änderung am Sharepic konnte nicht geplant werden. Versuche es erneut.',
        };
      }
      // The loop wrote this call off (timeout) and told the model it failed —
      // a late event would change the deck behind that answer.
      if (options?.abortSignal?.aborted) {
        return { error: 'Die Änderung am Sharepic hat zu lange gedauert.' };
      }
      // Live, "Entferne die Quellenangabe" on a sharepic without one came back
      // as the same deck, and the answer still claimed the removal. JSON
      // round-trip: absent and `undefined` optional fields compare equal.
      if (
        isDeepStrictEqual(
          JSON.parse(JSON.stringify(draft.spec)),
          JSON.parse(JSON.stringify(source.deckSpec))
        )
      ) {
        log.info(`[EditorTool] canvas spec unchanged for "${order}"`);
        const hinweis = withoutPaletteHinweis(draft.hinweis ?? null);
        // Live the answer still said "ich mache dieses Element kleiner": split
        // mode's writer never sees the result — hence the state field for
        // artifactNotes; the note spells it out for the unified loop.
        const reason =
          hinweis ??
          'Der Entwurf des Sharepics blieb mit diesem Wunsch genau gleich – entweder ist das Gewünschte schon so eingestellt, oder es lässt sich über den Entwurf so nicht einstellen.';
        // Live, "Mint" on a mint deck was answered with "ich habe in diesem Turn
        // kein Werkzeug ausgeführt": the writer saw neither that the edit ran
        // nor what the deck already shows.
        const note = `Es wurde NICHTS geändert: ${reason.replace(/[.!]?\s*$/, '.')} ${describeBackgrounds(source.deckSpec)} Die Bearbeitung ist gelaufen – behaupte nicht, du hättest kein Werkzeug ausgeführt. Sag der Person ehrlich, was zutrifft, und schlag vor, was stattdessen geht.`;
        ctx.state.editorEditUnchanged = note;
        // Nothing was emitted: a second draft this turn cannot undo anything.
        draftStarted = false;
        return {
          ok: true,
          unchanged: true,
          note,
          ...(hinweis && { hinweis }),
        };
      }

      const echo =
        instruction.length > INSTRUCTION_ECHO_CHARS
          ? `${instruction.slice(0, INSTRUCTION_ECHO_CHARS)}…`
          : instruction;
      const summary = 'Sharepic überarbeitet';
      const event: EditorOperationsEvent = {
        surface: 'canvas',
        targetId: canvas.id,
        operations: [],
        summary,
        sharepic: {
          spec: draft.spec,
          attributions: draft.attributions,
          hinweis: draft.hinweis ?? null,
        },
      };
      ctx.sse.send('editor_operations', event);
      // A change did land this turn: the earlier "nothing changed" is void.
      ctx.state.editorEditUnchanged = null;

      ctx.appliedOpsLog.push(`${summary}: ${echo}`);
      // Live "Sand" became hellgrau and the answer still said "auf Sand".
      const editNote = `${summary} (${echo})${draft.hinweis ? ` – Hinweis für die Person: ${draft.hinweis}` : ''}`;
      ctx.state.editorEditsSummary = ctx.state.editorEditsSummary
        ? `${ctx.state.editorEditsSummary}; ${editNote}`
        : editNote;
      log.info(
        `[EditorTool] emitted canvas spec (${draft.spec.slides.length} slide(s)) for "${instruction}"`
      );
      return {
        ok: true,
        slideCount: draft.spec.slides.length,
        ...(draft.hinweis && { hinweis: draft.hinweis }),
      };
    },
  });
}

/**
 * Builds the edit tool for the active editor surface, or null when the router
 * resolved no surface for this turn (`state.editToolSurface`). Mount it under
 * {@link editToolNameFor}.
 */
export function makeEditArtifactTool(ctx: EditorToolCtx): Tool | null {
  const kind = ctx.state.editToolSurface;
  if (!kind) return null;
  if (editToolNameFor(ctx.state) === 'edit_current_sharepic') {
    return makeSharepicSpecEditTool(ctx);
  }
  const spec = EDIT_SURFACE_SPECS[kind];

  return tool({
    description: spec.description,
    inputSchema: z.object({
      instruction: z.string().min(1).describe(INSTRUCTION_DESC),
    }),
    execute: async ({ instruction }: { instruction: string }) => {
      const artefact = EDITOR_SURFACE_NOUNS[kind];
      const feminine = artefact.gender === 'f';
      const kein = feminine ? 'keine' : 'kein';
      const relative = feminine ? 'die' : 'das';
      const anDer = feminine ? 'an der' : 'am';

      const target = spec.getTarget(ctx.state);
      if (!target) {
        return {
          error: `Es ist ${kein} ${artefact.noun} geöffnet, ${relative} bearbeitet werden könnte.`,
        };
      }

      const referenceContent = ctx.sourceRegistry.renderReference() || null;

      // Discriminated on `spec.strategy`, never destructured — the branch is
      // what narrows `spec` to the one member that has `dispatch`.
      if (spec.strategy === 'dispatch') {
        // A second dispatch in the same turn is REFUSED, not queued. The client
        // has no queue: `invokeDocumentAI` (packages/docs/src/lib) tracks
        // in-flight invocations in a Set purely as a SIGNAL for the review UI —
        // it neither awaits nor rejects a second call, so a second invoke would
        // fork the Y.Doc while the first fork is still being written into, and
        // its `finally` would then clear the in-flight flag for both. The server
        // cannot wait for the first one either (there is no acknowledgement
        // channel), so telling the model to wait is the only honest answer.
        if (ctx.appliedOpsLog.length > 0) {
          return {
            error: `Es läuft bereits eine Bearbeitung ${anDer} ${artefact.noun} — warte auf die Rückmeldung.`,
          };
        }
        const dispatched = spec.dispatch({
          instruction,
          state: ctx.state,
          referenceContent,
          target,
          sse: ctx.sse,
        });
        const echo =
          instruction.length > INSTRUCTION_ECHO_CHARS
            ? `${instruction.slice(0, INSTRUCTION_ECHO_CHARS)}…`
            : instruction;
        ctx.appliedOpsLog.push(`Bearbeitung angestoßen: ${echo}`);
        const dispatchNote = `Bearbeitung ${anDer} ${artefact.noun} angestoßen (${echo})`;
        ctx.state.editorEditsSummary = ctx.state.editorEditsSummary
          ? `${ctx.state.editorEditsSummary}; ${dispatchNote}`
          : dispatchNote;
        log.info(`[EditorTool] dispatched ${kind} edit for "${instruction}"`);
        return { ok: true, dispatched: true, note: dispatched.note };
      }

      const appliedNote =
        ctx.appliedOpsLog.length > 0
          ? `\n\nBEREITS IN DIESEM TURN ANGEWENDET (plane darauf aufbauend, wiederhole diese Änderungen nicht):\n- ${ctx.appliedOpsLog.join('\n- ')}`
          : '';

      // Boxed rather than a plain `let`: the write happens inside the
      // planEditorOps callback, which owns the failure containment and must
      // stay the only caller of spec.planOperations.
      const plannerLabel: { value: string | null } = { value: null };
      const planned = await planEditorOps({
        log,
        logLabel: `[EditorTool] ${kind}`,
        plan: async () => {
          const result = await spec.planOperations({
            instruction,
            state: ctx.state,
            appliedNote,
            referenceContent,
          });
          if (Array.isArray(result)) return result;
          plannerLabel.value = result.label;
          return result.operations;
        },
      });

      if (!planned.ok) {
        // Contained: the loop feeds this back to the model (it apologises or
        // retries with a clearer instruction). No editor_operations is emitted,
        // so the artefact is never half-touched.
        if (planned.reason === 'planning_failed') {
          return {
            error: `Die Änderung ${anDer} ${artefact.noun} konnte nicht geplant werden. Versuche es erneut.`,
          };
        }
        return {
          ok: true,
          operationCount: 0,
          note: `Keine Änderung ${anDer} ${artefact.noun} nötig — es wurde nichts geändert.`,
        };
      }

      const { operations } = planned;
      // Two different summaries, deliberately: `planned.summary` is always the
      // op-kind tally, `plannerLabel` the canvas planner's own German name for
      // the batch. The SSE event (and with it the studio banner) takes the name
      // where there is one — but the per-turn log takes BOTH. A second
      // edit_document call in the same turn plans against a server snapshot
      // that is already stale, so it has to know WHAT was changed, not just
      // what the change was called.
      const summary = plannerLabel.value ?? planned.summary;
      const applied =
        plannerLabel.value != null ? `${plannerLabel.value} — ${planned.summary}` : planned.summary;
      ctx.appliedOpsLog.push(`${operations.length} Op(s): ${applied}`);
      // Surface a human edit summary onto shared state so the synth prompt makes
      // the model confirm the change (not write empty text or a false refusal).
      const editNote = `${operations.length} Änderung${operations.length === 1 ? '' : 'en'} ${anDer} ${artefact.noun} (${summary})`;
      ctx.state.editorEditsSummary = ctx.state.editorEditsSummary
        ? `${ctx.state.editorEditsSummary}; ${editNote}`
        : editNote;
      emitEditorOperations(ctx.sse, kind, target.id, operations, summary);

      log.info(`[EditorTool] emitted ${operations.length} ${kind} op(s) for "${instruction}"`);
      return { ok: true, operationCount: operations.length, opSummary: summary };
    },
  });
}
