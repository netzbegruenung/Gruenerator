/**
 * Die Dokumente, die an DIESEN Turn hängen — und die zwei Wege, an ihren Inhalt
 * zu kommen. Eine Stelle, weil Seed und Werkzeug dieselbe Frage stellen: der
 * Seed erdet den Turn vorab, `dokumente_lesen` lässt den Planer nachfassen.
 * Liefen sie über getrennte Filter, könnte das Werkzeug Dokumente sehen, die
 * der Seed nicht abgerufen hat (oder umgekehrt) — und niemandem fiele es auf.
 *
 * Der Grund, dass es diese Datei überhaupt gibt, steht in
 * `contextEnrichmentService.ts` an `SMALL_DOC_VECTORIZATION_THRESHOLD`: oberhalb
 * der Schwelle wird der Anhang vektorisiert und `attachmentContext` genullt.
 * `searchNode` kennt den Abrufweg dafür (Dokument-Chat-Suche), der agentische
 * Loop kannte ihn nicht. Live am 23.08.2026: ein 21.785-Zeichen-PDF, Frage
 * „fasse das pdf zusammen", und der Planer beantwortete sie aus `media` und
 * `find_content` — mit einem fremden Konto-Dokument.
 */
import {
  executeMultiDocFanout,
  type MultiDocFanoutResult,
} from '../../../../agents/langgraph/ChatGraph/nodes/searchNode.js';

import { isLoopRerankEnabled } from './flags.js';

import type {
  ChatGraphState,
  DocumentSource,
  SearchResult,
} from '../../../../agents/langgraph/ChatGraph/types.js';

/**
 * Volltext-Scheibe: wie viel Text ein `abschnitt`-Aufruf ohne eigene Angabe
 * bekommt. Übernommen von Open WebUIs `view_file`
 * (`VIEW_FILE_DEFAULT_MAX_CHARS`) — groß genug, dass ein Kapitel am Stück
 * ankommt, klein genug, dass drei Aufrufe noch in jede Lane passen.
 */
export const ATTACHED_DOCS_TOOL = 'dokumente_lesen';

export const SLICE_DEFAULT_CHARS = 10_000;

/**
 * Was von einer Volltext-Scheibe wirklich beim Modell ankommt: die Kappung in
 * `sourceRegistry.register`. Steht hier statt am Werkzeug, weil sie die
 * Obergrenze der Scheibe BESTIMMT — eine Scheibe, die grösser ist als das, was
 * registriert wird, verliert stillschweigend ihr Ende.
 */
export const SLICE_REGISTER_CHARS = 12_000;

/** Platz für den Wegweiser, der mit im selben Feld steht. */
const SLICE_HINT_RESERVE = 400;

/**
 * Obergrenze je Aufruf, damit ein geratenes `zeichen: 999999` nicht die Lane
 * sprengt — und, wichtiger, damit der Wegweiser nicht lügt.
 *
 * Sie ist vom Registrierungs-Deckel ABGELEITET, nicht frei gewählt. Stand sie
 * darüber (40.000 gegen 12.000), schnitt `applyContextCap` den Rest ab: das
 * Modell bekam 12k Text, läse im Wegweiser aber „Zeichen 0–40000" und
 * übersprünge beim Weiterlesen still 28k.
 */
export const SLICE_MAX_CHARS = SLICE_REGISTER_CHARS - SLICE_HINT_RESERVE;

