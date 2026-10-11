/**
 * Loop tools for chat explainables: `read_explainable` and `edit_explainable`.
 * Before these the model asked the person to paste its own page back into the
 * chat (#4459). Edits change the text; removing sections goes through
 * confirmGate.
 */
import { tool, type Tool } from 'ai';
import { z } from 'zod';

import { getOwnExplainable } from '../../../services/explainables/explainableRepository.js';
import {
  describeExplainable,
  reviseExplainable,
} from '../../../services/explainables/reviseExplainable.js';

import { confirmGate } from './confirmGate.js';
import { resolveThreadArtifactId } from './threadArtifactTarget.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { ExplainableContent } from '@gruenerator/contracts';

const NO_TARGET = 'In diesem Gespräch gibt es kein Explainable.';

interface ExplainableToolCtx {
  state: ChatGraphState;
  threadId: string;
}

const explainableIdField = z
  .string()
  .optional()
  .describe('ID eines bestimmten Explainables; leer = das zuletzt im Gespräch erstellte');

export function makeReadExplainableTool(ctx: ExplainableToolCtx): Tool {
  return tool({
    description: `Liest ein Explainable (Erklärseite) dieses Gesprächs: Titel, Zusammenfassung, Abschnitte, Kernaussagen. Keine Änderung.

NUTZE bei Fragen zum Explainable und vor einer Änderung, wenn unklar ist, welcher Abschnitt gemeint ist.`,
    inputSchema: z.object({ explainableId: explainableIdField }),
    execute: async ({ explainableId }) => {
      const id = resolveThreadArtifactId(ctx.state, 'explainable', explainableId);
      const userId = ctx.state.agentConfig?.userId ?? null;
      if (!id) return { error: NO_TARGET };
      const row = userId ? await getOwnExplainable(userId, id) : null;
      if (!row) return { error: 'Das Explainable wurde nicht gefunden.' };
      return { explainableId: id, inhalt: describeExplainable(row.content as ExplainableContent) };
    },
  });
}

export function makeEditExplainableTool(ctx: ExplainableToolCtx): Tool {
  return tool({
    description: `Ändert den Text eines Explainables (Erklärseite) dieses Gesprächs: Abschnitte umschreiben, kürzen, ergänzen, Begriffe erklären. Erklärbilder bleiben, neue werden nicht gemalt.

NUTZE bei JEDER Änderung an einem vorhandenen Explainable. "anweisung" ist der Wortlaut der Person. Fallen dabei Abschnitte weg, fragt das Werkzeug zurück — dann die Person fragen und erst nach ihrer Zustimmung mit confirm=true erneut aufrufen. NICHT für ein neues Explainable.`,
    inputSchema: z.object({
      anweisung: z.string().min(1).describe('Was geändert werden soll — im Wortlaut der Person'),
      explainableId: explainableIdField,
      confirm: z
        .boolean()
        .default(false)
        .describe('true erst, nachdem die Person dem Entfernen von Abschnitten zugestimmt hat'),
    }),
    execute: async ({ anweisung, explainableId, confirm }) => {
      const id = resolveThreadArtifactId(ctx.state, 'explainable', explainableId);
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

      const outcome = await reviseExplainable({
        userId,
        explainableId: id,
        instruction: anweisung,
        locale: ctx.state.userLocale === 'de-AT' ? 'de-AT' : 'de-DE',
        removalAllowed: confirm,
      });
      if (outcome.status === 'failed') return { error: outcome.message };
      if (outcome.status === 'needs_confirmation') {
        return confirmGate({
          state: ctx.state,
          threadId: ctx.threadId,
          confirm: false,
          question: `Dabei würden in „${outcome.title}" Abschnitte wegfallen (${outcome.removedHeadings.join(', ')}). Soll das so passieren?`,
        });
      }
      return {
        ok: true,
        explainableId: id,
        note: `Das Explainable „${outcome.title}" ist geändert. Die Erklärbilder bleiben${outcome.keptImages ? '' : ' (es hat keine)'}; neue werden nicht gemalt.`,
      };
    },
  });
}
