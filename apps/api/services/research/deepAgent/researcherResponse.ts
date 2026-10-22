/**
 * What a researcher subagent hands back — a schema instead of prose.
 *
 * Until now the answer was free text with a `## Quellen` block the prompt ASKED
 * for, and the lead had to read both back out of it. Three things change with
 * a schema:
 *
 *  - the source block stops being a request and becomes a guarantee,
 *  - `luecken` lets the lead hand an open point straight back out as the next
 *    sub-question instead of inferring it from a sentence,
 *  - `belastbarkeit` gives the report a reason to hedge a section, which prose
 *    only conveyed when the worker happened to word it that way.
 *
 * What this does NOT change: the report's final source list still comes from
 * `ctx.sources` via `ensureSources` — the tools record what they actually
 * fetched, which is the only account that cannot be invented. The gain here is
 * the mapping from statements to sources, not the list.
 *
 * The answer travels as a tool call, `antwort_geben`, the same strategy
 * LangChain's `ToolStrategy` used here: asking the MODEL for a tool call rather
 * than `response_format: json_schema`, which nobody has measured on the Gemma
 * worker lane. The worker's loop stops on the call (`hasToolCall`); the
 * `execute` only acknowledges it.
 */

import { tool } from 'ai';
import { z } from 'zod';

/** How sure the worker is — the one field the report may quote as a hedge. */
export const CONFIDENCE_LEVELS = ['hoch', 'mittel', 'gering'] as const;

export const ANSWER_TOOL_NAME = 'antwort_geben';

export const researcherResponseSchema = z.object({
  ergebnis: z
    .string()
    .describe(
      'Das Rechercheergebnis als Fließtext, 150 bis 400 Wörter. Keine Quellenliste hier — die gehört in `quellen`.'
    ),
  quellen: z
    .array(
      z.object({
        titel: z.string(),
        url: z
          .string()
          .optional()
          .describe('Vollständige URL. Weglassen, wenn die Quelle keine hat.'),
        notebook: z
          .string()
          .optional()
          .describe('Name des Notebooks, wenn die Quelle aus einem Korpus stammt.'),
      })
    )
    .describe('Nur tatsächlich genutzte Quellen. Keine erfundenen Adressen.'),
  luecken: z
    .array(z.string())
    .describe(
      'Was offen blieb — je Eintrag ein Satz, ausformuliert genug, um daraus eine eigene Teilfrage zu machen. Leer, wenn nichts offen ist.'
    ),
  belastbarkeit: z
    .enum(CONFIDENCE_LEVELS)
    .describe(
      'hoch = mehrere unabhängige Quellen; mittel = eine belastbare Quelle; gering = nur Indizien oder widersprüchliche Angaben.'
    ),
});

export type ResearcherResponse = z.infer<typeof researcherResponseSchema>;

export function researcherAnswerTool() {
  return tool({
    description:
      'Gibt dein Ergebnis an den Hauptagenten zurück. Rufe es genau einmal auf, wenn du fertig bist — danach endet deine Teilrecherche.',
    inputSchema: researcherResponseSchema,
    execute: async (): Promise<string> => 'Ergebnis übergeben.',
  });
}
