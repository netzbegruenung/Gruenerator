/**
 * `@antragsgruennrw`: Anträge, Änderungsanträge und Beschlüsse der Parteitage
 * der GRÜNEN NRW aus Antragsgrün. Drei Werkzeuge über `services/antragsgruen`:
 *
 * - `antragsgruen` findet (Thema und Filter) — Index, Status live darübergelegt,
 * - `antragsgruen_lesen` liest Dokumente ganz bzw. die passenden Abschnitte,
 * - `antragsgruen_auswerten` zählt exakt (je Antrag, Antragsteller*in, Votum …).
 *
 * Sie liegen hinter der zurückgestellten Gruppe `antragsgruen` (`toolScope.ts`):
 * die Erwähnung, ein Stichwort im Text oder eine frühere Nutzung im Thread öffnet sie.
 */
import { intentDeclineNote, isIntentAllowedForLocale } from '@gruenerator/shared/chat-intents';
import { tool, type Tool } from 'ai';
import { z } from 'zod';

import {
  ANTRAGSGRUEN_INSTANCES,
  type AntragsgruenInstance,
} from '../../../config/antragsgruenInstances.js';
import { getAntragsgruenLive } from '../../../services/antragsgruen/live.js';
import {
  AUSWERTUNG_NACH,
  countAntragsgruen,
  findAntragsgruen,
  readAntragsgruen,
  type AgDeps,
  type AgFilterArgs,
} from '../../../services/antragsgruen/search.js';
import { getAntragsgruenIndex } from '../../../services/antragsgruen/store.js';
import { PARTEITAGE_CONTENT_TYPES } from '../../../services/scrapers/implementations/ParteitageScraper/builders.js';
import { createLogger } from '../../../utils/logger.js';
import { type SourceRegistry } from '../services/agenticLoop/sourceRegistry.js';

import type { ChatGraphState, SearchResult } from '../../../agents/langgraph/ChatGraph/types.js';

const log = createLogger('antragsgruenTools');

/** Die Werkzeugnamen; `toolScope.ts` und der Katalog lesen sie von hier. */
export const ANTRAGSGRUEN_TOOLS = [
  'antragsgruen',
  'antragsgruen_lesen',
  'antragsgruen_auswerten',
] as const;

const MAX_CALLS_PER_TURN = 4;
const SOURCE = 'antragsgruen';

interface Ctx {
  state: ChatGraphState;
  sourceRegistry: SourceRegistry;
}

const nrw = ANTRAGSGRUEN_INSTANCES.find((i) => i.id === 'nrw')!;

function depsFor(instance: AntragsgruenInstance): AgDeps {
  return { instance, index: getAntragsgruenIndex(), live: getAntragsgruenLive(instance) };
}

const quelleOf = (instance: AntragsgruenInstance) =>
  `Antragsgrün ${instance.name} (${instance.host})`;

const STATUS_REGEL =
  'Ein Änderungsantrag ist ein Vorschlag, kein beschlossener Text; ein Antrag ist erst mit einem Beschluss Position des Landesverbands. Der Verfahrensvorschlag der Antragskommission ist eine Empfehlung, kein Abstimmungsergebnis. Bei einem Änderungsantrag steht je Zeilenblock „Bisher" (der Antragstext) und „Neu" (der Vorschlag). Stellen mit Zeilenmarke [Z. a–b] zitierst du mit ihren Zeilen, z. B. „(Z. 12–15)"; erfinde keine Zeilen.';

