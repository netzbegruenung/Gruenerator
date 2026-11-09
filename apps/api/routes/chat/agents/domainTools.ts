/**
 * Domain intent tools for the agentic chat loop (Phase 2b).
 *
 * `summary`, `bundestag` and `abgeordnetenwatch` were single-pass intents whose
 * executors (`summarizeNode`, die Abruf-Kerne) already end a turn with a streamed
 * text answer written over gathered data — the "loop-shaped" criteria. Each one
 * becomes a thin tool the ONE streamText loop can call (and compose with the
 * search family): the tool runs the SAME node the single-pass path ran and
 * hands the model a lean value to write the reply over. `bundestag` and
 * `abgeordnetenwatch` behave like the search family (register into the source
 * registry → lean `{ resultCount, sources }`), so their hits show up in the
 * standard citations footer and the model cites them with [N] markers.
 *
 * These mount broadly on loop turns (see `toolCatalog.ts`) so the model can
 * pick them even when the classifier routed to plain `search`; a general
 * per-turn catalog selector is Phase 3n.
 */
import {
  bundestagAuftragSchema,
  bundestagFilterSchema,
  bundestagGruppierenSchema,
  bundestagModusSchema,
  type BundestagFilter,
  bundestagRefSchema,
  landtagRefSchema,
  type LandtagParlament,
  parseSharepicChatProps,
} from '@gruenerator/contracts';
import { intentDeclineNote, isIntentAllowedForLocale } from '@gruenerator/shared/chat-intents';
import { tool, type Tool } from 'ai';
import { z } from 'zod';

import { imageEditNode } from '../../../agents/langgraph/ChatGraph/nodes/imageEditNode.js';
import { imageNode } from '../../../agents/langgraph/ChatGraph/nodes/imageNode.js';
import {
  retrieveAbgeordnetenwatch,
  retrieveBundestag,
  retrieveBundestagFamily,
} from '../../../agents/langgraph/ChatGraph/nodes/searchNode.js';
import { summarizeNode } from '../../../agents/langgraph/ChatGraph/nodes/summarizeNode.js';
import { CHAT_BUDGET } from '../../../services/bundestag/qa/budget.js';
import { einheitLabel, formatCount } from '../../../services/bundestag/qa/count.js';
import { bundestagDocTitle } from '../../../services/bundestag/qa/docTitle.js';
import { type Fehlgrund } from '../../../services/bundestag/qa/fetchTexts.js';
import {
  countBundestagDocs,
  readBundestagRefs,
  suggestBundestagRelaxations,
} from '../../../services/bundestag/qa/index.js';
import {
  detectFromWording,
  dropFraktionBesideAntwort,
  drucksachetypAusTitel,
} from '../../../services/bundestag/qa/planDetect.js';
import {
  describeRedenFilter,
  REDE_TEXT_MAX,
  redeTextCap,
  redeTitle,
  redeUrl,
  redenFilterFromWording,
  redenFraktionSchema,
  redenSortierungSchema,
  phraseIstNurName,
  searchBundestagReden,
  type RedenFilter,
} from '../../../services/bundestag/reden.js';
import { relatedDocsPages, searchDocs } from '../../../services/docs/docsIndex.js';
import { landtagDocTitle } from '../../../services/landtag/docTitle.js';
import {
  LANDTAGE,
  landtageFor,
  parlamentOfRef,
  readLandtagRefs,
} from '../../../services/landtag/index.js';
import { lookupUmfragen } from '../../../services/monitor/UmfragenService.js';
import { draftFailedText } from '../../../services/sharepicCreator/draftFailure.js';
import { createLogger } from '../../../utils/logger.js';
import {
  withResearchedSources,
  type SourceRegistry,
} from '../services/agenticLoop/sourceRegistry.js';
import {
  explainableRefusalText,
  runExplainableGeneration,
} from '../services/artifactGeneration.js';
import { artifactKind, type ArtifactKindId } from '../services/artifactKindRegistry.js';
import {
  buildCreateTurnContext,
  turnMaterialBlock,
  withConversationContext,
} from '../services/createTurn.js';
import {
  pdfKindFromText,
  runBoardGeneration,
  runDocGeneration,
  runPdfGeneration,
  runSharepicGeneration,
} from '../services/intentExecutionService.js';
import { loadLastGeneratedImage } from '../services/lastGeneratedImage.js';
import { lastUserText } from '../services/messageHelpers.js';
import { buildPdfEditBrief, loadLastPdfSpec } from '../services/pdfEditContext.js';
import { berichtFuerKi } from '../services/sharepicBericht.js';
import { threadImageInLibrary } from '../services/sharepicTurnPhotos.js';
import { PROGRESS_MESSAGES, type SSEWriter } from '../services/sseHelpers.js';
import { type TurnImage } from '../services/turnImages.js';

import { werkzeugFehler } from './toolFailure.js';

import type {
  ChatGraphState,
  ImageAttachment,
  SearchResult,
} from '../../../agents/langgraph/ChatGraph/types.js';
import type { Request } from 'express';

const log = createLogger('DomainTools');

/**
 * Der Turn meinte das Bild aus dem Gespräch, aber dieses Werkzeug nimmt keins
 * mit. Ohne den Satz behauptete die Antwort ein eingefügtes Bild (Live-Test
 * 06.11.2026: „schreib ein Dokument und füge das Bild ein").
 */
export function threadImageNotTaken(state: ChatGraphState, where: string): string {
  return state.takesThreadImage
    ? ` Das Bild aus dem Gespräch ist NICHT ${where} – Bilder übernimmt dieses Werkzeug nicht. Sag das ehrlich und behaupte nichts anderes.`
    : '';
}
/**
 * Die Erzeugung lieferte nichts. Der Grund ist meist nicht bekannt (die
 * Generatoren geben `null` zurück) — dann steht das da, statt einer erfundenen
 * Ursache. Wichtig ist der nächste Schritt: ein Fehlschlag nach langer Wartezeit
 * lädt zum Doppeltanlegen ein.
 */
function erstellungFehlgeschlagen(
  was: string,
  grund?: string | null
): ReturnType<typeof werkzeugFehler> {
  return werkzeugFehler({
    art: 'nicht_verfuegbar',
    ursache: `${was}-Erstellung fehlgeschlagen`,
    befund: grund ?? 'Der Grund ist nicht bekannt',
    // Retry nur bei unbekanntem Grund: ein bekannter Grund (z. B. Zeichenlimit) wird
    // durch Wiederholen nicht besser, dort entscheidet die Person.
    naechsterSchritt: grund
      ? 'Gib der Person die genannte Wahl weiter; wiederhole den Aufruf nicht unverändert'
      : 'Versuche es höchstens einmal erneut und lege nichts doppelt an; sag der Person offen, dass der erste Versuch scheiterte',
  });
}

/**
 * `summarize`: map-reduce digest of the turn's attached documents (or, absent
 * any, the conversation) via `summarizeNode` on the `heavy` stage. Emits
 * `summary_start`/`summary_complete` so the progress indicator transitions
 * exactly as on the single-pass path; returns the digest for the loop model to
 * write the answer over. No citations.
 */
export function makeSummaryTool(ctx: { sse: SSEWriter; state: ChatGraphState }): Tool {
  const { sse, state } = ctx;
  return tool({
    description: `Fasst die angehängten Dokumente zusammen – oder, wenn keine vorhanden sind, den bisherigen Gesprächsverlauf.

NUTZE WENN der*die Nutzer*in um eine Zusammenfassung bittet ("fasse zusammen", "worum geht es in dem Dokument"). Rufe das Tool einmal auf und formuliere die Antwort auf Basis des zurückgegebenen Digests.`,
    inputSchema: z.object({}),
    execute: async () => {
      const documentCount =
        (state.documentChatIds?.length ?? 0) +
        (state.documentIds?.length ?? 0) +
        (state.notebookSources?.length ?? 0);
      sse.send('summary_start', { message: PROGRESS_MESSAGES.summaryStart, documentCount });
      const result = await summarizeNode(state);
      const summary = result.summaryContext ?? '';
      const timeMs = result.summaryTimeMs ?? 0;
      sse.send('summary_complete', {
        message: PROGRESS_MESSAGES.summaryComplete(summary.length, timeMs),
        summaryLength: summary.length,
        timeMs,
      });
      if (!summary) {
        return { error: 'Kein Text zum Zusammenfassen gefunden (kein Dokument, kein Verlauf).' };
      }
      return { summary };
    },
  });
}

/** „PlPr 21/80 S. 12" und Landtags-Refs („BE 19/3519") bleiben, „21/1928" wird „BT-Drs. 21/1928". */
type ParlamentQuelle = 'bundestag' | LandtagParlament;

function bundestagRefLabel(ref: string): string {
  return ref.startsWith('PlPr') || /^[A-Z]{2} /.test(ref) ? ref : `BT-Drs. ${ref}`;
}

function filterDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}.${m}.${y}` : iso;
}

/** Fragt die Frage nach der Antwort der Bundesregierung (nicht nach den Fragen)? */
const ANTWORT_FRAGE_RE = /antwort/i;
const ANFRAGE_TYPEN = ['Kleine Anfrage', 'Große Anfrage'];

type AntwortStand =
  | { stand: 'vorhanden'; anfrage: string; antworten: string[] }
  | { stand: 'ausstehend'; anfrage: string; typ: string; datum: string };

/**
 * Wie weit ist die Anfrage `ref`? Aus der Familie ihres Vorgangs: trägt sie eine
 * Antwort-Drucksache, ist die Antwort da; sonst wartet die Anfrage noch (live
 * 29.10.2026: 21/8725, Kleine Anfrage vom 20.10., „Der Aufruf … ist fehlgeschlagen"
 * statt „liegt noch nicht vor"). `null`, wenn `ref` keine Anfrage ist oder die
 * Familie sie nicht enthält — dann wird nichts behauptet.
 */
function antwortStandVon(
  ref: string,
  documents: { ref: string; drucksachetyp: string; datum: string }[] | undefined
): AntwortStand | null {
  const eigene = documents?.find((d) => d.ref === ref);
  if (!eigene || !ANFRAGE_TYPEN.includes(eigene.drucksachetyp)) return null;
  const antworten = (documents ?? [])
    .filter((d) => d.drucksachetyp === 'Antwort')
    .map((d) => d.ref);
  return antworten.length > 0
    ? { stand: 'vorhanden', anfrage: ref, antworten }
    : { stand: 'ausstehend', anfrage: ref, typ: eigene.drucksachetyp, datum: eigene.datum };
}

/** Der Befund in Worten für die Person; die 14 Tage gelten für Kleine Anfragen (GO-BT Anlage 4). */
function antwortAusstehendText(a: Extract<AntwortStand, { stand: 'ausstehend' }>): string {
  const frist = a.typ === 'Kleine Anfrage' ? '; die Frist beträgt in der Regel 14 Tage' : '';
  return `Die Antwort der Bundesregierung auf ${bundestagRefLabel(a.anfrage)} liegt noch nicht vor (${a.typ} vom ${filterDate(a.datum)}${frist}).`;
}

const ANTWORT_AUSSTEHEND_SCHRITT =
  'Der Person sagen, dass die Antwort noch nicht vorliegt. Den Inhalt der Anfrage nicht als Antwort ausgeben und keine Antwort vermuten.';

/**
 * Die angewandten Filter in Worten, eine Zeile je Filter, für die Karte im Chat.
 * Leere Listen und `undefined` fallen weg; `dokumentnummer` und `mitBeratung`
 * sind Steuerung, kein Suchkriterium, das man der Person zeigen müsste.
 */
export function describeBundestagFilter(filters: BundestagFilter | undefined): string[] {
  if (!filters) return [];
  const lines: string[] = [];
  if (filters.wahlperiode?.length) {
    lines.push(`Wahlperiode: ${filters.wahlperiode.join(', ')}`);
  }
  if (filters.drucksachetyp?.length) lines.push(`Typ: ${filters.drucksachetyp.join(', ')}`);
  if (filters.urheber?.length) lines.push(`Urheber: ${filters.urheber.join(', ')}`);
  if (filters.datumVon && filters.datumBis) {
    lines.push(`Zeitraum: ${filterDate(filters.datumVon)} bis ${filterDate(filters.datumBis)}`);
  } else if (filters.datumVon) {
    lines.push(`Zeitraum: ab ${filterDate(filters.datumVon)}`);
  } else if (filters.datumBis) {
    lines.push(`Zeitraum: bis ${filterDate(filters.datumBis)}`);
  }
  if (filters.deskriptor?.length) lines.push(`Schlagwort: ${filters.deskriptor.join(', ')}`);
  if (filters.titel) lines.push(`Titel enthält: ${filters.titel}`);
  return lines;
}

/** Die Filter einer Lockerung als Werkzeug-Argumente: ohne die Steuerfelder, die das Modell nicht setzt. */
function nextBundestagArgs(filters: BundestagFilter): BundestagFilter {
  const { dokumentnummer: _n, mitBeratung: _b, ...args } = filters;
  return args;
}

/** Schnipselkappe der Bundestag-Liste; die Kappe der Zeile selbst steht in `candidateToSearchResult`. */
const BUNDESTAG_SNIPPET_CHARS = 3500;

const BUNDESTAG_HINWEIS =
  "Die Liste enthält nur Metadaten. Für Inhalte `parlament_lesen` mit quelle 'bundestag' aufrufen: bei einer Themen- oder Listenfrage alle einschlägigen Refs (bis zu 6) in einem Aufruf, nicht nur das erste Dokument.";

/** Obergrenze der `bundestag`-Aufrufe je Zug; danach fragt das Werkzeug DIP nicht mehr. */
const BUNDESTAG_MAX_CALLS_PER_TURN = 4;
const BUNDESTAG_CAP_HINWEIS = `Schon ${BUNDESTAG_MAX_CALLS_PER_TURN} Bundestag-Suchen in diesem Zug — antworte jetzt mit den vorliegenden Treffern und nenne, was offen bleibt.`;
const LANDTAG_RE = /landtag|abgeordnetenhaus|bürgerschaft|buergerschaft|landesparlament/i;
// Parlamente mit eigenem Eintrag in `landtag` (Registry): dorthin schickt ein Hinweis
// an den Planer, denn nur er ruft Werkzeuge. Jeder andere Landtag geht als
// `fuerSchreiber` mit, nicht als `hinweis`: `hinweis` liest nur der Planer, der
// werkzeuglose Schreiber des split-Modus nie (live 28.10.2026: 2 von 3 Antworten
// gaben Websuche-Treffer als Landtag-Inhalt aus).
const LANDTAG_HINWEIS =
  'Die Frage nennt ein Landesparlament: Sag ZUERST, dass dieses Werkzeug nur den Bundestag abdeckt und Dokumente von Landtagen hier nicht durchsucht werden; danach, was der Bundestag dazu hergibt.';

/** Der Geltungsbereich, wenn die Frage einen Landtag nennt: bekannte an den Planer, sonst an den Schreiber. */
function landtagNote(
  userText: string
): { fuerSchreiber: string } | { landtagHinweis: string } | Record<string, never> {
  if (!LANDTAG_RE.test(userText)) return {};
  const bekannt = landtageFor('de-DE').find((m) => m.genannt.test(userText));
  return bekannt
    ? {
        landtagHinweis: `Die Frage nennt den ${bekannt.parlament}: Dessen Dokumente findet \`landtag\` mit parlament '${bekannt.id}', nicht dieses Werkzeug.`,
      }
    : { fuerSchreiber: LANDTAG_HINWEIS };
}

/**
 * `bundestag`: official DIP documentation (Drucksachen, Plenarprotokolle,
 * speeches, people, Vorgänge) via `retrieveBundestag`. Behaves like
 * the search family: registers the flat results into the source registry and
 * returns the lean `{ resultCount, sources }` — the numbered snippet block is
 * the model's grounding, the citations footer shows the documents. Die Liste
 * (Refs, nur Metadaten) kommt aus der Planstufe des Bundestag-Q&A; Personen
 * behalten Reden und Aktivitäten dahinter, die Schnipselkappe steht auf 3000. DE-only — der Kern liefert für de-AT eine
 * begründete Absage statt leerer Daten.
 *
 * Ruft `retrieveBundestag` und nicht mehr `searchNode`: die Vorrede des Knotens
 * ist für einen Zustand aus dem Klassifikator gebaut und kehrt bei zwei
 * Dokumentquellen VOR dem `switch` zurück — der Abruf wurde dort gekapert.
 * Begründung am Kern.
 */
