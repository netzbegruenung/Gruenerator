/**
 * `landtag` (Deutschland: die Landtage als Werkzeug-Familie neben `bundestag`)
 * und `nationalrat` (Österreich): Dokumente der Parlamente per normalisierten
 * Filtern finden (Metadaten, Refs). Lesen läuft über `parlament_lesen` mit
 * `quelle: <parlament>`. Ein unterstützter Filter wird angewendet, ein nicht
 * unterstützter mit einem Hinweis gemeldet (`resolveFilters`), nie still
 * weggelassen. Beide Werkzeuge teilen die Ausführung; welches eine Person
 * bekommt, entscheidet die Locale (`toolCatalog`).
 */
import {
  landtagFilterSchema,
  type LandtagFilter,
  type LandtagParlament,
} from '@gruenerator/contracts';
import { intentDeclineNote, isIntentAllowedForLocale } from '@gruenerator/shared/chat-intents';
import { tool, type Tool } from 'ai';
import { z } from 'zod';

import { SOURCE_PREFIX } from '../../../agents/langgraph/ChatGraph/types.js';
import { landtagDocTitle } from '../../../services/landtag/docTitle.js';
import { findLandtag, LANDTAGE, landtageFor } from '../../../services/landtag/index.js';
import { FRAKTION_LABEL } from '../../../services/landtag/registry.js';
import { detectLandtagFromWording } from '../../../services/landtag/wording.js';
import { createLogger } from '../../../utils/logger.js';
import { type SourceRegistry } from '../services/agenticLoop/sourceRegistry.js';
import { lastUserText } from '../services/messageHelpers.js';

import { executeDirectSearch } from './directSearchExecutors.js';

import type { ChatGraphState, SearchResult } from '../../../agents/langgraph/ChatGraph/types.js';

const log = createLogger('LandtagTool');

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

interface Ctx {
  state: ChatGraphState;
  sourceRegistry: SourceRegistry;
}

/** Soviele Textstellen aus den Plenarprotokollen gehen an das Modell. */
const PROTOKOLL_PASSAGES = 6;

/**
 * Plenarprotokolle für Parlamente, deren Liste keine führt: Textstellen aus dem
 * Parlaments-Notebook, dort je Tagesordnungspunkt abgelegt. Gesucht wird mit der
 * ganzen Frage und nur dicht — die Hybridsuche brauchte auf den Parlaments-
 * Sammlungen 10–12 s, die dichte 0,2–3,8 s (#5290). Vorher stand hier ein
 * Verweis auf `gruenerator_search`; das Modell nahm die falsche Sammlung
 * („bayern", live 04.11.2026) und antwortete aus der Websuche.
 */
async function runProtokollSuche(
  { sourceRegistry }: Ctx,
  meta: (typeof LANDTAGE)[LandtagParlament],
  collection: string,
  question: string,
  filters: LandtagFilter
) {
  let passages: Awaited<ReturnType<typeof executeDirectSearch>>['results'] = [];
  let resolved = collection;
  try {
    const res = await executeDirectSearch({
      query: question,
      collection,
      limit: PROTOKOLL_PASSAGES,
      searchMode: 'vector',
      filters: { content_type: ['plenarprotokoll'] },
    });
    passages = (res.results ?? []).filter((r) => r.excerpt);
    resolved = res.collection;
  } catch (error: unknown) {
    log.warn(
      `[landtag] ${meta.id} Protokolle: ${error instanceof Error ? error.message : String(error)}`
    );
    return {
      resultCount: 0,
      sources: '',
      error: `Die Plenarprotokolle des ${meta.parlament} sind gerade nicht erreichbar.`,
    };
  }
  if (passages.length === 0) {
    return {
      resultCount: 0,
      sources: '',
      error: `Keine passende Stelle in den Plenarprotokollen des ${meta.parlament} gefunden.`,
      quelle: meta.quellenangabe,
    };
  }
  const results: SearchResult[] = passages.map((p, i) => ({
    source: `${SOURCE_PREFIX.GRUENERATOR}${resolved}`,
    title: `${meta.kurz} · Plenarprotokoll · ${p.source}`,
    content: p.excerpt,
    ...(p.url ? { url: p.url } : {}),
    relevance: 1 - 0.02 * i,
  }));
  const sources = sourceRegistry.register(results);
  const ohneZeitraum = filters.datumVon || filters.datumBis || filters.fraktion?.length;
  return {
    resultCount: results.length,
    sources: sources ?? '',
    hinweis: `Textstellen aus den Plenarprotokollen (je Tagesordnungspunkt), nach Nähe zur Frage. Sie tragen den Text selbst und sind direkt zitierbar; parlament_lesen gilt nur für Drucksachen. Nenne in der Antwort die Quelle: ${meta.quellenangabe}.`,
    ...(ohneZeitraum
      ? {
          hinweise: [
            'Zeitraum und Fraktion werden bei den Protokollen nicht gefiltert; die Frage selbst steuert die Auswahl.',
          ],
        }
      : {}),
    quelle: meta.quellenangabe,
  };
}