const filterShape = {
  parteitag: z
    .string()
    .min(1)
    .max(80)
    .optional()
    .describe(
      'Parteitag, z. B. "LDK Essen", "Landesparteirat Schwerte" oder "ldk26-02". Ohne: alle aufgenommenen.'
    ),
  typ: z
    .array(z.enum(PARTEITAGE_CONTENT_TYPES))
    .max(3)
    .optional()
    .describe('antrag (eingereichte Fassung), aenderungsantrag, beschluss'),
  antrag: z
    .string()
    .min(1)
    .max(30)
    .optional()
    .describe(
      'Kürzel eines Antrags, z. B. "WP-06" oder "V-02": der Antrag, sein Beschluss und alle Änderungsanträge dazu'
    ),
  antragsteller: z
    .string()
    .min(1)
    .max(80)
    .optional()
    .describe('Antragsteller*in, z. B. "KV Köln", "Grüne Jugend" oder ein Name'),
  votum: z
    .string()
    .min(1)
    .max(80)
    .optional()
    .describe(
      'Verfahrensvorschlag der Antragskommission, z. B. "Übernahme", "modifizierte Übernahme", "Abstimmung", "Ablehnung"'
    ),
  tagesordnungspunkt: z.string().min(1).max(80).optional(),
};

function declined(state: ChatGraphState): { resultCount: 0; sources: ''; error: string } | null {
  if (isIntentAllowedForLocale('antragsgruen', state.userLocale)) return null;
  return { resultCount: 0, sources: '', error: intentDeclineNote('antragsgruen') ?? '' };
}

const capped = (name: string) => ({
  resultCount: 0,
  sources: '',
  fuerSchreiber: `Schon ${MAX_CALLS_PER_TURN} Aufrufe von ${name} in diesem Zug — antworte jetzt mit dem Vorliegenden und nenne, was offen bleibt.`,
});

function unavailable(error: unknown, what: string) {
  log.warn(`[antragsgruen] ${what}: ${error instanceof Error ? error.message : String(error)}`);
  return {
    resultCount: 0,
    sources: '',
    error: 'Die Antragsgrün-Daten sind gerade nicht erreichbar.',
  };
}

export function makeAntragsgruenTool(ctx: Ctx): Tool {
  let calls = 0;
  const quelle = quelleOf(nrw);
  return tool({
    description: `Findet Anträge, Änderungsanträge und Beschlüsse der Parteitage der GRÜNEN NRW (Landesdelegiertenkonferenzen, Landesparteiräte) aus Antragsgrün. Mit query nach Inhalt gerankt (jeder Treffer mit Auszug), ohne query die neuesten. Filter: Parteitag, Typ, Antrag-Kürzel (liefert Antrag, Beschluss und alle Änderungsanträge dazu), Antragsteller*in, Verfahrensvorschlag, Tagesordnungspunkt. Ein Kürzel wie "L-02" gehört in antrag, nie in query. Der Status kommt live von Antragsgrün. Liefert Refs (z. B. "ag-nrw-a12345") und eine exakte Gesamtzahl für die Filter.

Nicht für ganze Texte, dafür antragsgruen_lesen. Nicht für Zählungen und Ranglisten, dafür antragsgruen_auswerten. Nicht für Beschlüsse anderer Landesverbände oder der Bundesebene.`,
    inputSchema: z.object({
      query: z
        .string()
        .min(1)
        .max(200)
        .optional()
        .describe('Thema in wenigen Stichwörtern; mit Filtern entbehrlich'),
      ...filterShape,
    }),
    execute: async ({ query, ...args }) => {
      const decline = declined(ctx.state);
      if (decline) return decline;
      if (++calls > MAX_CALLS_PER_TURN) return capped('antragsgruen');
      let found;
      try {
        found = await findAntragsgruen(depsFor(nrw), query, args as AgFilterArgs);
      } catch (error: unknown) {
        return unavailable(error, 'find');
      }
      const { resolved } = found;
      const hinweise = [
        ...resolved.notes,
        ...(found.liveOk
          ? []
          : ['Der Live-Status war nicht erreichbar; der Status ist der Stand von heute Nacht.']),
      ];
      if (resolved.leer || found.documents.length === 0) {
        return {
          resultCount: 0,
          sources: '',
          fuerSchreiber: resolved.leer ?? 'Keine passenden Dokumente gefunden.',
          ...(hinweise.length > 0 ? { hinweise } : {}),
          quelle,
        };
      }
      const results: SearchResult[] = found.documents.map((d, i) => ({
        source: SOURCE,
        title: d.title,
        content: d.content,
        ...(d.url ? { url: d.url } : {}),
        documentId: d.ref,
        relevance: 1 - 0.02 * i,
      }));
      const sources = ctx.sourceRegistry.register(results, { snippetChars: 3000 });
      const filterText = resolved.described.length > 0 ? ` (${resolved.described.join('; ')})` : '';
      const zaehlung = found.ranked
        ? `Die Liste ist nach Nähe zum Thema gereiht und zeigt ${found.documents.length} Dokumente; sie ist keine Themenzahl. Die Filter allein treffen ${found.gesamt} Dokumente${filterText}.`
        : `Die Filter treffen genau ${found.gesamt} Dokumente${filterText}; die Liste zeigt die ${found.documents.length} neuesten.`;
      return {
        resultCount: results.length,
        sources: sources ?? '',
        gesamt: found.gesamt,
        fuerSchreiber: `${zaehlung} ${STATUS_REGEL}`,
        hinweis: `Für ganze Texte antragsgruen_lesen mit den Refs (bis zu 6 in einem Aufruf). Für Zahlen je Antrag, Antragsteller*in oder Votum antragsgruen_auswerten. Nenne die Quelle: ${quelle}.`,
        ...(hinweise.length > 0 ? { hinweise } : {}),
        quelle,
      };
    },
  });
}

