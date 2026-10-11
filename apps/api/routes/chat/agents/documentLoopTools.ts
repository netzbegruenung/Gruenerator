/**
 * Loop tools for chat documents: `read_document` and `edit_document_text`.
 * A targeted change ("kürz die Begründung") used to re-write the whole
 * document into the chat behind a confirm card (modify_doc). Now the model
 * names exact replacements; the first call shows them as a compact
 * before/after and writes nothing, the second (confirm=true, after the person
 * agreed) writes — the MCP two-step (confirmGate).
 */
import { tool, type Tool } from 'ai';
import { z } from 'zod';

import {
  applyReplacements,
  describeReplacements,
  readDocumentMarkdown,
  writeDocumentMarkdown,
} from '../../../services/docs/docTextEditService.js';
import { loadDocumentProse } from '../../docs/docProseReader.js';
import { checkDocumentWriteAccess } from '../../docs/documentAccess.js';

import { confirmGate } from './confirmGate.js';
import { resolveThreadArtifactId } from './threadArtifactTarget.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';

const NO_TARGET = 'In diesem Gespräch gibt es kein Dokument.';
const READ_CAP = 20_000;

interface DocumentToolCtx {
  state: ChatGraphState;
  threadId: string;
}

/** The classifier names the addressed document (docMentionIds) — the default target. */
function resolveDocumentId(state: ChatGraphState, documentId?: string): string | null {
  return resolveThreadArtifactId(state, 'document', documentId ?? state.docMentionIds?.[0]);
}

const documentIdField = z
  .string()
  .optional()
  .describe('ID eines bestimmten Dokuments; leer = das zuletzt im Gespräch genutzte');

export function makeReadDocumentTool(ctx: DocumentToolCtx): Tool {
  return tool({
    description: `Liest ein Dokument dieses Gesprächs im genauen Wortlaut (Markdown). Keine Änderung.

NUTZE vor edit_document_text, um die zu ersetzenden Stellen wörtlich zu kennen, und bei Fragen zum Inhalt.`,
    inputSchema: z.object({ documentId: documentIdField }),
    execute: async ({ documentId }) => {
      const id = resolveDocumentId(ctx.state, documentId);
      const userId = ctx.state.agentConfig?.userId ?? null;
      if (!id) return { error: NO_TARGET };
      // `loadDocumentProse` is null for no access AND for an empty document —
      // only the first is an error.
      if (!userId) return { error: 'Keine Sitzung — bitte neu anmelden.' };
      if (
        (await loadDocumentProse(id, userId)) === null &&
        !(await checkDocumentWriteAccess(id, userId))
      ) {
        return { error: 'Das Dokument wurde nicht gefunden oder ist nicht zugänglich.' };
      }
      const text = await readDocumentMarkdown(id);
      if (!text.trim()) return { documentId: id, inhalt: '(Das Dokument ist leer.)' };
      return { documentId: id, inhalt: text.slice(0, READ_CAP) };
    },
  });
}

export function makeEditDocumentTextTool(ctx: DocumentToolCtx): Tool {
  return tool({
    description: `Ändert gezielt Stellen in einem Dokument dieses Gesprächs: jede Ersetzung tauscht einen wörtlichen Ausschnitt ("alt", genau einmal im Dokument) gegen neuen Text ("neu"). Für Einfügungen nimm den Satz davor als "alt" und hänge den neuen Text an.

NUTZE bei jeder Änderung an einem vorhandenen Dokument; lies es vorher mit read_document. Der erste Aufruf zeigt nur die Änderungen und schreibt nichts: zeig sie der Person und rufe nach ihrem „ja" mit denselben Ersetzungen und confirm=true erneut auf. Schreib das Dokument NIE vollständig in den Chat.`,
    inputSchema: z.object({
      ersetzungen: z
        .array(z.object({ alt: z.string().min(1), neu: z.string() }))
        .min(1)
        .max(12),
      documentId: documentIdField,
      confirm: z.boolean().default(false).describe('true erst nach Zustimmung der Person'),
    }),
    execute: async ({ ersetzungen, documentId, confirm }) => {
      const id = resolveDocumentId(ctx.state, documentId);
      if (!id) return { error: NO_TARGET };
      const userId = ctx.state.agentConfig?.userId ?? null;
      if (!userId) return { error: 'Keine Sitzung — bitte neu anmelden.' };
      if (!(await checkDocumentWriteAccess(id, userId))) {
        return { error: 'Du hast keine Bearbeitungsrechte für dieses Dokument.' };
      }

      const current = await readDocumentMarkdown(id);
      const applied = applyReplacements(current, ersetzungen);
      if (!applied.ok) return { error: applied.error };

      const changes = describeReplacements(ersetzungen);
      const stop = confirmGate({
        state: ctx.state,
        threadId: ctx.threadId,
        confirm,
        question: `Soll das Dokument so geändert werden?\n${changes}`,
      });
      if (stop) return 'note' in stop ? { ...stop, aenderungen: changes } : stop;

      try {
        await writeDocumentMarkdown(id, applied.text, userId);
      } catch {
        return {
          error:
            'Die Änderung konnte nicht ins Dokument geschrieben werden. Versuch es bitte gleich noch einmal.',
        };
      }
      return {
        ok: true,
        documentId: id,
        note: `Das Dokument ist geändert (${ersetzungen.length} Stelle${ersetzungen.length === 1 ? '' : 'n'}).`,
      };
    },
  });
}