/**
 * Wie viel von einer PASSAGENSUCHE über die angehängten Dokumente beim Modell
 * ankommt — für den Vorab-Abruf und für `dokumente_lesen` im Suchmodus.
 *
 * Über dem Standardmass von 1500, weil ein angehängtes Dokument kein Suchtreffer
 * unter vielen ist: es ist das, wonach gefragt wurde, und es steht meist allein.
 * 1500 reichen nach dem Anheben des Ausschnitts (`CONTENT_MAX_EXCERPT_LENGTH`)
 * für genau EINEN ganzen Chunk — der Deckel tauschte damit Breite gegen Tiefe,
 * statt beides zu geben. 6000 sind rund vier ganze Chunks.
 *
 * Live am 24.08.2026 ist genau die Breite ausgefallen: die Frage nach den
 * Löschfristen brauchte die Tabelle auf Seite 5 UND den Abschnitt „Allgemeiner
 * Hinweis zur Löschung" auf Seite 4; die Antwort nannte vier Fristen. Der
 * Nenner „von zehn", der hier stand, war falsch gezählt: die Quelle führt ACHT
 * Tabellenzeilen und im Fliesstext davor vier weitere Fristen.
 *
 * Nachgemessen mit 6000 am selben Dokument (Testinstanz, 24.08.2026, 20:27):
 * acht von acht Tabellenzeilen plus alle vier aus dem Fliesstext — und das,
 * obwohl der Deckel 52 % wegschnitt (12 532 → 6000). Beide Stellen kamen durch,
 * weil die verfeinerte Anfrage („Löschfristen", Top-Score 0.813 gegen 0.703 im
 * Zusammenfassungs-Turn) die richtigen Chunks nach oben sortierte, BEVOR
 * gekappt wurde. Die Breite trägt also — aber sie trägt auf der Sortierung.
 * Wer den Deckel senkt, nimmt nicht Zeichen weg, sondern der Rangfolge ihren
 * Spielraum, und der Ausfall sieht dann wieder aus wie ein Modellfehler.
 *
 * Unter der ausdrücklichen Nachlese (`SLICE_REGISTER_CHARS`, 12 000) — die liest
 * das Modell auf Ansage, hier ruft ungefragt der Seed. Drei Anhänge kommen auf
 * 18 000 und bleiben damit im Blockbudget von 38 000 (`sourceRegistry`), das
 * darüber ohnehin klassenbewusst schrumpft.
 */
export const ATTACHED_DOC_SNIPPET_CHARS = 6_000;

/**
 * Welche der normalisierten Dokumentquellen dieses Turns wirklich ein
 * angehängtes Dokument sind.
 *
 * Bewusst enger als `retrievableDocSources` in `searchNode`: dort gehören
 * `notebook`, `wolke` und `connect` dazu, weil der Einzelpfad sie über denselben
 * Fan-out bedient. Im Loop haben die drei ihre eigenen Werkzeuge — sie hier
 * mitzunehmen hieße, jeden Notebook-Turn ungefragt eine zweite Suche zahlen zu
 * lassen.
 */
export function retrievableAttachedSources(state: ChatGraphState): DocumentSource[] {
  return (state.documentSources ?? []).filter(
    (s) => s.kind === 'document' || s.kind === 'document_chat' || s.kind === 'doc_mention'
  );
}

/** Die Abfrage, mit der ohne Zutun des Modells in den Anhängen gesucht wird. */
export function attachedDocsQuery(state: ChatGraphState): string {
  return (state.searchQuery || state.lastUserTextNoMentions || '').trim();
}

/**
 * Fan-out über die angehängten Dokumente. Dünne Hülle um
 * `executeMultiDocFanout` — der Wert liegt darin, dass Seed und Werkzeug
 * garantiert dieselbe Quellenliste und dieselbe Budgetteilung benutzen
 * (`max(3, ⌊12/N⌋)` je Dokument).
 *
 * Anders als Open WebUI (globales `RAG_TOP_K`, Default 3) und LobeHub (flaches
 * `LIMIT topK` über den ganzen Chunk-Pool) kann bei uns keine dichtere Datei die
 * anderen aus dem Ergebnis verdrängen — deshalb geht der Weg über den Fan-out
 * und nicht über eine einzelne Suche mit `documentIds`-Filter.
 */