export function makeAntragsgruenLesenTool(ctx: Ctx): Tool {
  let calls = 0;
  const quelle = quelleOf(nrw);
  return tool({
    description: `Liest Anträge, Änderungsanträge und Beschlüsse aus Antragsgrün (GRÜNE NRW) über ihre Refs aus antragsgruen. Änderungsanträge markieren Änderungen als [eingefügt: …] und [gestrichen: …]. Lange Texte (Wahlprogramm-Kapitel): mit frage nur die passenden Abschnitte, sonst der Anfang.`,
    inputSchema: z.object({
      refs: z
        .array(z.string().regex(/^ag-[a-z]+-[ma]\d+$/))
        .min(1)
        .max(6)
        .describe('Refs aus der Liste von antragsgruen (Zeile „Ref: …")'),
      frage: z
        .string()
        .min(1)
        .max(200)
        .optional()
        .describe('Worum es geht; wählt bei langen Texten die passenden Abschnitte'),
    }),
    execute: async ({ refs, frage }) => {
      const decline = declined(ctx.state);
      if (decline) return decline;
      if (++calls > MAX_CALLS_PER_TURN) return capped('antragsgruen_lesen');
      let read;
      try {
        read = await readAntragsgruen(depsFor(nrw), refs, frage);
      } catch (error: unknown) {
        return unavailable(error, 'read');
      }
      const results: SearchResult[] = read.documents.map((d, i) => ({
        source: SOURCE,
        title: d.title,
        content: `${d.content}\n\n${d.text}${d.gekuerzt ? `\n\n[${frage ? 'Nur die zur Frage passenden Abschnitte' : 'Nur der Anfang'}; der Text ist länger. Volltext: ${d.url}]` : ''}`,
        ...(d.url ? { url: d.url } : {}),
        documentId: d.ref,
        relevance: 1 - 0.02 * i,
      }));
      const hinweise = [
        ...(read.missing.length > 0 ? [`Nicht gefunden: ${read.missing.join(', ')}.`] : []),
        ...(read.liveOk
          ? []
          : ['Der Live-Status war nicht erreichbar; der Status ist der Stand von heute Nacht.']),
      ];
      if (results.length === 0) {
        return { resultCount: 0, sources: '', error: hinweise[0] ?? 'Nichts gefunden.', quelle };
      }
      const sources = ctx.sourceRegistry.register(results, { snippetChars: 14_000 });
      return {
        resultCount: results.length,
        sources: sources ?? '',
        fuerSchreiber: STATUS_REGEL,
        hinweis: `Nenne die Quelle: ${quelle}.`,
        ...(hinweise.length > 0 ? { hinweise } : {}),
        quelle,
      };
    },
  });
}

