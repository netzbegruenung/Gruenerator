/**
 * Loop tools for chat presentations: `read_presentation` and
 * `edit_presentation`. Before these, a deck made in the chat could not be
 * changed from the chat at all (#4456) — the model offered edits and then
 * described slides it never touched. Edits land on the live deck
 * (presentationEditCore); slide deletions go through confirmGate for Reveal
 * decks and through the confirmation card (`apply_canvas_deck_edit`) for canvas decks.
 */
import { tool, type Tool } from 'ai';
import { z } from 'zod';

import { canvasAccessible, loadCanvasAsContext } from '../../../services/canvas/canvasContext.js';
import { planAndApplyCanvasDeckEdit } from '../../../services/presentations/canvasDeckEdit.js';
import {
  formatPresentationAsContext,
  loadPresentationState,
} from '../../../services/presentations/PresentationGenerationService.js';
import { emitToolConfirmAction, newActionId } from '../services/confirmActionService.js';
import { planAndApplyPresentationEdit } from '../services/presentationEditCore.js';

import { confirmedArgs, confirmGate, recordArtifactEdit } from './confirmGate.js';
import { resolveThreadArtifactId } from './threadArtifactTarget.js';

import type { ChatGraphState, PendingAction } from '../../../agents/langgraph/ChatGraph/types.js';
import type { SSEWriter } from '../services/sseHelpers.js';

const NO_TARGET = 'In diesem Gespräch gibt es keine Präsentation.';

interface PresentationToolCtx {
  state: ChatGraphState;
  threadId: string;
  sse: SSEWriter;
}

const presentationIdField = z
  .string()
  .optional()
  .describe('ID einer bestimmten Präsentation; leer = die zuletzt im Gespräch genutzte');

export function makeReadPresentationTool(ctx: PresentationToolCtx): Tool {
  return tool({
    description: `Liest eine Präsentation dieses Gesprächs: alle Folien mit Nummer, Titel und Inhalt. Keine Änderung.

NUTZE bei Fragen zur Präsentation ("was steht auf Folie 3", "wie viele Folien") und vor einer Änderung, wenn unklar ist, welche Folie gemeint ist.`,
    inputSchema: z.object({ presentationId: presentationIdField }),
    execute: async ({ presentationId }) => {
      const id = resolveThreadArtifactId(ctx.state, 'presentation', presentationId);
      if (!id) return { error: NO_TARGET };
      const userId = ctx.state.agentConfig?.userId ?? null;
      const loaded = userId ? await loadPresentationState(id, userId) : null;
      if (!loaded && userId) {
        const canvasText = await loadCanvasAsContext(id, userId);
        if (canvasText) {
          return {
            presentationId: id,
            slideCount: (canvasText.match(/^## (?:Folie|Seite) \d+/gm) ?? []).length,
            inhalt: canvasText,
          };
        }
      }
      if (!loaded) {
        return { error: 'Die Präsentation wurde nicht gefunden oder ist nicht zugänglich.' };
      }
      return {
        presentationId: id,
        slideCount: loaded.slides.length,
        inhalt: formatPresentationAsContext(loaded),
      };
    },
  });
}

export function makeEditPresentationTool(ctx: PresentationToolCtx): Tool {
  return tool({
    description: `Ändert eine Präsentation dieses Gesprächs: Folien hinzufügen, umschreiben, kürzen, verschieben, löschen, Layout und Design.

NUTZE bei JEDER Änderung an einer vorhandenen Präsentation. "anweisung" ist der Wortlaut der Person, mit konkreten Inhalten und Foliennummern. Löscht die Änderung Folien einer Canvas-Präsentation, zeigt das Werkzeug der Person selbst eine Bestätigungskarte — dann NICHT im Text nachfragen und nicht erneut aufrufen, die Person entscheidet auf der Karte. Bei älteren Präsentationen fragt das Werkzeug zurück — dann die Person fragen und erst nach ihrer Zustimmung mit confirm=true erneut aufrufen (confirm gilt nur dort). NICHT für eine neue Präsentation.`,
    inputSchema: z.object({
      anweisung: z
        .string()
        .min(1)
        .describe('Was geändert werden soll — im Wortlaut der Person, mit Foliennummern'),
      presentationId: presentationIdField,
      confirm: z
        .boolean()
        .default(false)
        .describe('true erst, nachdem die Person dem Löschen von Folien zugestimmt hat'),
    }),
    execute: async (input) => {
      const { anweisung, presentationId, confirm } = confirmedArgs(
        ctx.state,
        'edit_presentation',
        input.confirm,
        input
      );
      const id = resolveThreadArtifactId(ctx.state, 'presentation', presentationId);
      if (!id) return { error: NO_TARGET };
      const userId = ctx.state.agentConfig?.userId ?? null;
      if (!userId) return { error: 'Keine Sitzung — bitte neu anmelden.' };
      const isCanvas = await canvasAccessible(id, userId);
      if (confirm) {
        const refused = confirmGate({
          state: ctx.state,
          threadId: ctx.threadId,
          confirm,
          question: '',
        });
        if (refused) return refused;
      }

      const canvasOutcome = isCanvas
        ? await planAndApplyCanvasDeckEdit({
            canvasId: id,
            userId,
            instruction: anweisung,
            destructiveAllowed: confirm,
          })
        : null;
      const outcome =
        canvasOutcome ??
        (await planAndApplyPresentationEdit({
          presentationId: id,
          userId,
          instruction: anweisung,
          destructiveAllowed: confirm,
        }));
      if (outcome.status === 'failed') return { error: outcome.message };
      if (canvasOutcome?.status === 'needs_confirmation') {
        const pending: PendingAction = {
          actionId: newActionId(),
          threadId: ctx.threadId,
          userId,
          title: 'Folien löschen',
          preview: `„${canvasOutcome.title}": ${canvasOutcome.summary}`,
          createdAt: Date.now(),
          type: 'apply_canvas_deck_edit',
          payload: {
            canvasId: id,
            title: canvasOutcome.title,
            summary: canvasOutcome.summary,
            operations: canvasOutcome.operations,
            basePageIds: canvasOutcome.basePageIds,
          },
        };
        await emitToolConfirmAction(ctx.sse, pending, [
          { key: 'Präsentation', value: canvasOutcome.title },
          { key: 'Änderung', value: canvasOutcome.summary },
        ]);
        return {
          ok: true,
          needsConfirmation: true,
          note: 'Eine Bestätigungskarte zum Löschen der Folien wurde angezeigt; die Person entscheidet dort. Noch nichts geändert.',
        };
      }
      if (outcome.status === 'needs_confirmation') {
        return confirmGate({
          state: ctx.state,
          threadId: ctx.threadId,
          confirm: false,
          question: `Dabei würden in „${outcome.title}" Folien gelöscht (${outcome.summary}). Soll das so passieren?`,
        });
      }
      const skippedNote = outcome.skipped.length
        ? ` Nicht umgesetzt: ${outcome.skipped.join(' ')}`
        : '';
      const note = `Die Präsentation „${outcome.title}" ist geändert (${outcome.summary}).${skippedNote}`;
      recordArtifactEdit(ctx.state, note);
      return {
        ok: true,
        presentationId: id,
        operationCount: outcome.applied,
        note,
      };
    },
  });
}
