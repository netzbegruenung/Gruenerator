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
 * the matching client `editorOpsHandler` (dispatch-strategy surfaces — docs,
 * canvas — keep their trigger_doc_edit path and are NOT specced here).
 */
import { tool, type Tool } from 'ai';
import { z } from 'zod';

import { createLogger } from '../../../utils/logger.js';
import { generatePresentationOperations } from '../../presentations/presentationAiService.js';
import { generateSheetOperations } from '../../sheets/sheetAiService.js';
import { type EditorSurfaceKind } from '../services/agenticLoop/routing.js';
import { type SourceRegistry } from '../services/agenticLoop/sourceRegistry.js';
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

/** Per-surface configuration for the plan-and-send edit tool. */
interface EditSurfaceSpec {
  /** Human artefact noun for messages ("Tabelle" / "Präsentation"). */
  noun: string;
  /** Model-facing tool description. */
  description: string;
  /**
   * Plan the typed operations from the instruction. `context` is the serialized
   * artefact (currentDocument.markdown for sheet/presentation) with the
   * applied-ops note appended; `referenceContent` is the loop's gathered sources.
   */
  planOperations: (input: {
    instruction: string;
    context: string;
    referenceContent: string | null;
  }) => Promise<Array<{ type: string }>>;
}

const EDIT_SURFACE_SPECS: Partial<Record<EditorSurfaceKind, EditSurfaceSpec>> = {
  sheet: {
    noun: 'Tabelle',
    description:
      'Bearbeite die aktuell geöffnete Tabelle direkt (Werte, Formeln, Formate). Nutze dies, nachdem du – falls nötig – recherchiert hast, um die Ergebnisse einzutragen. Beschreibe im "instruction"-Feld genau, was geändert werden soll, inkl. der konkreten Zahlen.',
    planOperations: ({ instruction, context, referenceContent }) =>
      generateSheetOperations({ userPrompt: instruction, sheetContext: context, referenceContent }),
  },
  presentation: {
    noun: 'Präsentation',
    description:
      'Bearbeite die aktuell geöffnete Präsentation direkt (Folien hinzufügen/ändern/löschen/verschieben, Layout, Design). Nutze dies, nachdem du – falls nötig – recherchiert hast, um die Inhalte einzuarbeiten. Beschreibe im "instruction"-Feld genau, was geändert werden soll, inkl. der konkreten Inhalte.',
    planOperations: ({ instruction, context, referenceContent }) =>
      generatePresentationOperations({
        userPrompt: instruction,
        presentationContext: context,
        referenceContent,
      }),
  },
};

const INSTRUCTION_DESC =
  'Vollständiger, in sich geschlossener Bearbeitungsauftrag auf Deutsch — inklusive der recherchierten Fakten/Inhalte, die eingearbeitet werden sollen. Der Auftrag wird an den Fachplaner weitergegeben, der die konkreten Operationen erzeugt.';

/** One-line summary of a planned op batch for the model + card ("2× add_slide"). */
function summarizeOps(operations: Array<{ type: string }>): string {
  const counts = new Map<string, number>();
  for (const op of operations) counts.set(op.type, (counts.get(op.type) ?? 0) + 1);
  return [...counts.entries()].map(([type, n]) => `${n}× ${type}`).join(', ');
}

/**
 * Builds the `edit_document` tool for the active editor surface, or null if the
 * surface has no plan-and-send tool path (docs/canvas keep the dispatch path).
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
      const doc = ctx.state.currentDocument;
      if (!doc) {
        return { error: `Es ist keine ${spec.noun} geöffnet, die bearbeitet werden könnte.` };
      }

      const referenceContent = ctx.sourceRegistry.renderAll() || null;
      const appliedNote =
        ctx.appliedOpsLog.length > 0
          ? `\n\nBEREITS IN DIESEM TURN ANGEWENDET (plane darauf aufbauend, wiederhole diese Änderungen nicht):\n- ${ctx.appliedOpsLog.join('\n- ')}`
          : '';
      const context = `${doc.markdown}${appliedNote}`;

      let operations;
      try {
        operations = await spec.planOperations({ instruction, context, referenceContent });
      } catch (err) {
        log.error(
          `[EditorTool] ${kind} planning failed: ${err instanceof Error ? err.message : err}`
        );
        // Contained: the loop feeds this back to the model (it apologises or
        // retries with a clearer instruction). No editor_operations is emitted,
        // so the artefact is never half-touched.
        return { error: `Die Änderung an der ${spec.noun} konnte nicht geplant werden. Versuche es erneut.` };
      }

      if (operations.length === 0) {
        return {
          ok: true,
          operationCount: 0,
          note: `Keine Änderung an der ${spec.noun} nötig — es wurde nichts geändert.`,
        };
      }

      const summary = summarizeOps(operations);
      ctx.appliedOpsLog.push(`${operations.length} Op(s): ${summary}`);
      ctx.sse.send('editor_operations', {
        surface: kind,
        targetId: doc.id,
        operations,
        summary,
      });

      log.info(`[EditorTool] emitted ${operations.length} ${kind} op(s) for "${instruction}"`);
      return { ok: true, operationCount: operations.length, opSummary: summary };
    },
  });
}
