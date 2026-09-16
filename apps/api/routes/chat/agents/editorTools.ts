/**
 * Editor edit tool for the agentic loop.
 *
 * Mounted only when the router resolved an editor surface with a tool path
 * (see routing.decideEditToolLoop / TOOL_EDIT_SURFACES). Lets the loop model edit
 * the OPEN artifact mid-conversation — search first, then edit, and write an
 * answer that knows what it changed — instead of a client round-trip to a
 * bespoke /api/{sheets,presentations}/:id/ai endpoint.
 *
 * Strategy: plan-and-send. `execute` calls the existing per-surface op-planning
 * core (Mistral-Medium prompt, unchanged) with the loop's gathered sources as
 * reference material, emits an `editor_operations` SSE event carrying the typed
 * ops, and returns a lean summary to the model. The client applies the ops in
 * place (Univer / Yjs) via its per-surface handler — the artifact lives in the
 * browser, so apply is always client-side.
 *
 * Add a surface by adding an {@link EditSurfaceSpec} to EDIT_SURFACE_SPECS AND
 * the matching client `editorOpsHandler` (`doc` is the last dispatch-strategy
 * surface, keeps its trigger_doc_edit path and is NOT specced here).
 */
import { tool, type Tool } from 'ai';
import { z } from 'zod';

import { createLogger } from '../../../utils/logger.js';
import { generateBoardOperations } from '../../boards/boardAiService.js';
import { runCanvasSuggest } from '../../canvas/services/runCanvasSuggest.js';
import { generatePresentationOperations } from '../../presentations/presentationAiService.js';
import { generateSheetOperations } from '../../sheets/sheetAiService.js';
import { EDITOR_SURFACE_NOUNS, type EditorSurfaceKind } from '../services/agenticLoop/routing.js';
import { type SourceRegistry } from '../services/agenticLoop/sourceRegistry.js';
import { emitEditorOperations, planEditorOps, type EditorOp } from '../services/editorOpsCore.js';
import { type SSEWriter } from '../services/sseHelpers.js';

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

/** Per-surface configuration for the plan-and-send edit tool. The artefact's
 *  noun and gender are NOT here: they live in `EDITOR_SURFACE_NOUNS`, because
 *  the synth's "cannot edit this turn" note names the same thing. */
interface EditSurfaceSpec {
  /** Model-facing tool description. */
  description: string;
  /** The open artefact for this surface, or null if none is open. */
  getTarget: (state: ChatGraphState) => { id: string } | null;
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
 * What a surface's planner hands back: the typed ops, optionally with a human
 * LABEL for the batch. Only canvas supplies one — its planner names every
 * suggestion in German ("Zitat geschärft"), and that name is what the studio's
 * Behalten/Verwerfen banner prints ("Vorschlag: …"). The op-type tally
 * `summarizeEditorOps` produces would read "Vorschlag: 2× set-text" there.
 */
type PlannedOps = EditorOp[] | { operations: EditorOp[]; label: string };

const EDIT_SURFACE_SPECS: Partial<Record<EditorSurfaceKind, EditSurfaceSpec>> = {
  sheet: {
    description:
      'Bearbeite die aktuell geöffnete Tabelle direkt (Werte, Formeln, Formate). Nutze dies, nachdem du – falls nötig – recherchiert hast, um die Ergebnisse einzutragen. Beschreibe im "instruction"-Feld genau, was geändert werden soll, inkl. der konkreten Zahlen.',
    getTarget: (state) => (state.currentDocument ? { id: state.currentDocument.id } : null),
    planOperations: ({ instruction, state, appliedNote, referenceContent }) =>
      generateSheetOperations({
        userPrompt: instruction,
        sheetContext: `${state.currentDocument?.markdown ?? ''}${appliedNote}`,
        referenceContent,
      }),
  },
  presentation: {
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
        ...(prose ? { contextHints: { prose } } : {}),
        logTag: 'editor_tool_canvas',
      });
      // Thrown, not returned empty: planEditorOps contains it as
      // `planning_failed`, which the loop feeds back to the model. An empty
      // list is the DIFFERENT outcome "nothing to change".
      if (!result.ok) throw new Error(result.error);
      const first = result.suggestions[0];
      if (!first) return [];
      return { operations: first.operations, label: first.title };
    },
  },
};

const INSTRUCTION_DESC =
  'Vollständiger, in sich geschlossener Bearbeitungsauftrag auf Deutsch — inklusive der recherchierten Fakten/Inhalte, die eingearbeitet werden sollen. Der Auftrag wird an den Fachplaner weitergegeben, der die konkreten Operationen erzeugt.';

/**
 * Builds the `edit_document` tool for the active editor surface, or null if the
 * surface has no plan-and-send tool path (`doc` keeps the dispatch path).
 */
export function makeEditArtifactTool(ctx: EditorToolCtx): Tool | null {
  const kind = ctx.state.editToolSurface;
  const spec = kind ? EDIT_SURFACE_SPECS[kind] : undefined;
  if (!kind || !spec) return null;

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