export async function retrieveAttachedDocuments(
  state: ChatGraphState,
  query: string,
  opts?: { sources?: DocumentSource[] }
): Promise<SearchResult[]> {
  const sources = opts?.sources ?? retrievableAttachedSources(state);
  if (sources.length === 0 || !query) return [];

  // Der einzige Abrufweg im Chat, bei dem nach der Gruppierung keine zweite
  // Rerank-Stufe mehr kommt: der Einzelpfad fährt `rerankNode`, Notebook und
  // Recherche reranken auf Dokumentebene — hier steht danach nur EIN Dokument
  // (siehe `BaseSearchService.groupAndRankHybridResults`), eine zweite Stufe
  // brächte also nichts. Das ist NICHT dasselbe wie „kein Cross-Encoder": der
  // hier gesetzte `rerankChunks` bewertet CHUNKS vor der Gruppierung
  // (`scoreChunksByCrossEncoder`, bis zu 30 je Dokument) und greift, sobald der
  // Aufruf tatsächlich ankommt. Bis 03e297cca4 kam er nicht an — der Validator
  // (`DocumentSearchService.search`) liess `rerankChunks` in den geschachtelten
  // Optionen stillschweigend fallen, seit #2816. Deshalb hinter demselben Flag
  // wie der Loop-Suchpfad: sonst würde dieser Bugfix den Anhang-Pfad
  // unbemerkt vom „nie gemessen" in den vollen Produktionsbetrieb schalten.
  const fanout: MultiDocFanoutResult = await executeMultiDocFanout(
    query,
    sources,
    state.agentConfig,
    { ...(isLoopRerankEnabled() && { rerankChunks: true }) }
  );
  const flat = Object.values(fanout.perSourceResults).flat();
  flat.sort((a, b) => (b.relevance || 0) - (a.relevance || 0));
  return flat;
}

/**
 * Volltext in Scheiben, statt Ähnlichkeitssuche.
 *
 * Der Ausweg für Fragen, die keine brauchbare Suchanfrage hergeben. Beide
 * Referenzimplementierungen haben ihn und brauchen ihn: Open WebUIs `view_file`
 * (`offset`/`max_chars`) und LobeHubs `readKnowledge` (Volltext ohne
 * Chunk-Limit). Eine Ähnlichkeitssuche nach „fasse zusammen" trifft sonst nur
 * zufällige Passagen.
 *
 * Für „fasse zusammen" ist trotzdem `summarize` der richtige Weg — das ist
 * Map-Reduce über den ganzen Text, nicht dessen erste Scheibe.
 */
export async function readAttachedDocumentSlice(
  state: ChatGraphState,
  sources: DocumentSource[],
  opts: { from: number; chars?: number }
): Promise<SearchResult[]> {
  const userId = state.agentConfig.userId;
  if (sources.length === 0 || !userId) return [];

  const from = Math.max(0, Math.floor(opts.from));
  const chars = Math.min(
    SLICE_MAX_CHARS,
    Math.max(1, Math.floor(opts.chars ?? SLICE_DEFAULT_CHARS))
  );

  const { getQdrantDocumentService } =
    await import('../../../../services/document-services/DocumentSearchService/index.js');
  const bulk = await getQdrantDocumentService().getMultipleDocumentsFullText(
    userId,
    sources.map((s) => s.id)
  );

  const labelById = new Map(sources.map((s) => [s.id, s.label] as const));
  const results: SearchResult[] = [];
  for (const doc of bulk.documents) {
    const text = doc.fullText ?? '';
    if (!text) continue;
    const slice = text.slice(from, from + chars);
    if (!slice) continue;
    const end = from + slice.length;
    // Der Wegweiser ist der einzige Weg, auf dem das Modell erfährt, dass noch
    // etwas kommt — ohne ihn liest es eine Scheibe und hält sie für das Ganze.
    //
    // Er steht VORN, nicht hinten: gekappt wird immer der Schwanz (in
    // `applyContextCap` und in der gemeinsamen Schrumpfung von `renderAll`,
    // sobald mehrere Quellen um dasselbe Budget konkurrieren). Am Ende wäre er
    // genau in den Fällen weg, für die er gebaut ist.
    const marker =
      end < text.length
        ? `[Zeichen ${from}–${end} von ${text.length} — weiter mit abschnitt.von=${end}]`
        : `[Zeichen ${from}–${end} von ${text.length} — Ende des Dokuments]`;
    results.push({
      source: `documentchat:${doc.id}`,
      title: labelById.get(doc.id) ?? 'Dokument',
      content: `${marker}\n\n${slice}`,
      relevance: 1,
      documentSourceId: doc.id,
    });
  }
  return results;
}