export function makeAntragsgruenAuswertenTool(ctx: Ctx): Tool {
  let calls = 0;
  const quelle = quelleOf(nrw);
  return tool({
    description: `Zählt Anträge, Änderungsanträge und Beschlüsse der Parteitage der GRÜNEN NRW exakt: je Parteitag, je Antrag (Änderungsanträge pro Antrag), je Antragsteller*in, je Verfahrensvorschlag, je Tagesordnungspunkt, je Typ oder je aktuellem Status (live). Mit denselben Filtern wie antragsgruen. Für jede Frage nach „wie viele", „wer hat die meisten", „welcher Antrag hatte die meisten Änderungsanträge" oder „welche Parteitage gibt es". „Wie wurden die Änderungsanträge zu L-02 beschieden" = nach votum mit antrag "L-02".`,
    inputSchema: z.object({
      nach: z.enum(AUSWERTUNG_NACH),
      ...filterShape,
      top: z.number().int().min(1).max(50).optional().describe('So viele Zeilen (Vorgabe 20)'),
    }),
    execute: async ({ nach, top, ...args }) => {
      const decline = declined(ctx.state);
      if (decline) return decline;
      if (++calls > MAX_CALLS_PER_TURN) return capped('antragsgruen_auswerten');
      let result;
      try {
        result = await countAntragsgruen(depsFor(nrw), nach, args as AgFilterArgs, top ?? 20);
      } catch (error: unknown) {
        return unavailable(error, 'count');
      }
      const { resolved } = result;
      if (resolved.leer) {
        return {
          resultCount: 0,
          sources: '',
          fuerSchreiber: resolved.leer,
          ...(result.notes.length > 0 ? { hinweise: result.notes } : {}),
          quelle,
        };
      }
      const filterText = resolved.described.length > 0 ? ` (${resolved.described.join('; ')})` : '';
      const table = [
        `Auswertung nach ${nach}${filterText}: ${result.gesamt} Dokumente insgesamt.`,
        ...result.rows.map((r) => `- ${r.wert}: ${r.anzahl}`),
        ...(result.ohneWert ? [`- ohne Angabe: ${result.ohneWert}`] : []),
        ...(result.nichtAufgenommen.length > 0
          ? [
              `Bei Antragsgrün, aber nicht im Grünerator aufgenommen (${result.nichtAufgenommen.length}): ${result.nichtAufgenommen.slice(0, 15).join('; ')}${result.nichtAufgenommen.length > 15 ? ' …' : ''}`,
            ]
          : []),
        'Gezählt über die im Grünerator aufgenommenen Dokumente; Bewerbungen und überholte Zwischenfassungen sind nicht enthalten.',
      ].join('\n');
      const sources = ctx.sourceRegistry.register(
        [
          {
            source: SOURCE,
            title: `Auswertung Antragsgrün ${nrw.name}: nach ${nach}`,
            content: table,
            url: `https://${nrw.host}`,
            relevance: 1,
          },
        ],
        { snippetChars: 6000 }
      );
      return {
        resultCount: 1,
        sources: sources ?? '',
        gesamt: result.gesamt,
        fuerSchreiber: `Die Zahlen sind exakt; nenne sie so und erfinde keine weiteren. ${STATUS_REGEL}`,
        hinweis: `Für Beispiele zu einer Zeile antragsgruen mit dem passenden Filter. Nenne die Quelle: ${quelle}.`,
        ...(result.notes.length > 0 ? { hinweise: result.notes } : {}),
        quelle,
      };
    },
  });
}