export function makeBundestagTool(ctx: {
  state: ChatGraphState;
  sourceRegistry: SourceRegistry;
}): Tool {
  const { state, sourceRegistry } = ctx;
  // Das Werkzeug entsteht je Zug neu (`assembleToolCatalog` läuft einmal je Antwort),
  // der Zähler lebt also genau einen Zug lang.
  let callsThisTurn = 0;
  return tool({
    description: `Findet Bundestags-Dokumente (DIP): Drucksachen und Plenardebatten, mit Filtern. Liefert Refs (nur Metadaten) und je Vorgang den Beratungsverlauf (Beschlüsse mit Plenarprotokoll und Seite, Bundesrat, Verkündung).

Nicht für Inhalte, dafür parlament_lesen. Nicht für Reden im Plenum, dafür bundestag_reden. Nicht für Abstimmungsverhalten oder Nebentätigkeiten, dafür abgeordnetenwatch.`,
    inputSchema: z.object({
      query: z
        .string()
        .min(1)
        .optional()
        .describe('Person, Thema oder Drucksachennummer; entbehrlich mit `ref` oder Filtern'),
      modus: bundestagModusSchema
        .optional()
        .describe(
          "'zaehlen' bei „wie viele“, „wie oft“, „Anzahl“: exakte DIP-Zahl statt Liste; Thema dann über `deskriptor` (vollständig) oder `titel`; ein bloßes `query` zählt als Titel-Filter (ganze Wörter, Untergrenze). Sonst weglassen."
        ),
      gruppieren: bundestagGruppierenSchema
        .optional()
        .describe(
          "Nur mit 'zaehlen': nach 'fraktion' („welche Fraktion“), 'monat' („pro Monat“) oder 'typ' (Drucksachenart)"
        ),
      ref: bundestagRefSchema
        .optional()
        .describe(
          "Drucksachennummer, z. B. '21/3546': alle Dokumente des Vorgangs samt Beratungsverlauf. Für „wie ging es weiter“, „gibt es eine Antwort“."
        ),
      // `mitBeratung` steuert nur den Kern (Beratungsabschnitte im Volltext), kein Modellargument.
      ...bundestagFilterSchema.omit({ dokumentnummer: true, mitBeratung: true }).shape,
      deskriptor: bundestagFilterSchema.shape.deskriptor.describe(
        'Thema als Thesaurus-Schlagwort im Singular (Radverkehr, Wärmepumpe). Mehrere müssen ALLE zugleich passen, meist genügt einer.'
      ),
      titel: bundestagFilterSchema.shape.titel.describe(
        'Trifft nur ganze Wörter im Titel, keine Zusammensetzungen („Radverkehr" findet nicht „Radverkehrsförderung"). Für ein Thema `deskriptor` nehmen; neben einem Deskriptor wird der Titel weggelassen.'
      ),
    }),
    execute: async ({ query, modus, gruppieren, ref, ...args }) => {
      // `bundestag` ist von der Near-Duplicate-Sperre ausgenommen (Verfeinerungen müssen
      // durch), das Modell hat aber schon sechsmal nahezu dasselbe gefragt (65 s).
      callsThisTurn++;
      if (callsThisTurn > BUNDESTAG_MAX_CALLS_PER_TURN) {
        return { resultCount: 0, sources: '', hinweis: BUNDESTAG_CAP_HINWEIS };
      }
      if (ref && ref.startsWith('PlPr')) {
        return {
          resultCount: 0,
          sources: '',
          error: 'Die Dokumentfamilie gibt es nur für Drucksachen (z. B. 21/3546).',
          naechsterSchritt: 'Für ein Plenarprotokoll `parlament_lesen` mit dieser Ref nutzen.',
        };
      }
      // Das Modell kürzt die Frage oft aufs Thema („Artenschutz") und verliert
      // dabei „beschlossen", „Grüne" oder „seit Januar". Was der Wortlaut der
      // Nachricht hergibt, gilt deshalb mit — gesetzte Argumente gehen vor.
      const userText = (
        state.lastUserTextNoMentions ??
        (state.messages ? lastUserText(state.messages) : null) ??
        ''
      ).trim();
      // Leere Listen (`deskriptor: []`) sind „nichts gesetzt" und überstimmen den Wortlaut nicht.
      const fromArgs = Object.fromEntries(
        Object.entries(args).filter(
          ([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0)
        )
      ) as typeof args;
      // „Kleine Anfrage" als Titel ist die Drucksachenart, keine Titelsuche (live: 1 statt 524).
      const titelTyp = fromArgs.titel ? drucksachetypAusTitel(fromArgs.titel) : null;
      if (titelTyp) {
        delete fromArgs.titel;
        fromArgs.drucksachetyp = [...new Set([...(fromArgs.drucksachetyp ?? []), titelTyp])];
      }
      // Ein Aufruf nur mit Filtern ist ein vollständiger Auftrag (das Rezept
      // verlangt ihn so); ohne Filter und Suchbegriff ist die Frage selbst das Thema.
      const hasFilters = Object.values(fromArgs).some((v) => !(Array.isArray(v) && v.length === 0));
      if (!ref && !query && !hasFilters && !userText && modus !== 'zaehlen') {
        return {
          resultCount: 0,
          sources: '',
          error:
            'Es fehlt ein Suchbegriff (query), eine Drucksachennummer (ref) oder ein Filter, und die Nachricht nennt kein Thema.',
        };
      }
      const question = query ?? userText;
      // Nur im ersten Aufruf des Zuges: ein Filter aus dem Wortlaut ließe sich sonst nie
      // abwählen (leere Listen zählen als „nichts gesetzt"), und der Wiederholungsversuch
      // schlüge garantiert genauso fehl (#5558). Danach entscheidet das Modell allein.
      const filters: typeof fromArgs = {
        ...(callsThisTurn === 1 ? detectFromWording(userText) : {}),
        ...fromArgs,
      };
      const filterHinweise: string[] = [];
      const fraktionNote = dropFraktionBesideAntwort(filters);
      if (fraktionNote) filterHinweise.push(fraktionNote);
      if (ref) {
        // Die Nummer legt den Vorgang fest; Filter aus dem Wortlaut (Typ, Urheber)
        // würden Familienmitglieder verdecken und gelten hier nicht.
        const family = await retrieveBundestagFamily(ref, state.userLocale);
        if (family.results.length === 0) {
          return { resultCount: 0, sources: '', error: `Zu ${ref} wurde bei DIP nichts gefunden.` };
        }
        const sources = sourceRegistry.register(family.results, { snippetChars: 3000 });
        const antwort = antwortStandVon(ref, family.documents);
        const hinweise = [
          ...family.notes,
          ...(antwort?.stand === 'ausstehend' ? [antwortAusstehendText(antwort)] : []),
        ];
        return {
          resultCount: family.results.length,
          sources: sources ?? '',
          hinweis: BUNDESTAG_HINWEIS,
          ...landtagNote(userText),
          ...(hinweise.length > 0 ? { hinweise } : {}),
          uiCard: {
            query: query ?? `Familie von ${bundestagRefLabel(ref)}`,
            ref: bundestagRefLabel(ref),
            filter: [],
            dokumente: (family.documents ?? []).map((d) => ({
              ref: bundestagRefLabel(d.ref),
              typ: d.drucksachetyp,
              datum: d.datum,
              titel: d.titel,
              url: d.pdfUrl,
            })),
            ...(family.verfahren ? { verfahren: family.verfahren.slice(0, 3) } : {}),
          },
        };
      }
      if (modus === 'zaehlen') {
        if (!isIntentAllowedForLocale('bundestag', state.userLocale)) {
          return { resultCount: 0, sources: '', error: intentDeclineNote('bundestag') ?? '' };
        }
        // `query` zählt nicht mit; ohne Titel/Deskriptor würde sonst ungefiltert gezählt
        // (live 531 statt 2, #5557). Das Thema wird deshalb zum Titel-Filter.
        if (query && !filters.titel && !filters.deskriptor?.length) {
          filters.titel = query;
          filterHinweise.push(
            `Das Thema „${query}“ wurde als Titel-Filter gezählt: er trifft nur ganze Wörter im Titel (keine Zusammensetzungen), die Zahl ist eine Untergrenze. Vollständiger zählt ein \`deskriptor\` (Thesaurus-Schlagwort im Singular).`
          );
        }
        const zaehlung = await countBundestagDocs({
          filters,
          ...(gruppieren ? { gruppieren } : {}),
        }).catch((err: unknown) => {
          log.warn(`[bundestag] Zählung fehlgeschlagen: ${String(err)}`);
          return null;
        });
        if (!zaehlung) {
          return {
            resultCount: 0,
            sources: '',
            error: 'Die Zählung beim Bundestag (DIP) ist gerade nicht erreichbar.',
          };
        }
        const sources = sourceRegistry.register(
          [
            {
              source: 'bundestag',
              title: `DIP-Zählung: ${einheitLabel(zaehlung)}`,
              content: formatCount(zaehlung),
              url: 'https://dip.bundestag.de',
              relevance: 1,
            },
          ],
          { snippetChars: 3000 }
        );
        return {
          resultCount: 1,
          sources: sources ?? '',
          modus: 'zaehlen',
          ...landtagNote(userText),
          einheit: zaehlung.einheit,
          bezeichnung: einheitLabel(zaehlung),
          gesamt: zaehlung.gesamt,
          ...(zaehlung.gruppen ? { gruppen: zaehlung.gruppen } : {}),
          ...(zaehlung.notes.length + filterHinweise.length > 0
            ? { hinweise: [...filterHinweise, ...zaehlung.notes] }
            : {}),
          uiCard: {
            query: query ?? '',
            modus: 'zaehlen',
            filter: describeBundestagFilter(zaehlung.filters),
            zaehlung: {
              einheit: zaehlung.einheit,
              gesamt: zaehlung.gesamt,
              gruppiertNach: zaehlung.gruppiertNach,
              gruppen: zaehlung.gruppen ?? [],
              hinweise: zaehlung.notes,
            },
            dokumente: [],
          },
        };
      }
      const {
        results,
        totals,
        documents,
        filters: applied,
        verfahren,
        ausfall,
        leerDurchFilter,
      } = await retrieveBundestag(question, state.userLocale, filters);
      // Ausfall und filterbedingt leer sind keine Nulltreffer: das Modell würde
      // „gibt es nicht" melden, wo der Dienst fehlte oder ein Filter zu eng war.
      if (ausfall) {
        return {
          resultCount: 0,
          sources: '',
          error: 'Die Bundestags-Suche (DIP) ist gerade nicht erreichbar.',
          naechsterSchritt:
            'Das ist kein „keine Treffer". Später erneut versuchen; für Reden `bundestag_reden` probieren.',
        };
      }
      if (leerDurchFilter) {
        const used = applied ?? filters;
        const zeilen = describeBundestagFilter(used);
        // Nicht „lockere irgendeinen Filter": je Variante gezählt, welche Lockerung trifft (#5445).
        const lockerungen = await suggestBundestagRelaxations({ filters: used }).catch(
          (err: unknown) => {
            log.warn(`[bundestag] Lockerungen nicht gezählt: ${String(err)}`);
            return [];
          }
        );
        const best = lockerungen
          .filter((l) => l.treffer > 0)
          .sort((a, b) => b.treffer - a.treffer)[0];
        return {
          resultCount: 0,
          sources: '',
          error: `Keine Treffer mit diesen Filtern: ${zeilen.join('; ') || 'siehe Aufruf'}.`,
          ...(filterHinweise.length > 0 ? { hinweise: filterHinweise } : {}),
          ...(lockerungen.length > 0
            ? { lockerungen: lockerungen.map((l) => `${l.aenderung}: ${l.treffer} ${l.einheit}`) }
            : {}),
          naechsterSchritt: best
            ? `Erneut \`bundestag\` aufrufen, mit derselben query und genau diesen Filtern (${best.aenderung}, ${best.treffer} ${best.einheit}): ${JSON.stringify(nextBundestagArgs(best.filters))}. Passt die Lockerung nicht mehr zur Frage (etwa ohne die gefragte Fraktion), stattdessen sagen, dass es mit diesen Filtern nichts gibt, und die Zahl als Hinweis nennen.`
            : lockerungen.length > 0
              ? 'Auch mit gelockerten Filtern keine Treffer: das Thema anders fassen (anderer Deskriptor, Oberbegriff) oder `bundestag_reden` probieren; ohne Treffer zählt das nicht als „es gibt nichts".'
              : 'Einen Filter lockern (Zeitraum erweitern, Typ oder Urheber weglassen) und erneut suchen; ohne Treffer zählt das nicht als „es gibt nichts".',
        };
      }
      if (results.length === 0) {
        return { resultCount: 0, sources: '', error: 'Keine passenden Bundestags-Daten gefunden.' };
      }
      // Listenzeilen tragen Titel, Ref, Vorgang, Verlauf und Abstract (gedeckelt, zuletzt):
      // 3500 Zeichen halten sie ganz, auch bei langem Verlauf (gemessen 5203 vor dem Umbau).
      const sources = sourceRegistry.register(results, { snippetChars: BUNDESTAG_SNIPPET_CHARS });
      return {
        resultCount: results.length,
        sources: sources ?? '',
        ...(totals ? { gesamt: totals } : {}),
        hinweis: BUNDESTAG_HINWEIS,
        ...landtagNote(userText),
        ...(filterHinweise.length > 0 ? { hinweise: filterHinweise } : {}),
        // Nur für die Karte; wrapTools nimmt das Feld vor dem Modell heraus.
        uiCard: {
          query: question,
          filter: describeBundestagFilter(applied ?? filters),
          ...(totals ? { gesamt: totals } : {}),
          dokumente: (documents ?? []).map((d) => ({
            ref: bundestagRefLabel(d.ref),
            typ: d.drucksachetyp,
            datum: d.datum,
            titel: d.titel,
            url: d.pdfUrl,
          })),
          ...(verfahren ? { verfahren: verfahren.slice(0, 3) } : {}),
        },
      };
    },
  });
}

/**
 * `bundestag_reden`: was eine Person oder Fraktion im Plenum zu einem Thema
 * gesagt hat — die Redensuche des Bundestag-MCP (`searchBundestagReden`). Je
 * Rede ein Treffer mit dem Redetext (bis 4000 Zeichen), damit das Modell
 * wörtlich zitieren kann; die Quelle ist das PDF des Plenarprotokolls. Gleiche
 * Locale-Sperre wie `bundestag`: nur Deutschland.
 */
export function makeBundestagRedenTool(ctx: {
  state: ChatGraphState;
  sourceRegistry: SourceRegistry;
}): Tool {
  const { state, sourceRegistry } = ctx;
  return tool({
    description: `Findet Reden im Bundestag zu einem Thema (Plenarprotokolle, semantische Suche): wer wann was gesagt hat, mit vollem Redetext zum Zitieren, auch für „gib die Rede wörtlich wieder“. Filter: Redner*in, Fraktion, Wahlperiode, Zeitraum, Sortierung. Nur Deutschland.

Nicht für Drucksachen, Gesetzentwürfe oder Beschlüsse, dafür bundestag. Nicht für den Inhalt von Drucksachen, dafür parlament_lesen. Nicht für Abstimmungsverhalten, dafür abgeordnetenwatch.`,
    inputSchema: z.object({
      thema: z.string().min(2).max(300).describe('Worüber gesprochen wurde, z. B. „Wärmeplanung"'),
      redner: z
        .string()
        .min(2)
        .max(100)
        .optional()
        .describe('Name der Person, z. B. „Katrin Uhlig"'),
      fraktion: redenFraktionSchema.optional(),
      wahlperiode: z.number().int().min(1).max(30).optional(),
      datumVon: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      datumBis: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      sortierung: redenSortierungSchema
        .optional()
        .describe("'neueste' für „zuletzt“, 'aelteste' für „erstmals“, sonst Relevanz"),
      limit: z.number().int().min(1).max(10).optional(),
      wortlaut: z
        .boolean()
        .optional()
        .describe(
          'true, wenn eine wörtliche Formulierung gesucht wird („wer hat ‚Zeitenwende‘ gesagt“, „ab wann sagt X ‚…‘“): `thema` ist dann die Phrase. Nicht für „gib die Rede wörtlich/vollständig wieder“: dafür weglassen und redner, datumVon/datumBis der Rede und limit 1 setzen. Sonst weglassen.'
        ),
    }),
    execute: async ({ thema, limit, wortlaut: wortlautArg, ...args }) => {
      if (!isIntentAllowedForLocale('bundestag', state.userLocale)) {
        return { resultCount: 0, sources: '', error: intentDeclineNote('bundestag') ?? '' };
      }
      // „Die Rede wörtlich" ist keine Phrasensuche: mit dem Namen als Phrase
      // fände die Wortlautsuche nie etwas, gemeint ist die Rede selbst.
      const wortlaut = wortlautArg && !phraseIstNurName(thema, args.redner);
      // Wie bei `bundestag`: Zeitraum, Sortierung und (ohne Redner) Fraktion aus
      // dem Wortlaut gelten mit, gesetzte Argumente gehen vor.
      const userText =
        state.lastUserTextNoMentions ??
        (state.messages ? lastUserText(state.messages) : null) ??
        '';
      const fromArgs = Object.fromEntries(
        Object.entries(args).filter(([, v]) => v !== undefined)
      ) as RedenFilter;
      const filter: RedenFilter = {
        ...redenFilterFromWording(userText, Boolean(args.redner)),
        ...fromArgs,
      };
      const ergebnis = await searchBundestagReden({
        thema,
        ...filter,
        ...(limit ? { limit } : {}),
        ...(wortlaut ? { wortlaut } : {}),
      }).catch((err: unknown) => {
        log.warn(`[bundestag_reden] Redensuche fehlgeschlagen: ${String(err)}`);
        return null;
      });
      if (!ergebnis) {
        return {
          resultCount: 0,
          sources: '',
          error: 'Die Redensuche des Bundestags ist gerade nicht erreichbar.',
          naechsterSchritt:
            'Das ist kein „keine Reden". Das der Person so sagen und später erneut versuchen; den Redetext nicht anderswo zusammensuchen.',
        };
      }
      const { speeches, wpFallback } = ergebnis;
      if (speeches.length === 0) {
        return {
          resultCount: 0,
          sources: '',
          ...(wortlaut
            ? {
                error: `Keine Rede mit der wörtlichen Formulierung „${thema}“ unter den besten Treffern gefunden. Die Wortlautsuche prüft nur die inhaltlich nächsten Reden, sie ist nicht erschöpfend.`,
                naechsterSchritt:
                  'Ist der Wortlaut einer bestimmten Rede gemeint, nicht eine Phrase darin: bundestag_reden ohne wortlaut, mit redner, datumVon/datumBis dieser Rede und limit 1. Sonst der Person sagen, dass die Formulierung nicht gefunden wurde.',
              }
            : {
                error: 'Keine passenden Reden gefunden.',
                naechsterSchritt:
                  'Einen Filter lockern (Zeitraum oder Wahlperiode weglassen, Name ohne Titel) und einmal erneut suchen; ohne Treffer zählt das nicht als „hat nie dazu gesprochen".',
              }),
        };
      }
      const results: SearchResult[] = speeches.map((s, i) => {
        const url = redeUrl(s);
        // Gekappt wird am Client (`redeTextCap`), mit „…" am Schnitt; die
        // Gesamtlänge kennt er nicht, also nur „gekürzt" — und wie es ganz geht.
        const gekappt = s.excerpt.endsWith('…')
          ? `\n[Redetext gekürzt: nur der Anfang steht hier, nicht als vollständige Rede ausgeben.${
              speeches.length > 1
                ? ` Ganz (bis ${REDE_TEXT_MAX} Zeichen): bundestag_reden mit limit 1, redner und Datum dieser Rede.`
                : ''
            }]`
          : '';
        return {
          source: 'bundestag',
          title: redeTitle(s),
          content: `${s.excerpt}${gekappt}`,
          ...(url ? { url } : {}),
          relevance: 1 - 0.02 * i,
        };
      });
      // Der Redetext ist der Beleg; gekappt wird schon am Client (`redeTextCap`),
      // die Registry darf ihn nicht ein zweites Mal kürzen.
      const sources = sourceRegistry.register(results, {
        snippetChars: redeTextCap(speeches.length) + 400,
      });
      return {
        resultCount: results.length,
        sources: sources ?? '',
        ...(wpFallback
          ? {
              hinweis:
                'Keine Treffer in der aktuellen Wahlperiode, daher über alle Wahlperioden gesucht.',
            }
          : {}),
        ...(wortlaut
          ? {
              wortlaut:
                'Nur Reden mit dieser wörtlichen Formulierung; geprüft wurden die inhaltlich nächsten Treffer, die Liste ist nicht erschöpfend.',
            }
          : {}),
        // Nur für die Karte; wrapTools nimmt das Feld vor dem Modell heraus.
        uiCard: {
          thema,
          ...(wortlaut ? { wortlaut: true } : {}),
          filter: describeRedenFilter(filter),
          reden: speeches.map((s) => ({
            redner: s.speaker,
            partei: s.party,
            datum: s.date,
            protokoll: s.protokollNummer,
            top: s.topTitle,
            url: redeUrl(s),
          })),
        },
      };
    },
  });
}

/** Gründe, aus denen ein Dokument keine Punkte lieferte, in Worten für das Modell. */
const NICHT_GELESEN_GRUND = {
  budget: 'Lesebudget erschöpft',
  deadline: 'Zeitlimit erreicht',
  missing: 'kein Volltext verfügbar',
} as const;

/**
 * Was das Modell nach einem Fehlschlag anders machen soll, je Grund genau ein
 * Satz. „kein Volltext" allein lässt es raten: am 29.10.2026 bildete es
 * „PlPr 21/96 S. 1-200" selbst und schloss aus dem leeren Schnitt, der Text
 * fehle — gefragt war der Wortlaut einer Rede, den `bundestag_reden` liefert.
 */
function lesenRatschlag(
  documents: { points: unknown[]; skipped: string | null; fehlgrund: Fehlgrund | null }[],
  nichtGefunden: boolean,
  suchwerkzeug: 'bundestag' | 'landtag'
): string {
  const leer = documents.filter((d) => d.points.length === 0);
  const arten = new Set(leer.map((d) => d.fehlgrund?.art));
  const saetze: string[] = [];
  if (nichtGefunden || arten.has('seitenbereich')) {
    saetze.push(
      `Refs nie selbst bilden oder Seiten schätzen: nur aus einer Zeile „Ref: …“ von \`${suchwerkzeug}\` übernehmen.${
        suchwerkzeug === 'bundestag'
          ? ' Für den Wortlaut einer einzelnen Rede `bundestag_reden` mit redner (und datumVon/datumBis) aufrufen, das liefert den vollen Redetext.'
          : ''
      }`
    );
  }
  if (arten.has('unveroeffentlicht')) {
    saetze.push(
      'Das der Person so sagen; einzelne Reden findet `bundestag_reden` unabhängig vom Protokoll-XML.'
    );
  }
  if (leer.some((d) => d.skipped === 'missing' && !d.fehlgrund)) {
    saetze.push(
      'Bei einer frisch veröffentlichten Drucksache liegt der Text oft noch nicht vor (DIP ohne Text, PDF noch nicht abrufbar); das der Person so sagen, nicht raten.'
    );
  }
  return saetze.join(' ');
}

/**
 * `parlament_lesen`: liest die Dokumente, die `bundestag` als Refs geliefert hat,
 * vollständig und je Dokument isoliert (`readBundestagRefs`, `CHAT_BUDGET`) und
 * gibt belegte Aussagen mit wörtlichem Zitat zurück. Je Dokument mit Punkten ein
 * Treffer in der Quellenliste; Dokumente ohne Punkte stehen mit Grund in
 * `nichtGelesen`. Gleiche Locale-Sperre wie `bundestag`: nur Deutschland.
 */
export function makeParlamentLesenTool(ctx: {
  state: ChatGraphState;
  sourceRegistry: SourceRegistry;
}): Tool {
  const { state, sourceRegistry } = ctx;
  // Je Locale nur die eigenen Parlamente: Österreich liest den Nationalrat, Deutschland Bundestag und Landtage.
  const at = state.userLocale === 'de-AT';
  const quellen = [
    ...(at ? [] : (['bundestag'] as const)),
    ...landtageFor(state.userLocale).map((m) => m.id),
  ] as [ParlamentQuelle, ...ParlamentQuelle[]];
  return tool({
    description: at
      ? `Liest Dokumente des österreichischen Nationalrats vollständig und isoliert und liefert belegte Aussagen mit wörtlichem Zitat. quelle 'nationalrat' mit Refs aus \`nationalrat\` ("NR 28/I123" Regierungsvorlage oder Ausschussbericht, "NR 28/A1025" Antrag, "NR 28/NRSITZ43" Sitzungsprotokoll; bei einem Protokoll \`fokus\` auf Thema oder Redner*in setzen). Bis zu 6 Dokumente je Aufruf. Für „fasse zusammen“ gilt auftrag 'zusammenfassung'.`
      : `Liest Parlamentsdokumente (Bundestag, Landesparlamente) vollständig und isoliert und liefert belegte Aussagen mit wörtlichem Zitat. quelle 'bundestag' mit Refs aus \`bundestag\`, quelle = Landesparlament (z. B. 'berlin') mit Refs aus \`landtag\` ("BE 19/3519", Schriftliche Anfrage "BE 19/S27288"; die Anfrage liegt samt Antwort vor; NRW "NW 18/21508"). Bis zu 6 Dokumente je Aufruf. Für „fasse zusammen“ gilt auftrag 'zusammenfassung'. Nur Deutschland.

Refs nie selbst bilden oder Seiten schätzen: nur aus einer Zeile „Ref: …“ übernehmen. Nicht für den Wortlaut einer einzelnen Rede, dafür bundestag_reden (liefert den vollen Redetext). Nicht für Abstimmungsverhalten, dafür abgeordnetenwatch. Nicht für Positionen der Grünen, dafür gruenerator_search mit collection 'bundestagsfraktion'.`,
    inputSchema: z.object({
      quelle: z.enum(quellen),
      dokumente: z
        .array(z.union([bundestagRefSchema, landtagRefSchema]))
        .min(1)
        .max(6)
        .describe(
          at
            ? 'Refs aus der Liste von `nationalrat` (Zeile „Ref: …“)'
            : 'Refs aus der Liste von `bundestag` bzw. `landtag` (Zeile „Ref: …“), alle aus der angegebenen quelle'
        ),
      frage: z
        .string()
        .min(3)
        .max(1000)
        .describe('Die Frage, die die Dokumente beantworten sollen'),
      auftrag: bundestagAuftragSchema.default('frage'),
      fokus: z
        .string()
        .min(2)
        .max(100)
        .optional()
        .describe(
          'Abschnitt, auf den sich das Lesen richten soll, wenn die Frage eine Stelle nennt: „Artikel 3“, „§ 14“, „Begründung“, „Erfüllungsaufwand“. Sonst weglassen.'
        ),
    }),
    execute: async ({ quelle, dokumente, frage, auftrag = 'frage', fokus }, options) => {
      // Das Schema kennt nur die Quellen der Locale; ein wiederholter Aufruf aus einem alten Thread nicht.
      if (!quellen.includes(quelle)) {
        return {
          resultCount: 0,
          sources: '',
          error: `Die quelle '${quelle}' steht in dieser Region nicht zur Verfügung.`,
        };
      }
      // Die Ref-Form gehört zur Quelle: ein Landtags-Ref beim Bundestag fände nichts und umgekehrt.
      const parlament: LandtagParlament | null = quelle === 'bundestag' ? null : quelle;
      const landtag = parlament ? LANDTAGE[parlament] : null;
      const fremd = dokumente.filter((r) =>
        parlament ? parlamentOfRef(r) !== parlament : !bundestagRefSchema.safeParse(r).success
      );
      if (fremd.length > 0) {
        return {
          resultCount: 0,
          sources: '',
          error: `Die Refs ${fremd.join(', ')} gehören nicht zur quelle '${quelle}'. ${
            landtag
              ? `Refs für ${landtag.kurz} beginnen mit "${landtag.refPrefix} ".`
              : 'Bundestags-Refs sehen aus wie "21/1928".'
          }`,
        };
      }
      // Gefragt ist die Antwort der Bundesregierung, gegeben ist die Ref der Anfrage:
      // die Antwort ist eine eigene Drucksache, die Anfrage selbst beantwortet nichts.
      // Liegt die Antwort vor, wird sie gelesen (statt der Anfrage); liegt sie noch
      // nicht vor, ist das ein Befund und kein Fehlschlag.
      const antworten =
        !parlament && ANTWORT_FRAGE_RE.test(frage)
          ? await Promise.all(
              dokumente.slice(0, 2).map(async (ref): Promise<AntwortStand | null> => {
                if (ref.startsWith('PlPr')) return null;
                let family: Awaited<ReturnType<typeof retrieveBundestagFamily>> | null = null;
                try {
                  family = await retrieveBundestagFamily(ref, state.userLocale);
                } catch (err) {
                  log.warn(`[parlament_lesen] Familie von ${ref} nicht ladbar: ${String(err)}`);
                }
                return antwortStandVon(ref, family?.documents);
              })
            )
          : [];
      const ausstehend = antworten.flatMap((a) => (a?.stand === 'ausstehend' ? [a] : []));
      const vorhanden = new Map(
        antworten.flatMap((a) =>
          a?.stand === 'vorhanden' ? [[a.anfrage, a.antworten] as const] : []
        )
      );
      const zuLesen = [
        ...new Set(
          dokumente
            .filter((ref) => !ausstehend.some((a) => a.anfrage === ref))
            .flatMap((ref) => vorhanden.get(ref) ?? [ref])
        ),
      ].slice(0, CHAT_BUDGET.maxDocuments);
      const antwortHinweise = [
        ...ausstehend.map(antwortAusstehendText),
        ...[...vorhanden].map(
          ([anfrage, refs]) =>
            `Die Antwort auf ${bundestagRefLabel(anfrage)} ist ${refs.map(bundestagRefLabel).join(', ')}; gelesen wurde sie statt der Anfrage.`
        ),
      ];
      if (zuLesen.length === 0) {
        return {
          resultCount: 0,
          sources: '',
          nichtGelesen: ausstehend.map((a) => ({
            ref: a.anfrage,
            grund: antwortAusstehendText(a),
          })),
          hinweise: antwortHinweise,
          naechsterSchritt: ANTWORT_AUSSTEHEND_SCHRITT,
          uiCard: {
            frage,
            ...(fokus ? { fokus } : {}),
            gelesen: [],
            nichtGelesen: ausstehend.map((a) => ({
              ref: bundestagRefLabel(a.anfrage),
              titel: '',
              grund: 'Antwort liegt noch nicht vor',
            })),
          },
        };
      }
      const gelesen = parlament
        ? await readLandtagRefs({
            parlament,
            question: frage,
            refs: zuLesen,
            auftrag,
            budget: CHAT_BUDGET,
            ...(fokus ? { fokus } : {}),
            // Der Loop schreibt den Aufruf nach seiner Frist ab; dieses Signal stoppt dann das Weiterlesen.
            ...(options?.abortSignal ? { abortSignal: options.abortSignal } : {}),
          })
        : await readBundestagRefs({
            question: frage,
            refs: zuLesen,
            auftrag,
            budget: CHAT_BUDGET,
            ...(fokus ? { fokus } : {}),
            // Der Loop schreibt den Aufruf nach seiner Frist ab; dieses Signal stoppt dann das Weiterlesen.
            ...(options?.abortSignal ? { abortSignal: options.abortSignal } : {}),
          });
      const { documents, nichtGefunden } = gelesen;
      const notes = [...gelesen.notes, ...antwortHinweise];
      const results: SearchResult[] = documents
        .filter((d) => d.points.length > 0)
        .map((d, i) => ({
          source: landtag ? 'landtag' : 'bundestag',
          title: landtag ? landtagDocTitle(landtag, d) : bundestagDocTitle(d),
          content: d.points.map((p) => `• ${p.aussage} — „${p.zitat}“`).join('\n'),
          ...(d.pdfUrl ? { url: d.pdfUrl } : {}),
          relevance: 1 - 0.02 * i,
        }));
      const grundFor = (d: (typeof documents)[number]): string =>
        d.fehlgrund?.text ??
        (d.skipped ? NICHT_GELESEN_GRUND[d.skipped] : 'keine belegte Aussage zur Frage');
      const nichtGelesen = [
        ...ausstehend.map((a) => ({ ref: a.anfrage, grund: antwortAusstehendText(a) })),
        ...nichtGefunden.map((ref) => ({
          ref,
          grund: landtag ? `im ${landtag.kurz} nicht gefunden` : 'bei DIP nicht gefunden',
        })),
        ...documents
          .filter((d) => d.points.length === 0)
          .map((d) => ({ ref: d.ref, grund: grundFor(d) })),
      ];
      const fokusNotes = fokus
        ? documents
            .filter((d) => d.fokusGefunden === false)
            .map(
              (d) =>
                `„${fokus}“ wurde in ${bundestagRefLabel(d.ref)} nicht gefunden; gelesen wurde ohne Schwerpunkt.`
            )
        : [];
      const sources =
        results.length > 0 ? sourceRegistry.register(results, { snippetChars: 3000 }) : null;
      // Nichts gelesen ist ein Fehlschlag, kein leeres Ergebnis: ohne `error`
      // stand „0 Ergebnisse" mit ok=true da (21/8813, 28.10.2026 — die PDF der
      // frisch veröffentlichten Antwort war noch nicht abrufbar), und der
      // Schreiber musste den Grund erraten.
      const nichtsGelesen =
        results.length === 0 && nichtGelesen.length > 0
          ? {
              error: `Nichts gelesen — ${nichtGelesen.map((n) => `${n.ref}: ${n.grund}`).join('; ')}.`,
            }
          : {};
      const naechsterSchritt = [
        ausstehend.length > 0 ? ANTWORT_AUSSTEHEND_SCHRITT : '',
        nichtsGelesen.error
          ? lesenRatschlag(documents, nichtGefunden.length > 0, parlament ? 'landtag' : 'bundestag')
          : '',
      ]
        .filter(Boolean)
        .join(' ');
      return {
        resultCount: results.length,
        sources: sources ?? '',
        // Die Lizenz verlangt die Namensnennung; das Modell soll sie in der Antwort tragen.
        ...(landtag ? { quelle: landtag.quellenangabe } : {}),
        nichtGelesen,
        ...nichtsGelesen,
        ...(naechsterSchritt ? { naechsterSchritt } : {}),
        ...(notes.length > 0 || fokusNotes.length > 0
          ? { hinweise: [...notes, ...fokusNotes] }
          : {}),
        // Nur für die Karte; wrapTools nimmt das Feld vor dem Modell heraus.
        uiCard: {
          frage,
          ...(fokus ? { fokus } : {}),
          ...(landtag ? { quelle: landtag.quellenangabe, portal: landtag.portalUrl } : {}),
          gelesen: documents
            .filter((d) => d.points.length > 0)
            .map((d) => ({
              ref: bundestagRefLabel(d.ref),
              titel: d.titel,
              aussagen: d.points.length,
              url: d.pdfUrl,
            })),
          nichtGelesen: documents
            .filter((d) => d.points.length === 0)
            .map((d) => ({
              ref: bundestagRefLabel(d.ref),
              titel: d.titel,
              grund: grundFor(d),
            })),
        },
      };
    },
  });
}

/**
 * `abgeordnetenwatch`: mandate and voting data (voting record, side jobs,
 * mandates) via `retrieveAbgeordnetenwatch`. Same shape as `bundestag`:
 * register → lean `{ resultCount, sources }`. DE-only.
 */
export function makeAbgeordnetenwatchTool(ctx: {
  state: ChatGraphState;
  sourceRegistry: SourceRegistry;
}): Tool {
  const { state, sourceRegistry } = ctx;
  return tool({
    description: `Ruft Mandats- und Abstimmungsdaten von abgeordnetenwatch.de ab: Abstimmungsverhalten, Nebentätigkeiten und Mandate einzelner Abgeordneter.

NUTZE WENN nach dem Abstimmungsverhalten, den Nebentätigkeiten oder dem Mandat einer*eines konkreten Abgeordneten gefragt wird. Übergib Person und Thema getrennt (person, thema); als thema den amtlichen Namen des Gesetzes („Gebäudeenergiegesetz“, nicht „Heizungsgesetz“), denn gesucht wird im Titel der Abstimmung. Durchsucht werden alle Mandate der Person, auch frühere Wahlperioden. Nur für Deutschland verfügbar. Nicht für Drucksachen, dafür bundestag und parlament_lesen. Nicht für Reden, dafür bundestag_reden.`,
    inputSchema: z.object({
      query: z.string().min(1).describe('Name der*des Abgeordneten oder ein Thema'),
      person: z
        .string()
        .min(2)
        .max(100)
        .optional()
        .describe('Name der*des Abgeordneten, getrennt vom Thema, z. B. „Katrin Uhlig"'),
      thema: z
        .string()
        .min(2)
        .max(200)
        .optional()
        .describe(
          'Amtlicher Titel der Abstimmung bzw. des Gesetzes, z. B. „Gebäudeenergiegesetz" (nicht „Heizungsgesetz")'
        ),
    }),
    execute: async ({ query, person, thema }) => {
      // Die Ablehnung für Österreich kam sonst als zitierbarer Treffer zurück
      // (`retrieveAbgeordnetenwatch` für den Einzeldurchlauf) — hier ist sie ein Fehler.
      if (!isIntentAllowedForLocale('abgeordnetenwatch', state.userLocale)) {
        return {
          resultCount: 0,
          sources: '',
          ...werkzeugFehler({
            art: 'nicht_verfuegbar',
            ursache: 'abgeordnetenwatch gibt es nur für Deutschland',
            befund: intentDeclineNote('abgeordnetenwatch') ?? null,
            naechsterSchritt: 'Nutze es nicht und sag, dass dazu hier keine Daten vorliegen',
          }),
        };
      }
      let results: Awaited<ReturnType<typeof retrieveAbgeordnetenwatch>>;
      try {
        results = await retrieveAbgeordnetenwatch(query, state.userLocale, {
          ...(person ? { person } : {}),
          ...(thema ? { thema } : {}),
        });
      } catch (error) {
        log.warn(`[abgeordnetenwatch] Abruf fehlgeschlagen („${query}“): ${error}`);
        return {
          resultCount: 0,
          sources: '',
          ...werkzeugFehler({
            art: 'anbieter_ausfall',
            ursache: 'abgeordnetenwatch ist gerade nicht erreichbar',
            befund: `Angefragt: „${query}“`,
            naechsterSchritt:
              'Das heißt nicht, dass es keine Daten gibt; versuche es höchstens einmal erneut',
          }),
        };
      }
      if (results.length === 0) {
        return {
          resultCount: 0,
          sources: '',
          ...werkzeugFehler({
            art: 'nicht_gefunden',
            ursache: 'Zu dieser Anfrage gibt es keine Mandatsdaten',
            befund: `Gesucht: „${query}“ (kein Treffer unter den Abgeordneten und Themen)`,
            naechsterSchritt:
              'Prüfe die Schreibweise des Namens, versuche den Nachnamen allein oder ein Thema statt eines Namens',
          }),
        };
      }
      const sources = sourceRegistry.register(results);
      return { resultCount: results.length, sources: sources ?? '' };
    },
  });
}

/**
 * `umfragen`: Wahlumfragen (Sonntagsfrage via PolitPro, national + Bundesländer
 * + AT-Parlamente) und themenbezogenes Meinungsbild (MRP/GERDA) — the same
 * `lookupUmfragen` the Monitor uses. Registers one source for the [N] footer
 * and returns the full formatted block as the model's grounding.
 *
 * Takes `state` for `userLocale`: this promise of Austrian coverage used to be
 * made in the description only. The tool passed no locale, so `lookupUmfragen`
 * fell back to `deutschland` and an Austrian user asking for the Sonntagsfrage
 * got the Bundestag, labelled as such.
 */
export function makeUmfragenTool(ctx: {
  sourceRegistry: SourceRegistry;
  state: ChatGraphState;
}): Tool {
  const { sourceRegistry, state } = ctx;
  const isAT = state.userLocale === 'de-AT';
  // The wording forks because the examples ARE the instruction: a tool told to
  // expect "Bayern" will not think to pass "Wien", and a national question for
  // an Austrian user means the Nationalrat, not the Bundestag.
  const regionExample = isAT ? '"Wien", "Steiermark"' : '"Bayern"';
  const nationalWord = isAT ? 'österreichweit' : 'bundesweit';
  return tool({
    description: `Ruft aktuelle Wahlumfragen ab: Sonntagsfrage (Parteiwerte, ${nationalWord} oder pro Bundesland) und themenbezogene Meinungsbilder.

NUTZE WENN nach Umfragewerten, der Sonntagsfrage oder der Zustimmung zu einem Thema gefragt wird ("wie stehen die Grünen in Umfragen", "Sonntagsfrage ${isAT ? 'Wien' : 'Bayern'}"). NICHT für Parteipositionen oder Wahlergebnisse.`,
    inputSchema: z.object({
      topic: z
        .string()
        .describe(
          'Thema für das Meinungsbild (z.B. "Klimaschutz"); leer für die reine Sonntagsfrage'
        )
        .default(''),
      bundesland: z
        .string()
        .optional()
        .describe(
          `Bundesland/Region für die Sonntagsfrage (z.B. ${regionExample}); weglassen für ${nationalWord}`
        ),
    }),
    execute: async ({ topic, bundesland }) => {
      const filter = `${bundesland ? `Region „${bundesland}“` : isAT ? 'österreichweit' : 'bundesweit'}${topic ? `, Thema „${topic}“` : ''}`;
      let text: string | null;
      try {
        text = await lookupUmfragen(topic ?? '', bundesland, isAT ? 'de-AT' : 'de-DE');
      } catch (error) {
        // Ausfall und „keine Daten" sind zwei Befunde: nur der erste lohnt einen Wiederholungsversuch.
        log.warn(`[umfragen] Abruf fehlgeschlagen (${filter}): ${error}`);
        return {
          resultCount: 0,
          sources: '',
          ...werkzeugFehler({
            art: 'anbieter_ausfall',
            ursache: 'Der Umfragedienst ist gerade nicht erreichbar',
            befund: `Angefragt: ${filter}`,
            naechsterSchritt:
              'Das heißt nicht, dass es keine Umfragen gibt; nenne keine Zahlen aus dem Gedächtnis und sag offen, dass der Abruf nicht lief',
          }),
        };
      }
      if (!text) {
        return {
          resultCount: 0,
          sources: '',
          ...werkzeugFehler({
            art: 'nicht_gefunden',
            ursache: 'Der Umfragedienst hat dazu keine Werte geliefert',
            befund: `Angefragt: ${filter}. Ein Ausfall des Anbieters lässt sich davon nicht sicher unterscheiden`,
            naechsterSchritt:
              'Versuche es ohne Thema oder ohne Region (reine Sonntagsfrage), sonst sag offen, dass keine Werte vorliegen',
          }),
        };
      }
      const sources = sourceRegistry.register([
        {
          source: 'umfragen',
          title: `Wahlumfragen${bundesland ? ` ${bundesland}` : ''} (PolitPro)`,
          content: text,
          url: 'https://politpro.eu',
        },
      ]);
      return { resultCount: 1, sources: sources ?? '', umfragen: text };
    },
  });
}

/**
 * `gruenerator_docs_search`: BM25 over the Grünerator user documentation
 * (doku.gruenerator.eu), the retrieval half of the `hilfe` intent.
 *
 * The prompt half is the page MAP (`buildDocsPageMap`, injected by respondNode)
 * — the two are complementary, not redundant: the map lists every page so the
 * model can point at the right one, this tool pulls the actual section text so
 * it can answer the question. Hits go through the source registry like any
 * search tool, so the sections become numbered `[N]` citations that deep-link
 * to `…/docs/page#section`.
 *
 * Purely in-process (a generated index, no network, no embeddings), so it is
 * cheap enough to call speculatively and works in tests without fixtures.
 */
export function makeDocsSearchTool(ctx: { sourceRegistry: SourceRegistry }): Tool {
  const { sourceRegistry } = ctx;
  return tool({
    description: `Durchsucht die offizielle Grünerator-Dokumentation (Anleitungen, Hilfeseiten, Funktionsbeschreibungen) und liefert Abschnitte mit direkt verlinkbaren Fundstellen.

NUTZE WENN es um die BEDIENUNG des Grünerators geht: "wie erstelle ich ein Sharepic", "wie lege ich ein Notebook an", "wie binde ich die Grüne Wolke ein", "wie teile ich etwas im Marktplatz", "wo finde ich die Konnektoren". Was ein Begriff bedeutet oder welche Funktionen, Modellstufen und Anbindungen es gibt, beantwortet product_knowledge.

NICHT für politische Inhalte oder Parteiprogramme (nutze gruenerator_search), nicht für allgemeine Web-Recherche (nutze web_search), nicht für die eigenen Dokumente der Nutzer*innen.

Verlinke die gefundenen Seiten in der Antwort mit ihrer vollständigen URL.`,
    inputSchema: z.object({
      query: z
        .string()
        .min(1)
        .describe('Suchbegriff oder Frage zur Grünerator-Bedienung, auf Deutsch'),
    }),
    execute: async ({ query }) => {
      const hits = searchDocs(query, 5);
      if (hits.length === 0) {
        return {
          resultCount: 0,
          sources: '',
          note: 'Zu dieser Frage steht nichts in der Grünerator-Dokumentation. Sage das ehrlich, statt eine Anleitung zu erfinden.',
        };
      }
      const results: SearchResult[] = hits.map((hit) => ({
        source: 'gruenerator-docs',
        url: hit.url,
        title: hit.title,
        content: hit.snippet,
      }));
      const sources = sourceRegistry.register(results);
      return {
        resultCount: results.length,
        sources: sources ?? '',
        // Unlike the other search tools, this one KEEPS a (lean) results array.
        // The registry's `sources` block is `[N] title — snippet` with no URL,
        // and linking the right doc page is the entire point of this tool — the
        // model cannot write a link it was never given. Title+URL only, so the
        // token cost stays ~15 per hit. It also gives the tool card something to
        // render (parseSearchCitations reads `results`).
        results: hits.map((hit) => ({ title: hit.title, url: hit.url })),
        // Page-level neighbours so the model can offer "mehr dazu" without a
        // second call.
        verwandteSeiten: relatedDocsPages(query),
      };
    },
  });
}

/**
 * `generate_image`: Flux image generation via `imageNode`. Emits
 * `image_start`/`image_complete` (the latter carries the full image incl.
 * base64 for the live card). `imageNode` derives subject+style from the last
 * user message, so the model's `prompt` is injected as a synthetic trailing
 * user message — that lets the loop steer the image (e.g. from search results).
 * The result is merged back onto the shared state so the router persists it via
 * the message-level `generatedImage` metadata (its rehydration path); the model
 * only gets a lean confirmation (no base64). Editing an image is `edit_image`
 * below; an ATTACHED photo stays single-pass `image_edit` (`isPixelTurn`).
 */
export function makeImageTool(ctx: { sse: SSEWriter; state: ChatGraphState }): Tool {
  const { sse, state } = ctx;
  return tool({
    description: `Generiert ein Bild (Illustration, Foto-Stil oder Sharepic-Motiv) aus einer Beschreibung.

NUTZE WENN der*die Nutzer*in ein Bild/Motiv/eine Illustration erzeugt haben möchte ("mach/generiere/zeichne ein Bild von ..."). Übergib eine präzise Bildbeschreibung auf Deutsch.`,
    inputSchema: z.object({
      prompt: z.string().min(1).describe('Bildbeschreibung (Motiv, Stil, Details)'),
    }),
    execute: async ({ prompt }) => {
      // Idempotent per turn: the loop model can't SEE the image it made and
      // tends to re-call ("try again"), which burns the daily image quota (seen
      // live: 3 generations for one request). If we already produced one this
      // turn, acknowledge success instead of generating again.
      if (state.generatedImage) {
        return {
          ok: true,
          note: 'Es wurde in diesem Turn bereits ein Bild erstellt und dem*der Nutzer*in angezeigt. Rufe generate_image NICHT erneut auf; beschreibe das Bild kurz.',
        };
      }
      sse.send('image_start', { message: PROGRESS_MESSAGES.imageStart });
      const injected = { role: 'user', content: prompt } as ChatGraphState['messages'][number];
      const result = await imageNode({ ...state, messages: [...state.messages, injected] });
      // Mirror the single-pass merge so the router persists the image through
      // the message-level generatedImage metadata (state is the shared ref).
      state.generatedImage = result.generatedImage ?? null;
      if (state.generatedImage) {
        sse.send('image_complete', {
          message: PROGRESS_MESSAGES.imageComplete,
          image: state.generatedImage,
        });
        return {
          ok: true,
          prompt: state.generatedImage.prompt,
          style: state.generatedImage.style,
          note: 'Bild erfolgreich erstellt und dem*der Nutzer*in angezeigt. Rufe generate_image NICHT erneut auf; kündige das Bild kurz an.',
        };
      }
      const err = result.error ?? 'Bildgenerierung fehlgeschlagen.';
      sse.send('image_complete', { message: PROGRESS_MESSAGES.imageError(err), error: err });
      return { error: err };
    },
  });
}

/**
 * `edit_image`: verändert das zuletzt im Thread erzeugte Bild (FLUX
 * image-to-image über `imageEditNode`). Live 05.11.2026: „passe die grafik noch
 * einmal an" traf keine Bearbeitungs-Vokabel des Klassifikators, landete ohne
 * Bildwerkzeug — und die Antwort erzählte eine Anpassung, die nie lief. Mit dem
 * Werkzeug im Loop entscheidet der Planer, nicht eine Wortliste.
 *
 * Gleiche Bauform wie `generate_image`: Ergebnis auf den geteilten State (der
 * Router persistiert es als `generatedImage`), Karte über `image_start`/
 * `image_complete`, und höchstens ein Bild je Turn — der Planer sieht das Bild
 * nicht und würde sonst „noch einmal versuchen" (Baum-Budget).
 */
export function makeEditImageTool(ctx: {
  sse: SSEWriter;
  state: ChatGraphState;
  threadId: string | null;
  /** Die Bilder dieses Turns (Anhänge, Wolke); `bild` adressiert sie per Nummer. */
  turnImages?: readonly TurnImage[];
  /** Ohne `bild` das zuletzt erzeugte Bild bearbeiten — nur dann sinnvoll. */
  lastImageDefault?: boolean;
}): Tool {
  const { sse, state, threadId } = ctx;
  const turnImages = ctx.turnImages ?? [];
  const lastImageDefault = ctx.lastImageDefault ?? true;
  return tool({
    description: `Verändert ein Bild (KI-Bildbearbeitung, Bild-zu-Bild): ohne \`bild\` das Bild, das in diesem Gespräch zuletzt erzeugt wurde, mit \`bild\` ein Foto dieses Turns (angehängt oder aus der Wolke, Nummern wie im Systemprompt).

NUTZE WENN der*die Nutzer*in an DIESEM Bild etwas geändert haben möchte ("passe die Grafik an", "die Mühle an den Rand", "mach den Himmel dunkler", "noch einmal, aber mit Schnee"). Übergib die gewünschte Änderung als knappe deutsche Anweisung.
Eigenes Foto + "erstelle ein Bild von mir, wie ich X mache" / "setz mich auf …": edit_image mit \`bild\` = Nummer des Fotos, \`anweisung\` = die Szene — nur so bleibt die Person erkennbar. Ein neues Motiv ohne Foto einer Person: generate_image, nicht dieses Werkzeug. Nicht für Fragen zum Bild.${lastImageDefault ? '' : '\nOhne `bild` gibt es in diesem Turn nichts zu bearbeiten: gib immer `bild` an.'}`,
    inputSchema: z.object({
      anweisung: z.string().min(1).describe('Was sich am Bild ändern soll'),
      bild: z
        .number()
        .int()
        .min(1)
        .max(Math.max(turnImages.length, 1))
        .optional()
        .describe(
          'Nummer eines Fotos dieses Turns als Vorlage; weglassen = zuletzt erzeugtes Bild'
        ),
    }),
    execute: async ({ anweisung, bild }) => {
      if (state.generatedImage) {
        return {
          ok: true,
          note: 'In diesem Turn wurde bereits ein Bild erzeugt und angezeigt. Rufe edit_image NICHT erneut auf; beschreibe die Änderung kurz.',
        };
      }
      let previous: ImageAttachment | null;
      if (bild != null) {
        const entry = turnImages[bild - 1];
        if (!entry) {
          return { error: `Es gibt kein Bild ${bild} — vorhanden sind ${turnImages.length}.` };
        }
        const loaded = await entry.load();
        if (!loaded.ok) {
          return {
            error: `„${entry.name}“ konnte nicht geladen werden (${loaded.message}). Sag das ehrlich und erzeuge KEIN Bild, das so tut, als zeige es die Person.`,
          };
        }
        previous = loaded.image;
      } else {
        previous = lastImageDefault && threadId ? await loadLastGeneratedImage(threadId) : null;
        if (!previous) {
          return {
            error: lastImageDefault
              ? 'Das vorige Bild ist nicht mehr verfügbar. Sag das ehrlich und biete an, ein neues Bild zu erzeugen.'
              : 'Gib mit `bild` die Nummer des Fotos an, das bearbeitet werden soll.',
          };
        }
      }
      sse.send('image_start', { message: PROGRESS_MESSAGES.imageEditStart });
      const injected = { role: 'user', content: anweisung } as ChatGraphState['messages'][number];
      const result = await imageEditNode({
        ...state,
        messages: [...state.messages, injected],
        imageAttachments: [previous],
        imageEditStyle: 'universal',
      });
      state.generatedImage = result.generatedImage ?? null;
      if (state.generatedImage) {
        sse.send('image_complete', {
          message: PROGRESS_MESSAGES.imageEditComplete,
          image: state.generatedImage,
        });
        return {
          ok: true,
          anweisung,
          note: 'Bild bearbeitet und dem*der Nutzer*in angezeigt. Rufe edit_image NICHT erneut auf; beschreibe die Änderung in 1–2 Sätzen.',
        };
      }
      const err = result.error ?? 'Bildbearbeitung fehlgeschlagen.';
      sse.send('image_complete', { message: PROGRESS_MESSAGES.imageError(err), error: err });
      return { error: err };
    },
  });
}

/**
 * `sharepic` (Phase 3n fat tool, compound turns only): wraps the complete
 * single-pass sharepic pipeline (`runSharepicGeneration` — loop-safe: it emits
 * `sharepic_complete` itself and never ends the turn) so "recherchiere X und
 * mach ein Sharepic" can compose search + generation in ONE loop. The catalog
 * key MUST stay `sharepic`: card rehydration and follow-up edits look up the
 * persisted `toolName === 'sharepic'` with `result.variants`
 * (threadMessageConversion / getLastSharepicVariant / sharepicEditService), so
 * returning `{ variants }` verbatim keeps all three consumers unchanged.
 */
export function makeCreateSharepicTool(ctx: {
  sse: SSEWriter;
  state: ChatGraphState;
  threadId: string | null;
  /** The turn forbade new research — see `briefInstruction`. */
  researchBanned?: boolean;
}): Tool {
  const { sse, state, threadId } = ctx;
  return tool({
    description: `Erstellt ein Sharepic (gebrandete Social-Media-Grafik) aus einer Kernaussage.

NUTZE NUR WENN der*die Nutzer*in ausdrücklich ein Sharepic/Spruchbild/Zitatbild/Karussell/eine Infografik/einen Dreizeiler verlangt hat — NICHT bei "Grafik", "Kachel" oder "Bild". ${briefInstruction(ctx.researchBanned === true, 'die konkrete, belegte Kernaussage')}

Fotos des Turns gehen automatisch mit; was fehlt oder geändert wurde, steht im Ergebnis unter "bericht" – sag es der Person.`,
    inputSchema: z.object({
      text: z
        .string()
        .min(1)
        .describe('Kernaussage/Thema des Sharepics — konkret, mit den recherchierten Fakten'),
    }),
    execute: async ({ text }) => {
      // Idempotent per turn (mirror of generate_image): variants are expensive
      // and the model can't see the rendered result, so it tends to re-call.
      if (state.sharepicVariants?.length) {
        return {
          ok: true,
          note: 'Es wurde in diesem Turn bereits ein Sharepic erstellt und angezeigt. Rufe das Tool NICHT erneut auf; kündige das Sharepic kurz an.',
        };
      }
      sse.send('image_start', { message: 'Entwerfe dein Sharepic…' });
      // runSharepicGeneration reads its topic from the LAST user message —
      // inject the model's researched text there (same trick as generate_image).
      const injected = { role: 'user', content: text } as ChatGraphState['messages'][number];
      const { variants, failure } = await runSharepicGeneration({
        state: { ...state, messages: [...state.messages, injected] },
        sse,
        threadId,
        request: lastUserText(state.messages) ?? text,
      });
      if (variants.length === 0) {
        // Error SSE already emitted inside runSharepicGeneration.
        // Den Grund nur durchreichen, wo der Aufrufer ihn kennt — keinen erfinden.
        return erstellungFehlgeschlagen(
          'Sharepic',
          failure && failure !== 'unchanged'
            ? draftFailedText(
                'Der Entwurf ist nicht gelungen.',
                failure,
                'Formuliere den Auftrag etwas genauer und versuch es noch einmal.'
              )
            : null
        );
      }
      // Shared-ref merge → forceFinish trips and the router lifts the variants
      // for persistence (like generatedImage).
      state.sharepicVariants = variants;
      return {
        variants,
        bericht: berichtFuerKi(parseSharepicChatProps(variants[0]?.initialProps)?.bericht ?? []),
        note: 'Sharepic erstellt und dem*der Nutzer*in angezeigt. Rufe das Tool NICHT erneut auf; kündige es kurz an und biete Anpassungen an.',
      };
    },
  });
}

/**
 * Compound document fat tool (Phase 3n): presentations and sheets as opaque
 * loop tools so "recherchiere X und erstelle eine Präsentation/Tabelle" composes
 * search + generation in ONE turn. Mirrors `makeCreateSharepicTool`: idempotent
 * per turn (`state.createdDocument`), delegates to the loop-safe
 * `runDocGeneration` core, emits the same `document_created` SSE the single-pass
 * handlers do (so the chat card renders live + thread-reload rehydrates via the
 * persisted message `createdDocument` metadata), and hands the model a lean
 * value to announce. The `prompt` arg carries the researched, concrete brief.
 */
/**
 * The one sentence every generation tool opens its brief instruction with.
 *
 * It used to be four hard-coded copies of "Recherchiere ZUERST die Fakten
 * (gruenerator_search)". That is right for the ordinary turn and flatly wrong
 * when the user just said "ohne neue Recherche": the description then ordered a
 * search the catalog had deliberately not mounted, so the model either stalled
 * or reached for the nearest substitute. One switch, four call sites.
 */
function briefInstruction(researchBanned: boolean, what: string): string {
  return researchBanned
    ? `Recherchiere NICHT — der*die Nutzer*in hat neue Recherche ausdrücklich ausgeschlossen. Übergib ${what} ausschließlich auf Basis dessen, was im bisherigen Gespräch steht.`
    : `Recherchiere ZUERST die Fakten (gruenerator_search), dann übergib ${what} — kein Platzhaltertext.`;
}

/**
 * Was der Fabrik an Wortwahl fehlt — der Produktname kommt aus der Registry
 * (`artifactKind(kind).label`), die Umschreibung der Sache steht hier, weil sie
 * nur diese Werkzeugbeschreibung braucht.
 */
const DOC_ARTIFACT_PHRASE: Record<CreateDocKind, string> = {
  presentation: 'eine Präsentation (Foliendeck) zu einem Thema',
  sheet: 'eine Tabelle/Kalkulation zu einem Thema',
  document: 'ein Textdokument zu einem Thema',
};

/** Die drei Arten, die dieselbe Fabrik bedient (PDF und Board haben eigene). */
type CreateDocKind = Extract<ArtifactKindId, 'presentation' | 'sheet' | 'document'>;

const EDIT_ORDER_NOT_CREATE =
  'Dieser Auftrag ändert ein vorhandenes Artefakt — es wird nichts neu angelegt. Nutze dessen Bearbeitungswerkzeug (edit_sheet, edit_presentation, edit_explainable, edit_document_text).';

/**
 * The full brief for an artifact generator: the thread, then the planner's
 * order, then this turn's sources.
 *
 * The transcript is the part that was missing. A generator is a separate model
 * call that never sees the chat's system prompt or its history — all it got here
 * was `prompt`, a free-text order the planner RETYPES from its own short-term
 * memory. Live (QA 28.07.2026): three measures were agreed in the thread, the
 * PDF kept the catchiest one and replaced the other two with generic substitutes
 * the generator knew on its own. Nothing had shown it the list.
 *
 * The single-pass create turns were given the same transcript in #2136
 * (`createTurn.ts`); this is the loop's half of that fix, deliberately reusing
 * the identical framing so both paths speak one format.
 */
function briefWithContext(
  prompt: string,
  state: ChatGraphState,
  sourceRegistry?: SourceRegistry
): string {
  const withHistory = withConversationContext(
    prompt,
    buildCreateTurnContext(state.messages ?? []),
    turnMaterialBlock(state.attachmentContext)
  );
  return withResearchedSources(withHistory, sourceRegistry?.renderReference() ?? '');
}

export function makeCreateDocTool(ctx: {
  kind: CreateDocKind;
  sse: SSEWriter;
  state: ChatGraphState;
  req: Request;
  /** Sources gathered this turn. Appended to the brief so the artifact is built
   *  from the real snippets (incl. URLs) rather than from whatever the planner
   *  chose to retype into `prompt`. */
  sourceRegistry?: SourceRegistry;
  /** The turn forbade new research — see `briefInstruction`. */
  researchBanned?: boolean;
}): Tool {
  const { kind, sse, state, req, sourceRegistry } = ctx;
  const label = artifactKind(kind).label;
  const artifact = DOC_ARTIFACT_PHRASE[kind];
  return tool({
    description: `Erstellt ${artifact}.

NUTZE WENN der*die Nutzer*in ${label === 'Präsentation' ? 'eine Präsentation/Folien' : label === 'Tabelle' ? 'eine Tabelle/Kalkulation' : 'ein Dokument/einen Text'} zum Thema möchte. ${briefInstruction(ctx.researchBanned === true, 'in "prompt" einen konkreten, mit den recherchierten Fakten angereicherten Auftrag')}`,
    inputSchema: z.object({
      prompt: z
        .string()
        .min(1)
        .describe(
          `Konkreter Auftrag für ${label === 'Dokument' ? 'das Dokument' : `die ${label}`} — Thema plus die recherchierten Fakten/Inhalte, die vorkommen sollen`
        ),
    }),
    execute: async ({ prompt }, options) => {
      // The classifier read this turn as an order to an EXISTING artifact. Live
      // 11.10.2026 the planner ran edit_presentation and then built a second
      // deck with the same title anyway.
      if (state.artifactEditOrder === true) return { error: EDIT_ORDER_NOT_CREATE };
      // Idempotent per turn (mirror of sharepic/generate_image): generation is
      // expensive and the model can't see the rendered result, so it re-calls.
      if (state.createdDocument) {
        return {
          ok: true,
          note: `Es wurde in diesem Turn bereits ${label === 'Dokument' ? 'ein Dokument' : `eine ${label}`} erstellt und angezeigt. Rufe das Tool NICHT erneut auf; kündige es kurz an.`,
        };
      }
      const userId = state.agentConfig?.userId;
      if (!userId) {
        return { error: `${label}-Erstellung nicht möglich (keine Nutzer-Sitzung).` };
      }
      // A sheet has no place for the thread image; a document and a deck do.
      const image =
        kind === 'sheet'
          ? null
          : await threadImageInLibrary(state).catch((err: unknown) => {
              log.warn(`[${label}] Bild aus dem Gespräch nicht geladen: ${String(err)}`);
              return null;
            });
      const created = await runDocGeneration({
        kind,
        userContent: briefWithContext(prompt, state, sourceRegistry),
        req,
        userId,
        image,
        // The loop's per-call timeout abandons but does not cancel — without
        // this the write happens anyway, into a turn that already gave up.
        ...(options?.abortSignal && { abandoned: options.abortSignal }),
      });
      if (!created) {
        return erstellungFehlgeschlagen(label);
      }
      // Live card (same event the single-pass handler emits). Shared-ref merge →
      // forceFinish trips and the router lifts it for message-level persistence.
      sse.send('document_created', created);
      state.createdDocument = created;
      const imageNote = image
        ? kind === 'presentation'
          ? ' Das Bild aus dem Gespräch steht auf einer eigenen Bildfolie.'
          : ' Das Bild aus dem Gespräch steht im Dokument unter der Überschrift.'
        : threadImageNotTaken(state, label === 'Dokument' ? 'im Dokument' : `in der ${label}`);
      return {
        document: created,
        note: `${label} erstellt und dem*der Nutzer*in angezeigt. Rufe das Tool NICHT erneut auf; kündige es kurz an.${imageNote}`,
      };
    },
  });
}

/**
 * Compound PDF fat tool. Same contract as makeCreateDocTool (idempotent via
 * `state.createdDocument`, `document_created` SSE, router lifts the metadata) —
 * but the result is a finished, downloadable CI-styled PDF (subtype 'pdf',
 * url = authenticated compute-asset download), not an editable document. Kept
 * as a sibling factory because of the extra letterhead/sender input fields.
 */
export function makeCreatePdfTool(ctx: {
  sse: SSEWriter;
  state: ChatGraphState;
  req: Request;
  /** See {@link makeCreateDocTool} — the brief is enriched with this turn's
   *  (and any carried) sources so "PDF mit den Originalquellen" can actually
   *  reproduce them. */
  sourceRegistry?: SourceRegistry;
  /** The turn forbade new research — see `briefInstruction`. */
  researchBanned?: boolean;
}): Tool {
  const { sse, state, req, sourceRegistry } = ctx;
  return tool({
    description: `Erstellt ein fertig gestaltetes PDF nach dem Barrierefreiheits-Standard PDF/UA-1 zum Herunterladen. Der*die Nutzer*in beschreibt frei, was drin stehen soll — Aufbau (Überschriften, Listen, Tabellen, Hinweiskästen, Datenblätter, Unterschriftszeilen) wählt das System passend zum Auftrag.

DREI ARTEN:
- "dokument": Merkblatt, Konzept, Übersicht, Protokoll, Handout — alles zum Lesen/Ausdrucken
- "brief": offizieller Brief / Anschreiben mit Grünen-Briefkopf (DIN 5008)
- "formular": AUSFÜLLBARES Formular mit echten Feldern (Text, Datum, Auswahl, Ankreuzfelder) — für Anträge, Anmeldungen, Fragebögen

NUTZE WENN ein fertiges PDF, ein Schreiben mit Briefkopf oder ein ausfüllbares Formular gewünscht ist. ${briefInstruction(ctx.researchBanned === true, 'in "prompt" einen konkreten, mit den recherchierten Fakten angereicherten Auftrag')}

WICHTIG — PRÜFEN STATT BEHAUPTEN: Das Tool öffnet das erzeugte PDF erneut und prüft, ob Text wirklich auslesbar ist, die Struktur getaggt wurde, die PDF/UA-Kennung gesetzt ist und alle Formularfelder beschriftet sind. Häufiger Fehler bei PDFs: Sie sehen richtig aus, enthalten aber KEINE auslesbare Textebene oder keine Tags — dann kann sie kein Screenreader lesen. Lies deshalb IMMER das Feld "geprueft" und vor allem "probleme" im Ergebnis und nenne gefundene Probleme offen; behaupte NIE, das PDF sei barrierefrei, wenn "probleme" nicht leer ist.`,
    inputSchema: z.object({
      prompt: z
        .string()
        .min(1)
        .describe(
          'Konkreter Auftrag für das PDF — Thema, gewünschter Aufbau und die recherchierten Fakten/Inhalte, die vorkommen sollen. Bei einem Formular: welche Angaben abgefragt werden sollen.'
        ),
      art: z
        .enum(['dokument', 'brief', 'formular'])
        .optional()
        .describe(
          'Art des PDFs. "formular" nur bei einem AUSFÜLLBAREN Formular, "brief" bei einem Schreiben mit Briefkopf.'
        ),
      sender: z
        .object({
          name: z.string().optional().describe('Name der absendenden Person'),
          organization: z.string().optional().describe('Gliederung, z.B. "KV Musterstadt"'),
          address: z.string().optional().describe('Absender-Adresse (mehrzeilig)'),
        })
        .optional()
        .describe(
          'Absenderblock für den Briefkopf — nur wenn der*die Nutzer*in Angaben gemacht hat'
        ),
      recipient: z
        .string()
        .optional()
        .describe('Empfänger-Adressblock (mehrzeilig) — nur bei einem Brief'),
      aendert_letztes_pdf: z
        .boolean()
        .optional()
        .describe(
          'true, wenn ein bereits in diesem Gespräch erzeugtes PDF geändert werden soll. Das bisherige Dokument wird dann vollständig übernommen und nur der Auftrag aus "prompt" darauf angewandt — beschreibe in "prompt" dann NUR die Änderung, nicht das ganze Dokument.'
        ),
    }),
    execute: async ({ prompt, art, sender, recipient, aendert_letztes_pdf }, options) => {
      // Idempotent per turn (mirror of makeCreateDocTool).
      if (state.createdDocument) {
        return {
          ok: true,
          note: 'Es wurde in diesem Turn bereits ein PDF erstellt und angezeigt. Rufe das Tool NICHT erneut auf; kündige es kurz an.',
        };
      }
      const userId = state.agentConfig?.userId;
      if (!userId) {
        return { error: 'PDF-Erstellung nicht möglich (keine Nutzer-Sitzung).' };
      }
      // An edit re-renders the stored spec; the instruction alone would produce
      // a new, much shorter document ("Ziel auf 100" → a one-line PDF).
      const basePdfSpec =
        aendert_letztes_pdf === true && state.threadId
          ? await loadLastPdfSpec(state.threadId)
          : null;

      const brief = basePdfSpec
        ? buildPdfEditBrief(basePdfSpec, prompt)
        : briefWithContext(prompt, state, sourceRegistry);
      const userContent = recipient ? `${brief}\n\nEmpfänger des Schreibens:\n${recipient}` : brief;
      // Classify on the ASK, never on the enriched brief: a "Formular"/"Brief"
      // wording inside an appended source snippet would otherwise flip the layout.
      // An edit keeps the base document's kind — "kürze das" says nothing about
      // layout, and re-classifying on it would turn a Brief into a Merkblatt.
      const documentKind =
        art === 'formular'
          ? 'form'
          : art === 'brief'
            ? 'letter'
            : basePdfSpec
              ? basePdfSpec.kind
              : pdfKindFromText(prompt);
      const result = await runPdfGeneration({
        userContent,
        req,
        userId,
        pdfOptions: {
          documentKind,
          sender: sender
            ? {
                name: sender.name ?? null,
                organization: sender.organization ?? null,
                address: sender.address ?? null,
              }
            : null,
          userLocale: state.userLocale === 'de-AT' ? 'de-AT' : 'de-DE',
        },
        // See makeCreateDocTool — abandoned ≠ cancelled.
        ...(options?.abortSignal && { abandoned: options.abortSignal }),
      });
      if (!result) {
        return erstellungFehlgeschlagen('PDF');
      }
      // Live card (same event the single-pass handler emits). Shared-ref merge →
      // forceFinish trips and the router lifts it for message-level persistence.
      sse.send('document_created', result.document);
      state.createdDocument = result.document;
      // Carries the spec into the persisted message so the NEXT edit has a base.
      state.createdPdfSpec = result.spec;

      // An edit that found no base silently became a new document built from the
      // instruction alone — a one-line PDF where the user expected their old one
      // back. The model has to be able to say so.
      const baseMissing = aendert_letztes_pdf === true && !basePdfSpec;
      const verb = basePdfSpec ? 'PDF neu erzeugt' : 'PDF erstellt';
      return {
        document: result.document,
        geprueft: result.summary,
        felder: result.verification.formFields,
        probleme: result.verification.problems,
        ...(basePdfSpec && { basiertAufVorherigemPdf: true }),
        note:
          (baseMissing
            ? 'ACHTUNG: Zu diesem Gespräch war kein früheres PDF mehr auffindbar — das hier ist eine NEUANLAGE aus deinem Auftrag, keine Überarbeitung. Sag das der*dem Nutzer*in klar. '
            : basePdfSpec
              ? 'Das bisherige PDF wurde als Grundlage übernommen und mit der Änderung neu erzeugt. '
              : '') +
          (result.verification.problems.length
            ? `${verb} und als Download angezeigt. Die Selbstprüfung hat Probleme gefunden — nenne sie der*dem Nutzer*in offen. Rufe das Tool NICHT erneut auf.`
            : `${verb}, selbst geprüft und als Download angezeigt. Rufe das Tool NICHT erneut auf; kündige es kurz an.`) +
          threadImageNotTaken(state, 'im PDF'),
      };
    },
  });
}

/**
 * Compound explainable fat tool. Same contract as makeCreateDocTool (idempotent
 * via `state.createdDocument`, `document_created` SSE, router lifts the
 * metadata); the card opens the explainable's own page (`/erklaert/<slug>`).
 *
 * The sources go along as a LIST, not only as text in the brief: an explainable
 * stores them and renders its `[n]` markers against them. `getCitations()` is
 * numbered like `renderReference()`, which is what the brief carries — so the
 * numbers the generator writes resolve to the right entries.
 */
export function makeCreateExplainableTool(ctx: {
  sse: SSEWriter;
  state: ChatGraphState;
  sourceRegistry?: SourceRegistry;
  /** The turn forbade new research — see `briefInstruction`. */
  researchBanned?: boolean;
}): Tool {
  const { sse, state, sourceRegistry } = ctx;
  return tool({
    description: `Erstellt ein Explainable: eine eigene Seite, die ein Thema in einfacher Sprache erklärt, mit bis zu drei gemalten Erklärbildern. Der Text entsteht sofort, die Bilder werden danach im Hintergrund gemalt.

NUTZE NUR WENN der*die Nutzer*in ausdrücklich ein Explainable (bzw. eine Erklärseite) möchte — nicht für eine normale Erklärung im Chat. ${briefInstruction(ctx.researchBanned === true, 'in "prompt" einen konkreten, mit den recherchierten Fakten angereicherten Auftrag')}`,
    inputSchema: z.object({
      prompt: z
        .string()
        .min(1)
        .describe(
          'Konkreter Auftrag für das Explainable — das Thema, für wen es ist (falls genannt) und die recherchierten Fakten, die vorkommen sollen'
        ),
    }),
    execute: async ({ prompt }, options) => {
      if (state.artifactEditOrder === true) return { error: EDIT_ORDER_NOT_CREATE };
      // Idempotent per turn (mirror of makeCreateDocTool).
      if (state.createdDocument) {
        return {
          ok: true,
          note: 'Es wurde in diesem Turn bereits ein Explainable erstellt und angezeigt. Rufe das Tool NICHT erneut auf; kündige es kurz an.',
        };
      }
      const userId = state.agentConfig?.userId;
      if (!userId) {
        return { error: 'Explainable-Erstellung nicht möglich (keine Nutzer-Sitzung).' };
      }
      const outcome = await runExplainableGeneration({
        brief: briefWithContext(prompt, state, sourceRegistry),
        sources: (sourceRegistry?.getCitations() ?? []).map((c) => ({
          index: c.id,
          title: c.title || c.url || `Quelle ${c.id}`,
          url: c.url || null,
        })),
        userId,
        threadId: state.threadId ?? null,
        locale: state.userLocale === 'de-AT' ? 'de-AT' : 'de-DE',
        // See makeCreateDocTool — abandoned ≠ cancelled.
        ...(options?.abortSignal && { abandoned: options.abortSignal }),
      });
      if (!outcome) {
        return erstellungFehlgeschlagen('Explainable');
      }
      if (!outcome.ok) {
        return {
          error: explainableRefusalText(outcome),
          note: 'Es wurde KEIN Explainable erstellt. Sag das der*dem Nutzer*in mit genau diesem Grund und rufe das Tool NICHT erneut auf.',
        };
      }
      // Live card (same event the single-pass handler emits). Shared-ref merge →
      // forceFinish trips and the router lifts it for message-level persistence.
      sse.send('document_created', outcome.document);
      state.createdDocument = outcome.document;
      return {
        document: outcome.document,
        note:
          'Explainable erstellt und der*dem Nutzer*in als Karte angezeigt. Die Erklärbilder werden gerade im Hintergrund gemalt und erscheinen gleich auf der Seite. Füge den Inhalt NICHT noch einmal in deine Antwort ein; kündige das Explainable in ein, zwei Sätzen an. Rufe das Tool NICHT erneut auf.' +
          threadImageNotTaken(state, 'im Explainable — seine Erklärbilder werden eigens gemalt'),
      };
    },
  });
}

/**
 * Compound board fat tool. Boards have a DIFFERENT contract than documents:
 * no `document_created`/card path — the board renders from `boardId` +
 * `boardGeneratedStructure` in the turn's `done` event. So this tool stashes the
 * descriptor on `state.createdBoard` (shared-ref → router lifts it into the loop
 * `done` event) and hands the model the board URL to mention. No card
 * rehydration on reload (matches the single-pass @board-erstellen path).
 */
export function makeCreateBoardTool(ctx: {
  state: ChatGraphState;
  req: Request;
  /** The turn forbade new research — see `briefInstruction`. */
  researchBanned?: boolean;
}): Tool {
  const { state, req } = ctx;
  return tool({
    description: `Erstellt ein Kanban-Board (Aufgabenboard) zu einem Thema.

NUTZE WENN der*die Nutzer*in ein Board/Kanban zum Thema möchte. ${briefInstruction(ctx.researchBanned === true, 'in "prompt" einen konkreten, mit den recherchierten Inhalten angereicherten Auftrag (Aufgaben/Spalten)')}`,
    inputSchema: z.object({
      prompt: z
        .string()
        .min(1)
        .describe('Konkreter Auftrag für das Board — Thema plus die Aufgaben/Inhalte'),
    }),
    execute: async ({ prompt }, options) => {
      if (state.createdBoard) {
        return {
          ok: true,
          note: 'Es wurde in diesem Turn bereits ein Board erstellt und angezeigt. Rufe das Tool NICHT erneut auf; kündige es kurz an.',
        };
      }
      const userId = state.agentConfig?.userId;
      if (!userId) {
        return { error: 'Board-Erstellung nicht möglich (keine Nutzer-Sitzung).' };
      }
      const created = await runBoardGeneration({
        userContent: briefWithContext(prompt, state),
        req,
        userId,
        // See makeCreateDocTool — abandoned ≠ cancelled.
        ...(options?.abortSignal && { abandoned: options.abortSignal }),
      });
      if (!created) {
        return erstellungFehlgeschlagen('Board');
      }
      // Shared-ref merge → forceFinish trips and the router lifts boardId +
      // structure into the `done` event (boards have no mid-stream card SSE).
      state.createdBoard = created;
      return {
        board: { boardId: created.boardId, title: created.title },
        note: `Board "${created.title}" erstellt (unter /boards/${created.boardId}). Rufe das Tool NICHT erneut auf; kündige es kurz an und nenne den Link.`,
      };
    },
  });
}
