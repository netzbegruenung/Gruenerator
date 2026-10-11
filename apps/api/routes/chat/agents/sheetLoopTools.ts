/**
 * Loop tools for chat sheets: `read_sheet` and `edit_sheet`. The `edit_sheet`
 * intent (regex lane, Tier 2.7) stays in front; these catch the follow-ups it
 * misses, so the model edits instead of describing an edit it never made.
 * Changes are queued on the sheet (sheetEditCore) — they reach the open editor
 * within a second, or the next one to open the sheet.
 */
import { tool, type Tool } from 'ai';
import { z } from 'zod';

import {
  formatSheetAsContext,
  loadSheetState,
} from '../../../services/sheets/SheetGenerationService.js';
import { planAndQueueSheetEdit, queuedSheetEditText } from '../services/sheetEditCore.js';

import { confirmGate } from './confirmGate.js';
import { resolveThreadArtifactId, threadHasArtifact } from './threadArtifactTarget.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';

const NO_TARGET = 'In diesem Gespräch gibt es keine Tabelle.';

interface SheetToolCtx {
  state: ChatGraphState;
  threadId: string;
}

export function resolveLoopSheetId(state: ChatGraphState, sheetId?: string): string | null {
  return resolveThreadArtifactId(state, 'sheet', sheetId);
}

export function hasThreadSheet(state: ChatGraphState): boolean {
  return threadHasArtifact(state, 'sheet');
}

const sheetIdField = z
  .string()
  .optional()
  .describe('ID einer bestimmten Tabelle; leer = die zuletzt im Gespräch genutzte');

export function makeReadSheetTool(ctx: SheetToolCtx): Tool {
  return tool({
    description: `Liest eine Tabelle dieses Gesprächs: Blätter, Zellen (A1-Adressen) und noch nicht angewendete Änderungen. Keine Änderung.

NUTZE bei Fragen zur Tabelle ("was steht in Spalte B", "wie ist sie sortiert") und vor einer Änderung, wenn unklar ist, welche Zellen gemeint sind.`,
    inputSchema: z.object({ sheetId: sheetIdField }),
    execute: async ({ sheetId }) => {
      const id = resolveLoopSheetId(ctx.state, sheetId);
      if (!id) return { error: NO_TARGET };
      const userId = ctx.state.agentConfig?.userId ?? null;
      const loaded = userId ? await loadSheetState(id, userId) : null;
      if (!loaded) return { error: 'Die Tabelle wurde nicht gefunden oder ist nicht zugänglich.' };
      return { sheetId: id, inhalt: formatSheetAsContext(loaded) };
    },
  });
}

export function makeEditSheetTool(ctx: SheetToolCtx): Tool {
  return tool({
    description: `Ändert eine Tabelle dieses Gesprächs: Werte, Formeln, Formatierung, Zeilen/Spalten einfügen, sortieren, filtern, Diagramme.

NUTZE bei JEDER Änderung an einer vorhandenen Tabelle. "anweisung" ist der Wortlaut der Person. Löscht die Änderung Zeilen, Spalten, Blätter oder Bereiche, fragt das Werkzeug zurück — dann die Person fragen und erst nach ihrer Zustimmung mit confirm=true erneut aufrufen. NICHT für eine neue Tabelle.`,
    inputSchema: z.object({
      anweisung: z.string().min(1).describe('Was geändert werden soll — im Wortlaut der Person'),
      sheetId: sheetIdField,
      confirm: z
        .boolean()
        .default(false)
        .describe('true erst, nachdem die Person dem Löschen zugestimmt hat'),
    }),
    execute: async ({ anweisung, sheetId, confirm }) => {
      const id = resolveLoopSheetId(ctx.state, sheetId);
      if (!id) return { error: NO_TARGET };
      const userId = ctx.state.agentConfig?.userId ?? null;
      if (!userId) return { error: 'Keine Sitzung — bitte neu anmelden.' };
      if (confirm) {
        const refused = confirmGate({
          state: ctx.state,
          threadId: ctx.threadId,
          confirm,
          question: '',
        });
        if (refused) return refused;
      }

      const outcome = await planAndQueueSheetEdit({
        sheetId: id,
        userId,
        instruction: anweisung,
        destructiveAllowed: confirm,
      });
      if (outcome.status === 'failed') return { error: outcome.message };
      if (outcome.status === 'needs_confirmation') {
        return confirmGate({
          state: ctx.state,
          threadId: ctx.threadId,
          confirm: false,
          question: `Dabei würde in „${outcome.title}" Inhalt gelöscht (${outcome.summary}). Soll das so passieren?`,
        });
      }
      return {
        ok: true,
        sheetId: id,
        operationCount: outcome.operationCount,
        note: queuedSheetEditText(outcome),
      };
    },
  });
}
