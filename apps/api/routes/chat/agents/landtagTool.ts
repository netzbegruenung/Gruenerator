/**
 * `landtag`: die Landtage als Werkzeug-Familie neben `bundestag` — Drucksachen
 * der Parlamente per normalisierten Filtern finden (Metadaten, Refs). Lesen
 * läuft über `parlament_lesen` mit `quelle: <parlament>`. Ein unterstützter
 * Filter wird angewendet, ein nicht unterstützter mit einem Hinweis gemeldet
 * (`resolveFilters`), nie still weggelassen. Nur Deutschland.
 */
import {
  landtagFilterSchema,
  landtagParlamentSchema,
  type LandtagFilter,
  type LandtagParlament,
} from '@gruenerator/contracts';
import { intentDeclineNote, isIntentAllowedForLocale } from '@gruenerator/shared/chat-intents';
import { tool, type Tool } from 'ai';
import { z } from 'zod';

import { landtagDocTitle } from '../../../services/landtag/docTitle.js';
import { findLandtag, LANDTAGE } from '../../../services/landtag/index.js';
import { FRAKTION_LABEL } from '../../../services/landtag/registry.js';
import { detectLandtagFromWording } from '../../../services/landtag/wording.js';
import { type SourceRegistry } from '../services/agenticLoop/sourceRegistry.js';
import { lastUserText } from '../services/messageHelpers.js';

import type { ChatGraphState, SearchResult } from '../../../agents/langgraph/ChatGraph/types.js';

function filterDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}.${m}.${y}` : iso;
}

/** Die Filter in Worten, eine Zeile je Filter, für die Karte im Chat. */
export function describeLandtagFilter(f: LandtagFilter): string[] {
  const lines: string[] = [];
  if (f.wahlperiode != null) lines.push(`Wahlperiode: ${f.wahlperiode}`);
  if (f.typ?.length) lines.push(`Art: ${f.typ.join(', ')}`);
  if (f.fraktion?.length)
    lines.push(`Fraktion: ${f.fraktion.map((k) => FRAKTION_LABEL[k]).join(', ')}`);
  if (f.datumVon && f.datumBis) {
    lines.push(`Zeitraum: ${filterDate(f.datumVon)} bis ${filterDate(f.datumBis)}`);
  } else if (f.datumVon) lines.push(`Zeitraum: ab ${filterDate(f.datumVon)}`);
  else if (f.datumBis) lines.push(`Zeitraum: bis ${filterDate(f.datumBis)}`);
  if (f.titel) lines.push(`Titel enthält: ${f.titel}`);
  if (f.schlagwort) lines.push(`Schlagwort: ${f.schlagwort}`);
  if (f.volltext) lines.push(`Volltext: ${f.volltext}`);
  return lines;
}

const PARLAMENTE = Object.values(LANDTAGE)
  .map((m) => `'${m.id}' (${m.parlament})`)
  .join(', ');

export function makeLandtagTool(ctx: {
  state: ChatGraphState;
  sourceRegistry: SourceRegistry;
}): Tool {
  const { state, sourceRegistry } = ctx;
  return tool({
    description: `Findet Drucksachen eines Landesparlaments: Anträge, Anfragen und Antworten, Gesetzentwürfe, Beschlussempfehlungen. Parlament: ${PARLAMENTE}. Filter: Wahlperiode, Art (typ), Fraktion, Zeitraum, Titel, Schlagwort, Volltext. Liefert eine Liste mit Refs (z. B. "BE 19/3519", Schriftliche Anfragen "BE 19/S27288"), nur Metadaten. Ein Filter, den das Parlament nicht kennt, wird nicht angewendet und im Hinweis genannt. Nur Deutschland.

