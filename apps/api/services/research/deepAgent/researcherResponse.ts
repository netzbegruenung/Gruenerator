/**
 * What a researcher subagent hands back — a schema instead of prose.
 *
 * Until now the answer was free text with a `## Quellen` block the prompt ASKED
 * for, and the lead had to read both back out of it. The docs put it plainly:
 * "When set, the parent receives the subagent's result as JSON instead of
 * free-form text." Three things change with that:
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
 * JSON Schema rather than zod, for the same reason as the tools: `apps/api`
 * runs zod 3 while the LangChain 1.x typings expect zod 4 shapes.
 * `ToolStrategy.fromSchema` takes a plain schema object and is the strategy
 * that asks the MODEL for a tool call — deliberately not `ProviderStrategy`,
 * which would need `response_format: json_schema` support on the Scaleway lane
 * that nobody has measured.
 */

import { ToolStrategy } from 'langchain';

/** How sure the worker is — the one field the report may quote as a hedge. */
export const CONFIDENCE_LEVELS = ['hoch', 'mittel', 'gering'] as const;

export const RESEARCHER_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    ergebnis: {
      type: 'string',
      description:
        'Das Rechercheergebnis als Fließtext, 150 bis 400 Wörter. Keine Quellenliste hier — die gehört in `quellen`.',
    },
    quellen: {
      type: 'array',
      description: 'Nur tatsächlich genutzte Quellen. Keine erfundenen Adressen.',
      items: {
        type: 'object',
        properties: {
          titel: { type: 'string' },
          url: {
            type: 'string',
            description: 'Vollständige URL. Weglassen, wenn die Quelle keine hat.',
          },
          notizbuch: {
            type: 'string',
            description: 'Name des Notizbuchs, wenn die Quelle aus einem Korpus stammt.',
          },
        },
        required: ['titel'],
      },
    },
    luecken: {
      type: 'array',
      description:
        'Was offen blieb — je Eintrag ein Satz, ausformuliert genug, um daraus eine eigene Teilfrage zu machen. Leer, wenn nichts offen ist.',
      items: { type: 'string' },
    },
    belastbarkeit: {
      type: 'string',
      enum: [...CONFIDENCE_LEVELS],
      description:
        'hoch = mehrere unabhängige Quellen; mittel = eine belastbare Quelle; gering = nur Indizien oder widersprüchliche Angaben.',
    },
  },
  required: ['ergebnis', 'quellen', 'luecken', 'belastbarkeit'],
} as const;

/**
 * `handleError` stays at its default (`true`): a schema miss retries the tool
 * call instead of throwing. That is the difference between a sub-question
 * costing one extra step and a sub-question failing outright — and on the Gemma
 * worker lane, where structured output over this path is unmeasured, it is the
 * whole safety margin.
 */
export function researcherResponseFormat(): ToolStrategy<Record<string, unknown>> {
  return ToolStrategy.fromSchema({ ...RESEARCHER_RESPONSE_SCHEMA });
}
