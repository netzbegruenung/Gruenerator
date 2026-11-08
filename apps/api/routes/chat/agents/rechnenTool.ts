/**
 * `rechnen`: exact counting and arithmetic for the agentic loop.
 *
 * The same core as the single-pass `compute` branch (`planAndCompute` in
 * computeNode): a model reads the order into a plan — lane `compute`, Mistral
 * Large first, chosen by hit rate — and computeEngine does every number in
 * plain JS. The loop model decides WHEN to call it; it never does the
 * arithmetic itself, because language models miscount glyphs and digits.
 *
 * Surfaced through the existing compute card, like `vertonen` and
 * `tabelle_auswerten`: the payload goes to `state.computedResult` (persisted as
 * message metadata by postResponseService) and streams as a `compute` event.
 */
import { tool, type Tool } from 'ai';
import { z } from 'zod';

import { planAndCompute } from '../../../agents/langgraph/ChatGraph/nodes/computeNode.js';
import { createLogger } from '../../../utils/logger.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { SSEWriter } from '../services/sseHelpers.js';

const log = createLogger('RechnenTool');

export interface RechnenToolCtx {
  state: ChatGraphState;
  sse: SSEWriter;
}

export function makeRechnenTool(ctx: RechnenToolCtx): Tool {
  return tool({
    description: `Rechnet und zählt EXAKT per Programm: Prozent, Summen, Differenzen, Dreisatz, Zeichen-/Wörterzahl eines Textes, Einheiten umrechnen, Tage zwischen Daten, Datum plus Zeitspanne, und das Nachrechnen von Zahlenangaben in einem Text.

NUTZE WENN eine Antwort eine ausgerechnete oder gezählte Zahl braucht — rechne und zähle NIE selbst, auch nicht „im Kopf“. Zahlen aus einer Recherche erst holen, dann hier rechnen.
NICHT für angehängte Tabellen (dafür gibt es ein eigenes Tabellen-Werkzeug), nicht für Schätzungen oder Prognosen.`,
    inputSchema: z.object({
      auftrag: z
        .string()
        .min(1)
        .max(2000)
        .describe(
          'Was berechnet oder gezählt werden soll, mit allen Zahlen und Einheiten, z.B. "20 % von 340" oder "Tage vom 1.3.2026 bis heute".'
        ),
      text: z
        .string()
        .max(60_000)
        .optional()
        .describe(
          'Nur zum Zählen oder Nachrechnen: der vollständige, unveränderte Text, um den es geht.'
        ),
    }),
    execute: async ({ auftrag, text }) => {
      const request = text ? `Anfrage: "${auftrag}"\n\nText:\n${text}` : `Anfrage: "${auftrag}"`;
      let outcome;
      try {
        outcome = await planAndCompute(request, text ?? auftrag);
      } catch (error) {
        log.warn(`[Rechnen] failed: ${error instanceof Error ? error.message : String(error)}`);
        return { error: 'Die Berechnung ist gerade nicht verfügbar. Nenne keine eigene Zahl.' };
      }
      const result = outcome.result;
      if (!result) {
        return {
          error:
            'Keine sichere Berechnung möglich. Nenne keine eigene Zahl; frag nach dem genauen Ausdruck oder Text.',
        };
      }

      ctx.state.computedResult = result;
      ctx.state.computedResultFresh = true;
      ctx.sse.send('compute', { compute: result });
      log.info(`[Rechnen] ${outcome.operation} → "${result.summary}"`);
      return {
        ok: true,
        operation: result.operation,
        ergebnis: result.entries.map((e) => `${e.label}: ${e.value}`),
        zusammenfassung: result.summary,
        note: 'Programmatisch berechnet und der*dem Nutzer*in als Karte angezeigt. Übernimm die Werte EXAKT und rechne nicht selbst nach. Bestätige oder verwirf keine Zahl, die hier nicht steht.',
      };
    },
  });
}
