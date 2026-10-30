/**
 * Loop tools for chat presentations: `read_presentation` and
 * `edit_presentation`. Before these, a deck made in the chat could not be
 * changed from the chat at all (#4456) — the model offered edits and then
 * described slides it never touched. Edits land on the live deck
 * (presentationEditCore); slide deletions go through confirmGate.
 */
import { tool, type Tool } from 'ai';
import { z } from 'zod';

import { canvasAccessible, loadCanvasAsContext } from '../../../services/canvas/canvasContext.js';
import {
  formatPresentationAsContext,
  loadPresentationState,
} from '../../../services/presentations/PresentationGenerationService.js';
import { planAndApplyPresentationEdit } from '../services/presentationEditCore.js';

import { confirmedArgs, confirmGate, recordArtifactEdit } from './confirmGate.js';
import { resolveThreadArtifactId } from './threadArtifactTarget.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';

const NO_TARGET = 'In diesem Gespräch gibt es keine Präsentation.';

/** Bis das Bearbeiten im Chat auch Canvas-Präsentationen kann (Folge-PR). */
export const CANVAS_EDIT_UNAVAILABLE =
  'Diese Präsentation ist eine Canvas-Präsentation. Sie lässt sich im Chat noch nicht bearbeiten — bitte öffne sie im Editor (Studio) und ändere sie dort. Sag das der Person kurz und biete an, sie zu lesen oder eine neue Präsentation zu erstellen.';

interface PresentationToolCtx {
  state: ChatGraphState;
  threadId: string;
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

NUTZE bei JEDER Änderung an einer vorhandenen Präsentation. "anweisung" ist der Wortlaut der Person, mit konkreten Inhalten und Foliennummern. Löscht die Änderung Folien, fragt das Werkzeug zurück — dann die Person fragen und erst nach ihrer Zustimmung mit confirm=true erneut aufrufen. NICHT für eine neue Präsentation.`,
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
      if (await canvasAccessible(id, userId)) return { error: CANVAS_EDIT_UNAVAILABLE };
      if (confirm) {
        const refused = confirmGate({
          state: ctx.state,
          threadId: ctx.threadId,
          confirm,
          question: '',
        });
        if (refused) return refused;
      }

      const outcome = await planAndApplyPresentationEdit({
        presentationId: id,
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
