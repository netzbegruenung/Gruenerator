/**
 * Editor edit tool for the agentic loop.
 *
 * Mounted only when the router resolved an editor surface with a tool path
 * (see routing.decideEditToolLoop / TOOL_EDIT_SURFACES). Lets the loop model edit
 * the OPEN artifact mid-conversation — search first, then edit, and write an
 * answer that knows what it changed — replacing the old client round-trip to
 * /api/{sheets,presentations,boards}/:id/ai.
 *
 * Strategy (v1): plan-and-send. `execute` calls the existing per-surface
 * op-planning core (Mistral-Medium prompt, unchanged) with the loop's gathered
 * sources as reference material, emits an `editor_operations` SSE event carrying
 * the typed ops, and returns a lean summary to the model. The client applies the
 * ops in place (Univer / Yjs) via its per-surface bridge — the artifact lives in
 * the browser, so apply is always client-side.
 */
import { tool, type Tool } from 'ai';
import { z } from 'zod';

import { createLogger } from '../../../utils/logger.js';
import { generateSheetOperations } from '../../sheets/sheetAiService.js';
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

/** One-line German summary of a planned sheet-op batch for the model + card. */
function summarizeSheetOps(operations: Array<{ type: string }>): string {
  const counts = new Map<string, number>();
  for (const op of operations) counts.set(op.type, (counts.get(op.type) ?? 0) + 1);
  const parts = [...counts.entries()].map(([type, n]) => `${n}× ${type}`);
  return parts.join(', ');
}

const INSTRUCTION_DESC =
  'Vollständiger, in sich geschlossener Bearbeitungsauftrag auf Deutsch — inklusive der recherchierten Fakten/Zahlen, die eingearbeitet werden sollen. Der Auftrag wird an den Tabellen-Planer weitergegeben, der die konkreten Zelloperationen erzeugt.';

/**
 * Builds the `edit_document` tool for the active editor surface, or null if the
 * surface has no tool-based edit path yet (only `sheet` in v1). Presentation and
 * board follow the same plan-and-send shape; canvas/doc use a dispatch strategy
 * added in a later phase.
 */
export function makeEditArtifactTool(ctx: EditorToolCtx): Tool | null {
  if (ctx.state.editToolSurface !== 'sheet') return null;

  return tool({
    description:
      'Bearbeite die aktuell geöffnete Tabelle direkt (Werte, Formeln, Formate, Diagramme). Nutze dies, nachdem du – falls nötig – recherchiert hast, um die Ergebnisse einzutragen. Beschreibe im "instruction"-Feld genau, was geändert werden soll, inkl. der konkreten Zahlen.',
    inputSchema: z.object({
      instruction: z.string().min(1).describe(INSTRUCTION_DESC),
    }),
    execute: async ({ instruction }: { instruction: string }) => {
      const doc = ctx.state.currentDocument;
      if (!doc) {
        return { error: 'Es ist keine Tabelle geöffnet, die bearbeitet werden könnte.' };
      }

      const referenceContent = ctx.sourceRegistry.renderAll() || null;
      const appliedNote =
        ctx.appliedOpsLog.length > 0
          ? `\n\nBEREITS IN DIESEM TURN ANGEWENDET (plane darauf aufbauend, wiederhole diese Änderungen nicht):\n- ${ctx.appliedOpsLog.join('\n- ')}`
          : '';
      const sheetContext = `${doc.markdown}${appliedNote}`;

      let operations;
      try {
        operations = await generateSheetOperations({
          userPrompt: instruction,
          sheetContext,
          referenceContent,
        });
      } catch (err) {
        log.error(
          `[EditorTool] sheet planning failed: ${err instanceof Error ? err.message : err}`
        );
        // Contained: the loop feeds this back to the model (it apologises or
        // retries with a clearer instruction). No editor_operations is emitted,
        // so the sheet is never half-touched.
        return { error: 'Die Tabellen-Änderung konnte nicht geplant werden. Versuche es erneut.' };
      }

      if (operations.length === 0) {
        return {
          ok: true,
          operationCount: 0,
          note: 'Keine Tabellen-Änderung nötig — es wurde nichts geändert.',
        };
      }

      const summary = summarizeSheetOps(operations);
      ctx.appliedOpsLog.push(`${operations.length} Op(s): ${summary}`);
      ctx.sse.send('editor_operations', {
        surface: 'sheet',
        targetId: doc.id,
        operations,
        summary,
      });

      log.info(`[EditorTool] emitted ${operations.length} sheet op(s) for "${instruction}"`);
      return { ok: true, operationCount: operations.length, opSummary: summary };
    },
  });
}