Nicht für Inhalte, dafür parlament_lesen mit quelle = parlament. Nicht für den Bundestag, dafür bundestag. Nicht für Positionen der Grünen, dafür gruenerator_search.`,
    inputSchema: z.object({
      parlament: landtagParlamentSchema,
      query: z
        .string()
        .min(1)
        .max(200)
        .optional()
        .describe(
          'Thema in wenigen Stichwörtern; wird in Titeln gesucht. Mit Filtern entbehrlich.'
        ),
      ...landtagFilterSchema.shape,
    }),
    execute: async ({ parlament, query, ...args }) => {
      if (!isIntentAllowedForLocale('bundestag', state.userLocale)) {
        return { resultCount: 0, sources: '', error: intentDeclineNote('bundestag') ?? '' };
      }
      const meta = LANDTAGE[parlament as LandtagParlament];
      // Wie bei `bundestag`: was der Wortlaut hergibt (Zeitraum, Fraktion, Art), gilt mit; gesetzte Argumente gehen vor.
      const userText =
        state.lastUserTextNoMentions ??
        (state.messages ? lastUserText(state.messages) : null) ??
        '';
      const fromArgs = Object.fromEntries(
        Object.entries(args).filter(([, v]) => v !== undefined)
      ) as LandtagFilter;
      const filters: LandtagFilter = { ...detectLandtagFromWording(userText), ...fromArgs };

      let found: Awaited<ReturnType<typeof findLandtag>> | null = null;
      try {
        found = await findLandtag(parlament, query ?? '', filters);
      } catch {
        // PARDOK nicht erreichbar, Schlüssel fehlt, Zeitlimit: das Modell bekommt eine Absage statt eines Abbruchs.
      }
      if (!found) {
        return {
          resultCount: 0,
          sources: '',
          error: `Die Abfrage beim ${meta.parlament} ist gerade nicht erreichbar.`,
        };
      }
      const hinweise = [...found.notes];
      if (found.candidates.length === 0) {
        return {
          resultCount: 0,
          sources: '',
          error: hinweise[0] ?? `Keine passenden Dokumente im ${meta.parlament} gefunden.`,
          ...(hinweise.length > 1 ? { hinweise: hinweise.slice(1) } : {}),
          quelle: meta.quellenangabe,
        };
      }
      const results: SearchResult[] = found.candidates.map((c, i) => ({
        source: 'landtag',
        title: landtagDocTitle(meta, c),
        content: [c.titel, c.abstract ? `Schlagwort: ${c.abstract}` : null, `Ref: ${c.ref}`]
          .filter(Boolean)
          .join('\n'),
        ...(c.pdfUrl ? { url: c.pdfUrl } : {}),
        relevance: 1 - 0.02 * i,
      }));
      // Listenzeilen tragen Titel, Schlagwort und Ref: 3000 Zeichen halten sie ganz.
      const sources = sourceRegistry.register(results, { snippetChars: 3000 });
      return {
        resultCount: results.length,
        sources: sources ?? '',
        gesamt: found.gesamt,
        hinweis: `Die Liste enthält nur Metadaten. Für Inhalte \`parlament_lesen\` mit quelle '${meta.id}' aufrufen: bei einer Themen- oder Listenfrage alle einschlägigen Refs (bis zu 6) in einem Aufruf. Nenne in der Antwort die Quelle: ${meta.quellenangabe}.`,
        ...(hinweise.length > 0 ? { hinweise } : {}),
        quelle: meta.quellenangabe,
        // Nur für die Karte; wrapTools nimmt das Feld vor dem Modell heraus.
        uiCard: {
          parlament: meta.kurz,
          query: query ?? '',
          filter: describeLandtagFilter(filters),
          gesamt: found.gesamt,
          hinweise,
          quelle: meta.quellenangabe,
          portal: meta.portalUrl,
          dokumente: found.candidates.map((c) => ({
            ref: c.ref,
            typ: c.drucksachetyp,
            datum: c.datum,
            titel: c.titel,
            url: c.pdfUrl,
          })),
        },
      };
    },
  });
}