/** Gemeinsame Ausführung von `landtag` und `nationalrat`. */
const WAHLPERIODE_RE = /wahlperiode|legislatur|\bWP\s?\d/i;

async function runParlamentSuche(
  { state, sourceRegistry }: Ctx,
  parlament: LandtagParlament,
  query: string | undefined,
  args: LandtagFilter
) {
  const meta = LANDTAGE[parlament];
  // Wie bei `bundestag`: was der Wortlaut hergibt (Zeitraum, Fraktion, Art), gilt mit; gesetzte Argumente gehen vor.
  const userText =
    state.lastUserTextNoMentions ?? (state.messages ? lastUserText(state.messages) : null) ?? '';
  const fromArgs = Object.fromEntries(
    Object.entries(args).filter(([, v]) => v !== undefined)
  ) as LandtagFilter;
  const fromWording = detectLandtagFromWording(userText);
  const filters: LandtagFilter = { ...fromWording, ...fromArgs };
  // Ein Jahr in der Frage ist ein Zeitraum, keine Wahlperiode. Das Modell setzte für
  // „2026" trotzdem WP 19 (die Refs lauten „BE 19/…") und schnitt die seit 11/2026
  // laufende WP 20 ab: 73 statt 77 Anträge (live 04.11.2026, ein Satz in der
  // Beschreibung änderte daran nichts, 0/3).
  if (fromWording.datumVon && !WAHLPERIODE_RE.test(userText)) delete filters.wahlperiode;

  // Protokolle aus dem Notebook, wo die Liste keine führt; eine gemischte Art-Liste fragt die Liste ohne sie.
  const protokollNotebook = meta.typen.Plenarprotokoll ? undefined : meta.protokollNotebook;
  if (protokollNotebook && filters.typ?.includes('Plenarprotokoll')) {
    const rest = filters.typ.filter((t) => t !== 'Plenarprotokoll');
    if (rest.length === 0) {
      return runProtokollSuche(
        { state, sourceRegistry },
        meta,
        protokollNotebook,
        userText || (query ?? ''),
        filters
      );
    }
    filters.typ = rest;
  }
  const ohneProtokolle =
    protokollNotebook && args.typ?.includes('Plenarprotokoll')
      ? 'Plenarprotokolle sind nicht in dieser Liste; dafür landtag mit typ Plenarprotokoll allein aufrufen.'
      : null;

  let found: Awaited<ReturnType<typeof findLandtag>> | null = null;
  try {
    found = await findLandtag(parlament, query ?? '', filters);
  } catch (error: unknown) {
    // Parlaments-API nicht erreichbar, Schlüssel fehlt, Zeitlimit: das Modell bekommt eine Absage statt eines Abbruchs.
    // Der Grund gehört ins Log — die Absage allein sagt nicht, ob ein Schlüssel fehlt oder Qdrant weg ist.
    log.warn(`[landtag] ${parlament}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!found) {
    return {
      resultCount: 0,
      sources: '',
      error: `Die Abfrage beim ${meta.parlament} ist gerade nicht erreichbar.`,
    };
  }
  const hinweise = [...found.notes, ...(ohneProtokolle ? [ohneProtokolle] : [])];
  if (found.ausgeschlossen) {
    // Eine Grenze, kein Fehlschlag: als `error` sagte der Schreiber „Aufruf fehlgeschlagen",
    // als `hinweis` erreichte ihn der Grund gar nicht (live 29.10.2026, Anfragen im Nationalrat).
    return {
      resultCount: 0,
      sources: '',
      fuerSchreiber: found.ausgeschlossen,
      ...(hinweise.length > 0 ? { hinweise } : {}),
      quelle: meta.quellenangabe,
    };
  }
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
  // Die Liste ist gedeckelt; auf „wie viele" antwortete der Schreiber mit ihrer Länge
  // („insgesamt 25 Anträge" statt 83, live 04.11.2026). Er liest `fuerSchreiber`, nicht `hinweis`.
  const zaehlung =
    found.gesamt > results.length
      ? `Gesamtzahl laut ${meta.parlament}: ${found.gesamt} Dokumente${
          describeLandtagFilter(filters).length > 0
            ? ` (${describeLandtagFilter(filters).join('; ')})`
            : ''
        }. Die Liste zeigt nur ${results.length} davon. Fragt die Person nach der Anzahl, nenne ${found.gesamt} als Gesamtzahl, nicht die Länge der Liste.`
      : null;
  // Bei Anfragen trägt der Listentitel die FRAGE. Auf „was hat die Landesregierung
  // geantwortet" fasste der Schreiber in 2 von 4 Läufen die Fragen zusammen, ohne
  // dass gelesen wurde (live 04.11.2026).
  const mitAntworten = filters.typ?.some((t) => t === 'Antwort' || t === 'Anfrage') ?? false;
  const schreiber = [
    zaehlung,
    mitAntworten
      ? 'Die Listeneinträge nennen nur die Frage. Was geantwortet wurde, steht nur in Texten, die parlament_lesen geliefert hat; ohne solchen Text keine Aussage über den Inhalt einer Antwort.'
      : null,
  ].filter(Boolean);
  return {
    resultCount: results.length,
    sources: sources ?? '',
    gesamt: found.gesamt,
    ...(schreiber.length > 0 ? { fuerSchreiber: schreiber.join(' ') } : {}),
    hinweis: `${
      mitAntworten
        ? 'Die Titel sind die Fragen, nicht die Antworten: wer wissen will, was geantwortet wurde, braucht parlament_lesen. '
        : ''
    }Die Liste enthält nur Metadaten. Für Inhalte \`parlament_lesen\` mit quelle '${meta.id}' aufrufen: bei einer Themen- oder Listenfrage alle einschlägigen Refs (bis zu 6) in einem Aufruf. Nenne in der Antwort die Quelle: ${meta.quellenangabe}.`,
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
}

const queryArg = z
  .string()
  .min(1)
  .max(200)
  .optional()
  .describe('Thema in wenigen Stichwörtern; wird in Titeln gesucht. Mit Filtern entbehrlich.');

export function makeLandtagTool(ctx: Ctx): Tool {
  const parlamente = landtageFor('de-DE');
  const ids = parlamente.map((m) => m.id) as [LandtagParlament, ...LandtagParlament[]];
  const liste = parlamente.map((m) => `'${m.id}' (${m.parlament})`).join(', ');
  return tool({
    description: `Findet Drucksachen eines Landesparlaments: Anträge, Anfragen und Antworten, Gesetzentwürfe, Beschlussempfehlungen. Parlament: ${liste}. Filter: Wahlperiode, Art (typ), Fraktion, Zeitraum, Titel, Schlagwort, Volltext. Liefert eine Liste mit Refs (z. B. "BE 19/3519", Schriftliche Anfragen "BE 19/S27288", NRW "NW 18/21508"), nur Metadaten. In NRW rankt query nach Inhalt (Liste dann nach Nähe sortiert); Kleine Anfragen liegen dort nur mit ihrer Antwort vor, Protokolle nicht in der Liste. Ein Filter, den das Parlament nicht kennt, wird nicht angewendet und im Hinweis genannt. Nur Deutschland.

Nicht für Inhalte, dafür parlament_lesen mit quelle = parlament. Nicht für den Bundestag, dafür bundestag. Nicht für Positionen der Grünen, dafür gruenerator_search.`,
    inputSchema: z.object({
      parlament: z.enum(ids),
      query: queryArg,
      ...landtagFilterSchema.shape,
    }),
    execute: async ({ parlament, query, ...args }) => {
      if (!isIntentAllowedForLocale('bundestag', ctx.state.userLocale)) {
        return { resultCount: 0, sources: '', error: intentDeclineNote('bundestag') ?? '' };
      }
      return runParlamentSuche(ctx, parlament, query, args);
    },
  });
}

/** Der österreichische Nationalrat: nur für `de-AT`, eigener Name statt `landtag` mit Parlament. */
export function makeNationalratTool(ctx: Ctx): Tool {
  return tool({
    description: `Findet Dokumente des österreichischen Nationalrats: Regierungsvorlagen, Ausschussberichte, Anträge der Klubs (selbständige und Entschließungsanträge, Abänderungsanträge) und Sitzungsprotokolle. Filter: Gesetzgebungsperiode (wahlperiode, z. B. 28 = XXVIII., Vorgabe: laufende), Art (typ: Gesetzentwurf = Regierungsvorlage oder Gesetzesantrag, Beschlussempfehlung = Ausschussbericht, Plenarprotokoll = Sitzungsprotokoll), Fraktion (oevp, spoe, fpoe, gruene, neos), Zeitraum, Titel, Schlagwort. Gesucht wird in Betreff, Themen und Schlagworten, nicht im Volltext. Liefert eine Liste mit Refs ("NR 28/I123", "NR 28/A1025", "NR 28/NRSITZ43"), nur Metadaten. Schriftliche Anfragen und Anfragebeantwortungen sind nicht enthalten (Lizenz).

Nicht für Inhalte, dafür parlament_lesen mit quelle 'nationalrat'. Nicht für Positionen der Grünen, dafür gruenerator_search.`,
    inputSchema: z.object({
      query: queryArg,
      ...landtagFilterSchema.omit({ volltext: true }).shape,
    }),
    execute: async ({ query, ...args }) => {
      if (ctx.state.userLocale !== 'de-AT') {
        return {
          resultCount: 0,
          sources: '',
          error: 'Der Nationalrat ist nur für Österreich verfügbar.',
        };
      }
      return runParlamentSuche(ctx, 'nationalrat', query, args);
    },
  });
}
