/**
 * Die Quellen eines SYSTEM-Notebooks (Grundsatzprogramm, Landesverbände,
 * Bundestagsfraktion, gruene.de, Österreich …) — die zweite, nur lesende Naht
 * unter `notebook_quellen`, neben `notebookSources.ts` für eigene Notebooks.
 *
 * Unterschiede zu eigenen Notebooks:
 * - Eine Sammlung heißt über ihren Schlüssel (`deutschland`, `hamburg`, …),
 *   nicht über eine UUID. Erlaubt ist nur, was `collectionsForLocale` diesem
 *   Turn zugesteht — dieselbe Menge wie bei `gruenerator_search`; der
 *   Aufrufer reicht sie als `allowedKeys` herein.
 * - Eine Quelle ist ein Dokument = alle Punkte mit derselben `source_url`.
 *   Es gibt keine `documents`-Zeile und keine `document_id`.
 * - Kein Zugriffsschutz über die Sammlung hinaus: System-Sammlungen sind für
 *   alle Angemeldeten lesbar. Die Invariante ist deshalb eine andere (siehe
 *   `readSystemSourceText`): eine URL gilt nur, wenn sie UNTER DEM
 *   STANDARDFILTER der Sammlung Punkte hat — die Landesverbände teilen sich
 *   eine Qdrant-Sammlung und unterscheiden sich nur darin.
 */
import { resolveNotebookCollections } from '../../config/notebookCollectionMap.js';
import {
  applyDefaultFilter,
  getCanonicalByKey,
  getSearchParams,
  getSystemCollectionConfig,
} from '../../config/systemCollectionsConfig.js';
import { applyCountCap } from '../../utils/contextCap.js';
import { createLogger } from '../../utils/logger.js';

import {
  chunksOrThrow,
  compareRows,
  DESC_BY_DEFAULT,
  FIND_MAX_LIMIT,
  locateInJoined,
  locateInOriginal,
  outlineSource,
  type ChunkLocator,
  type FindMode,
  type NotebookSourceRow,
  type OutlineEntry,
  type Passage,
  type SortOrder,
  type SourceSortBy,
} from './notebookSources.js';
import { type rerankNotebookResults } from './rerankNotebookResults.js';
import {
  incompleteReason,
  readScanSources,
  SCAN_CHAR_BUDGET,
  type ScanLoad,
  type ScannedSource,
} from './sourceGrep.js';

import type { QdrantFilter } from '../../database/services/QdrantService/types.js';
import type { DocumentResult } from '../BaseSearchService/types.js';
import type { DocumentSearchService } from '../document-services/DocumentSearchService/DocumentSearchService.js';
import type { DocumentChunkItem } from '../document-services/DocumentSearchService/types.js';
import type { ExpandedChunkResult } from '../search/types.js';

/** Derselbe Kanal wie `applyCountCap` — ein Deckel, der greift, steht im Log. */
const capLog = createLogger('ContextCap');

/** Höchstens so viele Chunk-0-Punkte scrollt `list` — Landesverbände haben ~12 400. */
export const SYSTEM_LIST_SCROLL_MAX = 5000;
const SCROLL_PAGE = 500;
/**
 * Ab so vielen Quellen liest ein Scan über die ganze Sammlung nicht mehr
 * alles. Anders als bei eigenen Notebooks ist die Textmenge vorher unbekannt
 * (kein `length(markdown_content)`), und jede Quelle kostet zwei bis drei
 * Qdrant-Scrolls — die Quellenzahl ist hier die Größenangabe, die das
 * Zeichenbudget allein nicht ersetzt: ohne sie läse ein Landesverband erst
 * Hunderte Dokumente, bevor das Budget greift, und die Frist des Werkzeugs
 * (45 s) liefe vorher ab.
 */
export const SYSTEM_SCAN_MAX_SOURCES = 200;
const PREFILTER_LIMIT = 20;
const LIST_DEFAULT_LIMIT = 20;
const LIST_MAX_LIMIT = 50;

/** Nur das, was `list` zeigt — nie `full_text` oder `chunk_text`. */
const LIST_PAYLOAD = [
  'source_url',
  'title',
  'published_at',
  'primary_category',
  'content_type',
] as const;

export const SOURCE_NOT_FOUND =
  'Quelle nicht in diesem System-Notebook — die sourceId ist die URL aus list (Feld ref).';
export const NOT_A_URL =
  'Bei System-Notebooks ist die sourceId die URL der Quelle (aus list, Feld ref).';
/** Der Fehlertext von `getSystemDocumentFullTextByUrl`, wenn die URL unter dem Filter nichts hat. */
const DOCUMENT_NOT_FOUND = 'Document not found';

export const SYSTEM_READ_ONLY = 'System-Notebooks sind schreibgeschützt.';

export interface SystemCollection {
  /** Chat-Schlüssel, z. B. `hamburg` — wird `collectionId` der Belege. */
  key: string;
  /** `…-system`-Id — Schlüssel für Standardfilter und Suchparameter. */
  systemId: string;
  name: string;
  qdrantCollection: string;
}

export interface SystemNotebookSourcesDeps {
  /** Eine Scroll-Seite samt Folge-Offset (`scrollDocuments` liefert ihn nicht). */
  scrollPage: (
    qdrantCollection: string,
    filter: QdrantFilter,
    opts: { limit: number; offset: string | number | null; payload: readonly string[] }
  ) => Promise<{
    points: Array<{ payload: Record<string, unknown> }>;
    nextOffset: string | number | null;
  }>;
  documentService: Pick<
    DocumentSearchService,
    'getSystemDocumentFullTextByUrl' | 'getDocumentChunks' | 'search'
  >;
  rerank: typeof rerankNotebookResults;
  /**
   * Die Parameter des Volltextindex auf `chunk_text` (`payload_schema`) —
   * `null` ohne Index. Nur mit genau dem geprüften Index zählt grep über ihn.
   */
  chunkTextIndex: (qdrantCollection: string) => Promise<Record<string, unknown> | null>;
}

// ---------------------------------------------------------------------------
// Sammlung
// ---------------------------------------------------------------------------

/** Die Schlüssel, für die eine id steht: Schlüssel, System-Id oder Notebook-Slug. */
function candidateKeys(id: string): string[] | null {
  if (getCanonicalByKey(id)) return [id];
  const config = getSystemCollectionConfig(id);
  if (config) return [config.key];
  const mapped = resolveNotebookCollections([id]);
  return mapped.length ? mapped : null;
}

/**
 * Die System-Sammlung hinter `id` — oder `null`, wenn `id` keine ist (dann
 * ist es ein eigenes Notebook). `allowedKeys` ist `collectionsForLocale` des
 * Turns: ein Schlüssel außerhalb ist ein Fehler, genau wie bei
 * `gruenerator_search`. Nie auf den Rückfall von `executeDirectSearch`
 * (`deutschland` für Unbekanntes) verlassen — deshalb wird hier geprüft.
 */
export function resolveSystemCollection(
  id: string,
  allowedKeys: readonly string[]
): { collection: SystemCollection } | { error: string } | null {
  const keys = candidateKeys(id);
  if (!keys) return null;
  const allowed = keys.filter((k) => allowedKeys.includes(k));
  if (allowed.length === 0) {
    return {
      error: `Das System-Notebook „${id}" steht hier nicht zur Verfügung — verfügbar sind: ${allowedKeys.join(', ')}.`,
    };
  }
  if (allowed.length > 1) {
    return {
      error: `Dieses System-Notebook umfasst mehrere Sammlungen — gib notebookId als eine davon an: ${allowed.join(', ')}.`,
    };
  }
  const config = getCanonicalByKey(allowed[0]!);
  if (!config) return null;
  return {
    collection: {
      key: config.key,
      systemId: config.id,
      name: config.name,
      qdrantCollection: config.qdrantCollection,
    },
  };
}

// ---------------------------------------------------------------------------
// Liste
// ---------------------------------------------------------------------------

export interface SystemSourceFilter {
  /** `primary_category` oder `content_type`, ohne Groß/klein. */
  category?: string | undefined;
  titleContains?: string | undefined;
  /** `YYYY-MM-DD`, einschließlich. */
  dateFrom?: string | undefined;
  dateTo?: string | undefined;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

function toRow(payload: Record<string, unknown>, url: string): NotebookSourceRow {
  return {
    id: url,
    title: str(payload.title) ?? url,
    sourceType: str(payload.primary_category) ?? str(payload.content_type),
    documentType: str(payload.content_type),
    sourceUrl: url,
    pages: null,
    sizeBytes: null,
    words: null,
    wordsEstimated: false,
    chars: null,
    status: null,
    createdAt: str(payload.published_at),
    docDate: null,
    docDateKind: null,
    gremium: null,
    tags: [],
  };
}

/**
 * Alle Quellen der Sammlung über die Chunk-0-Punkte, seitenweise, höchstens
 * `SYSTEM_LIST_SCROLL_MAX`. `exhaustive: false`, wenn danach noch eine Seite
 * wartete.
 */
async function scrollSystemSources(
  collection: SystemCollection,
  deps: Pick<SystemNotebookSourcesDeps, 'scrollPage'>
): Promise<{ rows: NotebookSourceRow[]; exhaustive: boolean }> {
  const filter = applyDefaultFilter(collection.systemId, {
    must: [{ key: 'chunk_index', match: { value: 0 } }],
  }) as QdrantFilter;
  const byUrl = new Map<string, NotebookSourceRow>();
  let scrolled = 0;
  let offset: string | number | null = null;
  let more = true;
  while (more && scrolled < SYSTEM_LIST_SCROLL_MAX) {
    const page = await deps.scrollPage(collection.qdrantCollection, filter, {
      limit: Math.min(SCROLL_PAGE, SYSTEM_LIST_SCROLL_MAX - scrolled),
      offset,
      payload: LIST_PAYLOAD,
    });
    scrolled += page.points.length;
    for (const p of page.points) {
      const url = str(p.payload.source_url);
      if (url && !byUrl.has(url)) byUrl.set(url, toRow(p.payload, url));
    }
    offset = page.nextOffset;
    more = offset !== null && page.points.length > 0;
  }
  if (more) {
    // Kein Array zum Kürzen: der Scroll hört vor dem Rest auf. Dieselbe
    // Zeile wie `applyCountCap`, damit die Log-Suche nach „count cap hit" sie findet.
    capLog.warn(
      `[notebook_quellen:system-list] count cap hit: >${SYSTEM_LIST_SCROLL_MAX} → ${SYSTEM_LIST_SCROLL_MAX} items (rest not scrolled, ${collection.key})`
    );
  }
  return { rows: [...byUrl.values()], exhaustive: !more };
}

function matchesSystemFilter(row: NotebookSourceRow, f: SystemSourceFilter | undefined): boolean {
  if (!f) return true;
  const lower = (s: string) => s.toLocaleLowerCase('de');
  if (
    f.category &&
    ![row.sourceType, row.documentType].some((v) => v && lower(v) === lower(f.category!))
  ) {
    return false;
  }
  if (f.titleContains && !lower(row.title).includes(lower(f.titleContains))) return false;
  const day = row.createdAt?.slice(0, 10) ?? null;
  if ((f.dateFrom || f.dateTo) && !day) return false;
  if (f.dateFrom && day! < f.dateFrom) return false;
  if (f.dateTo && day! > f.dateTo) return false;
  return true;
}

/**
 * Wie viele Quellen ein Datumsbereich still ausschließt, weil sie kein
 * `published_at` tragen — gezählt nur unter denen, die die übrigen
 * Filterfelder behalten hätten. Berlin: 326 von 1.547 Quellen (23.09.2026).
 */
function countUndatedExcluded(
  rows: readonly NotebookSourceRow[],
  f: SystemSourceFilter | undefined
): number {
  if (!f?.dateFrom && !f?.dateTo) return 0;
  const withoutDate = { ...f, dateFrom: undefined, dateTo: undefined };
  return rows.filter((r) => !r.createdAt && matchesSystemFilter(r, withoutDate)).length;
}

export const hasSystemFilter = (f: SystemSourceFilter | undefined): boolean =>
  Boolean(f && (f.category || f.titleContains || f.dateFrom || f.dateTo));

/** Wie viele Quellen je Kategorie — damit das Modell `filter.category` nicht raten muss. */
function countCategories(rows: readonly NotebookSourceRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    if (r.sourceType) out[r.sourceType] = (out[r.sourceType] ?? 0) + 1;
  }
  return out;
}

export async function listSystemSources(
  input: {
    collection: SystemCollection;
    sortBy?: SourceSortBy | undefined;
    order?: SortOrder | undefined;
    filter?: SystemSourceFilter | undefined;
    offset?: number | undefined;
    limit?: number | undefined;
  },
  deps: Pick<SystemNotebookSourcesDeps, 'scrollPage'>
): Promise<{
  total: number;
  items: NotebookSourceRow[];
  exhaustive: boolean;
  categories: Record<string, number>;
  /** Quellen ohne Datum, die `filter.dateFrom/dateTo` ausgeschlossen hat. */
  undatedExcluded: number;
}> {
  const { rows, exhaustive } = await scrollSystemSources(input.collection, deps);
  const sortBy = input.sortBy ?? 'date';
  const order = input.order ?? (DESC_BY_DEFAULT.has(sortBy) ? 'desc' : 'asc');
  const filtered = rows
    .filter((r) => matchesSystemFilter(r, input.filter))
    .sort(compareRows(sortBy, order));
  const offset = Math.max(0, Math.floor(input.offset ?? 0));
  const limit = Math.min(
    LIST_MAX_LIMIT,
    Math.max(1, Math.floor(input.limit ?? LIST_DEFAULT_LIMIT))
  );
  return {
    total: filtered.length,
    items: filtered.slice(offset, offset + limit),
    exhaustive,
    categories: countCategories(rows),
    undatedExcluded: countUndatedExcluded(rows, input.filter),
  };
}

/**
 * Die URLs, die zu `filter` passen — für `find`, `rank` und die Scans. Aus
 * derselben Liste wie `list`, damit alle Aktionen dieselbe Filterregel haben
 * (Titel ohne Groß/klein, Kategorie über `primary_category` ODER
 * `content_type`, Datum als Tag); ein nativer Qdrant-Filter gälte nur dort,
 * wo die Sammlung die Felder indiziert. Die Menge geht als `source_url`-`any`
 * in den Suchfilter, filtert also VOR dem Limit statt danach.
 */
export async function filterSystemSourceUrls(
  input: { collection: SystemCollection; filter: SystemSourceFilter },
  deps: Pick<SystemNotebookSourcesDeps, 'scrollPage'>
): Promise<{ urls: string[]; exhaustive: boolean; undatedExcluded: number }> {
  const { rows, exhaustive } = await scrollSystemSources(input.collection, deps);
  return {
    urls: rows.filter((r) => matchesSystemFilter(r, input.filter)).map((r) => r.id),
    exhaustive,
    undatedExcluded: countUndatedExcluded(rows, input.filter),
  };
}

const SUGGEST_MAX = 5;
const SUGGEST_MIN_WORD = 4;

/** Die Wörter einer geratenen sourceId: bei einer URL der letzte Pfadteil. */
function guessWords(sourceId: string): string[] {
  let text = sourceId;
  if (isUrl(sourceId)) {
    try {
      const segments = new URL(sourceId).pathname.split('/').filter(Boolean);
      text = segments[segments.length - 1] ?? '';
    } catch {
      text = '';
    }
  }
  return [
    ...new Set(
      text
        .toLocaleLowerCase('de')
        .split(/[^\p{L}]+/u)
        .filter((w) => w.length >= SUGGEST_MIN_WORD)
    ),
  ];
}

/**
 * Quellen, die eine nicht gefundene sourceId gemeint haben könnte — nach
 * Wörtern im Titel. Ein Modell, das eine URL rät, bekommt so die echten
 * `ref`s zurück, statt beim nächsten Versuch wieder zu raten.
 */
export async function suggestSystemSources(
  input: { collection: SystemCollection; sourceId: string },
  deps: Pick<SystemNotebookSourcesDeps, 'scrollPage'>
): Promise<Array<{ title: string; ref: string; date: string | null }>> {
  const words = guessWords(input.sourceId);
  if (words.length === 0) return [];
  const { rows } = await scrollSystemSources(input.collection, deps);
  return rows
    .map((r) => {
      const title = r.title.toLocaleLowerCase('de');
      return { r, hits: words.filter((w) => title.includes(w)).length };
    })
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits || (b.r.createdAt ?? '').localeCompare(a.r.createdAt ?? ''))
    .slice(0, SUGGEST_MAX)
    .map(({ r }) => ({ title: r.title, ref: r.id, date: r.createdAt?.slice(0, 10) ?? null }));
}

// ---------------------------------------------------------------------------
// Lesen
// ---------------------------------------------------------------------------

export interface SystemSourceText {
  title: string;
  text: string;
  origin: 'full_text' | 'chunks';
  chunkMap: ChunkLocator[];
  chunks: DocumentChunkItem[];
}

const isUrl = (s: string): boolean => /^https?:\/\//.test(s);

/**
 * Text einer System-Quelle. DIE Zugehörigkeitsregel, und ihre Reihenfolge
 * ist die Invariante:
 *
 * 1. ZUERST `getSystemDocumentFullTextByUrl(qdrantCollection, url,
 *    Standardfilter)`. Sie wendet den Standardfilter der Sammlung an — hat die
 *    URL darunter keine Punkte, liegt sie nicht in diesem Notebook (Fehler,
 *    kein Lesen).
 * 2. ERST DANN `getDocumentChunks(…, {qdrantCollection})`. Die Identität ist
 *    dort `source_url` (`documentIdentityClause`), aber OHNE Standardfilter —
 *    allein aufgerufen läse sie eine Berliner URL auch über das
 *    Hamburg-Notebook, weil beide in `landesverbaende_documents` liegen.
 */
export async function readSystemSourceText(
  input: { collection: SystemCollection; sourceUrl: string },
  deps: Pick<SystemNotebookSourcesDeps, 'documentService'>
): Promise<SystemSourceText | { error: string }> {
  const { collection, sourceUrl } = input;
  if (!isUrl(sourceUrl)) return { error: NOT_A_URL };
  const full = await deps.documentService.getSystemDocumentFullTextByUrl(
    collection.qdrantCollection,
    sourceUrl,
    applyDefaultFilter(collection.systemId)
  );
  if (!full.success) {
    if (full.error === DOCUMENT_NOT_FOUND) return { error: SOURCE_NOT_FOUND };
    throw new Error(`getSystemDocumentFullTextByUrl failed: ${full.error ?? 'unknown error'}`);
  }
  const chunks = chunksOrThrow(
    await deps.documentService.getDocumentChunks('system', sourceUrl, {
      qdrantCollection: collection.qdrantCollection,
    })
  );
  const joined = chunks.map((c) => c.text).join('\n\n');
  const title = full.title || '(ohne Titel)';
  // `full_text` liegt nur auf manchen Chunk-0-Punkten; sonst IST der Text die
  // Verkettung der Chunks, und deren Offsets gelten. Ob er aus der Nutzlast
  // kam, sagt nur `chunkCount === 1` (Schritt 1 dort) — der Rückfall (Schritt
  // 2) scrollt ungeblättert höchstens 500 Chunks und wäre bei längeren
  // Dokumenten ein abgeschnittener Text; dann gilt die geblätterte Verkettung.
  // Kein Längenvergleich: überlappende Chunks machen `joined` auch bei echtem
  // `full_text` länger.
  const fromPayload = full.chunkCount === 1 && full.fullText !== joined;
  if (full.fullText && fromPayload) {
    return {
      title,
      text: full.fullText,
      origin: 'full_text',
      chunkMap: locateInOriginal(full.fullText, chunks),
      chunks,
    };
  }
  return { title, text: joined, origin: 'chunks', chunkMap: locateInJoined(chunks), chunks };
}

/**
 * Die Zugehörigkeitsprüfung ohne Lesen — ein Chunk-0-Punkt mit der URL UNTER
 * dem Standardfilter der Sammlung. Für `find`/`cite claim` mit sourceId, die
 * den Text nicht brauchen; dieselbe Regel wie Schritt 1 von `readSystemSourceText`.
 */
export async function checkSystemSource(
  input: { collection: SystemCollection; sourceUrl: string },
  deps: Pick<SystemNotebookSourcesDeps, 'scrollPage'>
): Promise<{ error: string } | null> {
  if (!isUrl(input.sourceUrl)) return { error: NOT_A_URL };
  const filter = applyDefaultFilter(input.collection.systemId, {
    must: [
      { key: 'source_url', match: { value: input.sourceUrl } },
      { key: 'chunk_index', match: { value: 0 } },
    ],
  }) as QdrantFilter;
  const page = await deps.scrollPage(input.collection.qdrantCollection, filter, {
    limit: 1,
    offset: null,
    payload: ['source_url'],
  });
  return page.points.length ? null : { error: SOURCE_NOT_FOUND };
}

/**
 * Gliederung: aus `section_index`/`heading_path`, wo die Chunks sie tragen;
 * sonst nach Seiten (`Seite N`). Ohne beides leer.
 */
export function outlineSystemSource(chunks: readonly DocumentChunkItem[]): OutlineEntry[] {
  const structured = chunks.some(
    (c) => typeof c.sectionIndex === 'number' || (c.headingPath?.length ?? 0) > 0
  );
  if (structured) return outlineSource(chunks);
  const out: OutlineEntry[] = [];
  for (const c of chunks) {
    const page = c.pageNumber ?? null;
    if (page === null) continue;
    const last = out[out.length - 1];
    if (last && last.pageFrom === page) {
      last.chunkTo = c.index;
      last.chars += c.text.length;
      continue;
    }
    out.push({
      sectionIndex: null,
      headingPath: [],
      heading: `Seite ${page}`,
      chunkFrom: c.index,
      chunkTo: c.index,
      pageFrom: page,
      pageTo: page,
      chars: c.text.length,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Suche
// ---------------------------------------------------------------------------

/**
 * Die Dokumentsuche über eine System-Sammlung — mit denselben Parametern wie
 * `executeDirectSearch` (Gewichte, Schwelle, Recall, Qualität aus
 * `getSearchParams`), aber mit `top_chunks` samt Seite und Zeichenbereich und
 * optional auf EINE URL eingeschränkt. `executeDirectSearch` selbst kann
 * beides nicht (kein `source_url`-Filter, ein Auszug je Dokument).
 */
export async function searchSystemDocuments(
  input: {
    collection: SystemCollection;
    query: string;
    sourceUrl?: string | undefined;
    /** Nur diese URLs (aus `filterSystemSourceUrls`) — neben `sourceUrl` nicht nötig. */
    sourceUrls?: readonly string[] | undefined;
    mode: FindMode;
    limit: number;
  },
  deps: Pick<SystemNotebookSourcesDeps, 'documentService'>
): Promise<DocumentResult[]> {
  const { collection } = input;
  const params = getSearchParams(collection.systemId);
  const scope = input.sourceUrl
    ? { key: 'source_url', match: { value: input.sourceUrl } }
    : input.sourceUrls
      ? { key: 'source_url', match: { any: [...input.sourceUrls] } }
      : null;
  const additionalFilter = applyDefaultFilter(
    collection.systemId,
    scope ? { must: [scope] } : undefined
  );
  const resp = await deps.documentService.search({
    query: input.query,
    userId: undefined,
    options: {
      limit: input.limit,
      mode: input.mode,
      vectorWeight: params.vectorWeight,
      textWeight: params.textWeight,
      threshold: params.threshold,
      searchCollection: collection.qdrantCollection,
      recallLimit: params.recallLimit,
      qualityMin: params.qualityMin,
      ...(additionalFilter ? { additionalFilter } : {}),
    },
  });
  // Ein Ausfall kommt als `success:false` mit leeren Treffern — ungeprüft
  // läse er sich als „steht nicht im Notebook".
  if (!resp.success) {
    throw new Error(`system search failed: ${resp.error ?? resp.message ?? 'unknown error'}`);
  }
  return resp.results ?? [];
}

const passageKey = (p: { sourceId: string; chunkIndex: number }): string =>
  `${p.sourceId}:${p.chunkIndex}`;

export async function findSystemPassages(
  input: {
    collection: SystemCollection;
    query: string;
    sourceUrl?: string | undefined;
    sourceUrls?: readonly string[] | undefined;
    mode: FindMode;
    limit: number;
    rerank: boolean;
  },
  deps: Pick<SystemNotebookSourcesDeps, 'documentService' | 'rerank'>
): Promise<{ passages: Passage[]; reranked: boolean }> {
  const limit = Math.min(FIND_MAX_LIMIT, Math.max(1, Math.floor(input.limit)));
  const docs = await searchSystemDocuments({ ...input, limit: limit * 3 }, deps);
  const flat = docs
    .flatMap((doc) =>
      (doc.top_chunks ?? []).map((tc): Passage => ({
        sourceId: doc.source_url || doc.document_id,
        title: doc.title || '(ohne Titel)',
        chunkIndex: tc.chunk_index,
        pageNumber: tc.page_number ?? null,
        charStart: tc.char_start ?? null,
        charEnd: tc.char_end ?? null,
        score: doc.similarity_score,
        hasTerm: tc.has_term === true,
        text: tc.text ?? tc.preview,
      }))
    )
    .filter((p) => p.text.trim().length > 0)
    .sort((a, b) => b.score - a.score);

  if (!input.rerank || flat.length <= 3) {
    return { passages: flat.slice(0, limit), reranked: false };
  }
  const candidates: ExpandedChunkResult[] = flat.slice(0, FIND_MAX_LIMIT).map((p) => ({
    document_id: p.sourceId,
    source_url: p.sourceId,
    title: p.title,
    snippet: p.text.slice(0, 300),
    chunk_text: p.text,
    filename: null,
    similarity: p.score,
    chunk_index: p.chunkIndex,
    page_number: p.pageNumber,
  }));
  const byKey = new Map(flat.map((p) => [passageKey(p), p]));
  const ranked = await deps.rerank({
    results: candidates,
    referencesMap: {},
    question: input.query,
    limit,
    inputLimit: candidates.length,
    mode: 'sort',
  });
  const passages = ranked.results.flatMap((r) => {
    const p = byKey.get(passageKey({ sourceId: r.document_id, chunkIndex: r.chunk_index }));
    return p ? [{ ...p, score: r.similarity }] : [];
  });
  return { passages: passages.slice(0, limit), reranked: true };
}

// ---------------------------------------------------------------------------
// Scan (grep, stats, rank, cite)
// ---------------------------------------------------------------------------

/**
 * Die Texte zum Durchzählen — dasselbe Budget und dieselbe `exhaustive`-Regel
 * wie `loadScanTexts`. Über die ganze Sammlung: jenseits von
 * `SYSTEM_SCAN_MAX_SOURCES` Quellen nur die Kandidaten einer Textsuche (mit
 * `prefilterQuery`) bzw. die ersten `SYSTEM_SCAN_MAX_SOURCES`.
 */
export async function loadSystemScanTexts(
  input: {
    collection: SystemCollection;
    sourceUrl?: string | undefined;
    /** Grenzt die Sammlung vor dem Lesen ein — ein enger Filter macht den Scan vollständig. */
    filter?: SystemSourceFilter | undefined;
    prefilterQuery?: string | undefined;
    charBudget?: number | undefined;
  },
  deps: SystemNotebookSourcesDeps
): Promise<(ScanLoad & { undatedExcluded: number }) | { error: string }> {
  const { collection } = input;
  const budget = input.charBudget ?? SCAN_CHAR_BUDGET;
  let tooLarge = false;
  let undatedExcluded = 0;
  let ids: string[];

  if (input.sourceUrl) {
    ids = [input.sourceUrl];
  } else {
    const listed = await scrollSystemSources(collection, deps);
    tooLarge = !listed.exhaustive;
    undatedExcluded = countUndatedExcluded(listed.rows, input.filter);
    ids = listed.rows.filter((r) => matchesSystemFilter(r, input.filter)).map((r) => r.id);
    if (ids.length === 0) {
      const reason = incompleteReason(tooLarge, 0, false);
      return {
        sources: [],
        exhaustive: reason === null,
        incompleteReason: reason,
        undatedExcluded,
      };
    }
    if (ids.length > SYSTEM_SCAN_MAX_SOURCES) {
      tooLarge = true;
      if (input.prefilterQuery) {
        const { passages } = await findSystemPassages(
          {
            collection,
            query: input.prefilterQuery,
            ...(hasSystemFilter(input.filter) ? { sourceUrls: ids } : {}),
            mode: 'text',
            limit: PREFILTER_LIMIT,
            rerank: false,
          },
          deps
        );
        const candidates = [...new Set(passages.map((p) => p.sourceId))];
        const rest = ids.filter((id) => !candidates.includes(id));
        // Der Rest wird nur angehängt, damit die Log-Zeile des Deckels die Gesamtzahl nennt.
        ids = applyCountCap(
          [...candidates, ...rest],
          candidates.length,
          'notebook_quellen:system-scan-prefilter'
        );
      } else {
        ids = applyCountCap(ids, SYSTEM_SCAN_MAX_SOURCES, 'notebook_quellen:system-scan');
      }
    }
  }

  const read = await readScanSources(
    ids,
    async (sourceUrl) => {
      const loaded = await readSystemSourceText({ collection, sourceUrl }, deps);
      if ('error' in loaded) return loaded;
      return { title: loaded.title, text: loaded.text, chunkMap: loaded.chunkMap };
    },
    { budget, explicit: Boolean(input.sourceUrl) }
  );
  if ('error' in read) return read;
  const reason = incompleteReason(
    tooLarge || read.tooLarge,
    read.unreadable,
    Boolean(input.sourceUrl)
  );
  return {
    sources: read.sources,
    exhaustive: reason === null,
    incompleteReason: reason,
    undatedExcluded,
  };
}

// ---------------------------------------------------------------------------
// Volltextindex (grep, rank by=term)
// ---------------------------------------------------------------------------

/**
 * Höchstens so viele Punkte liest die Volltextsuche je Aufruf. „Klimaschutz"
 * trifft in Berlin 405 von 7.251 Punkten (23.09.2026); erst ein Allerweltswort
 * über eine ganze Bundessammlung erreicht den Deckel.
 */
export const SYSTEM_TEXT_MATCH_MAX_POINTS = 5000;
const TEXT_MATCH_PAYLOAD = [
  'source_url',
  'title',
  'chunk_index',
  'chunk_text',
  'char_start',
  'char_end',
  'page_number',
] as const;
/**
 * Kürzer ist eine gemeinsame Kante zweier Nachbar-Chunks Zufall („…n" / „n…").
 * Gemessen in Berlin (23.09.2026): 5.051 von 5.704 Nachbarpaaren überlappen,
 * meist um 100–400 Zeichen; von den 653 übrigen teilen 31 eine zufällige
 * Kante von 1–16 Zeichen. `char_start`/`char_end` tragen nur 40 von 7.251
 * Punkten — dort gilt ihre Überlappung (bei allen 40: keine).
 */
const MIN_CHUNK_OVERLAP = 20;

/**
 * Hat ein Text für den `chunk_text`-Index (`tokenizer: word`,
 * `min_token_len: 2`, `max_token_len: 50`, `lowercase`) ein Wort? Eine
 * Anfrage ohne eines trifft in Qdrant NICHTS (gemessen: `match.text: "a"` →
 * 0 Punkte) — sie darf deshalb nie als Bedingung in den Filter.
 */
function hasIndexToken(text: string): boolean {
  return text
    .split(/[^\p{L}\p{N}]+/u)
    .some((t) => [...t].length >= 2 && Buffer.byteLength(t) <= 50);
}

const SUBSCRIPT_DIGITS = '₀₁₂₃₄₅₆₇₈₉';
const SUPERSCRIPT_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹';

const bare = (s: string): string =>
  s.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC').toLowerCase();

/**
 * Die Schreibweisen eines Worts, die gezählt werden, und die Anfragen, die sie
 * im Index finden. Gezählt wird das Wort so, wie es dasteht, oder ganz ohne
 * Akzente („Klimaneutralitat"), Ziffern auch tief- oder hochgestellt („CO₂") —
 * Groß/klein egal. Der Index faltet nur Groß/klein: jede weitere Faltung des
 * Zählers („Charite" trifft „Charité") fände er nicht, und die Zahl wäre still
 * eine Untergrenze. Alle Formen gehen auch zerlegt (NFD) in die Anfrage: die
 * Berliner Sammlung hat 28 Chunks mit zerlegten Umlauten, die eine NFC-Anfrage
 * nicht trifft.
 */
function wordForms(word: string): { accepted: Set<string>; queries: string[] } {
  const plain = bare(word).normalize('NFKC');
  const accepted = new Set([word.normalize('NFC').toLowerCase(), bare(word), plain]);
  // Der Zähler faltet „CO₂" zu „co2" (NFKD je Zeichen); der Index kennt „co₂"
  // als eigenes Token. Berlin: 29 Chunks mit „CO₂", die „CO2" sonst nicht fände.
  if (/\d/.test(plain)) {
    accepted.add(plain.replace(/\d/g, (d) => SUBSCRIPT_DIGITS[Number(d)]!));
    accepted.add(plain.replace(/\d/g, (d) => SUPERSCRIPT_DIGITS[Number(d)]!));
  }
  const queries = [...accepted].flatMap((w) => [w, w.normalize('NFD')]);
  return { accepted, queries: [...new Set(queries)].filter(hasIndexToken) };
}

/** Wie viele Zeichen Chunk `b` am Anfang mit dem Ende von Chunk `a` teilt. */
function chunkOverlap(a: TermChunk, b: TermChunk): number {
  if (a.charEnd !== null && b.charStart !== null) {
    return Math.min(b.text.length, Math.max(0, a.charEnd - b.charStart));
  }
  if (b.text.length < MIN_CHUNK_OVERLAP) return 0;
  const probe = b.text.slice(0, MIN_CHUNK_OVERLAP);
  // Die früheste Fundstelle, deren Rest `b` anfängt, ist die längste Überlappung.
  for (
    let i = a.text.indexOf(probe, Math.max(0, a.text.length - b.text.length));
    i !== -1;
    i = a.text.indexOf(probe, i + 1)
  ) {
    if (b.text.startsWith(a.text.slice(i))) return a.text.length - i;
  }
  return 0;
}

interface TermChunk {
  index: number;
  text: string;
  charStart: number | null;
  charEnd: number | null;
  pageNumber: number | null;
}

const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);

/**
 * Die gefundenen Chunks einer Quelle als EIN Text: Nachbar-Chunks ohne ihre
 * Überlappung, sonst durch eine Leerzeile getrennt. Ohne das zählte jeder
 * Treffer in einer Überlappung doppelt.
 */
function joinTermChunks(chunks: readonly TermChunk[]): Omit<ScannedSource, 'sourceId' | 'title'> {
  let text = '';
  const chunkMap: ChunkLocator[] = [];
  let prev: TermChunk | null = null;
  for (const c of chunks) {
    const overlap = prev && c.index === prev.index + 1 ? chunkOverlap(prev, c) : 0;
    if (prev && overlap === 0) text += '\n\n';
    const charStart = text.length;
    text += c.text.slice(overlap);
    chunkMap.push({ index: c.index, charStart, charEnd: text.length, pageNumber: c.pageNumber });
    prev = c;
  }
  return { text, chunkMap };
}

/**
 * Der Index, gegen den die Vollständigkeit geprüft ist (live, 23.09.2026, alle
 * System-Sammlungen hinter `collectionsForLocale` für de-DE und de-AT). Ein
 * anderer Tokenizer, ohne `lowercase`, mit Stemmer oder Stoppwörtern fände
 * andere Chunks; ohne Index fiele Qdrant auf einen Teilstring-Vergleich
 * zurück. In beiden Fällen gilt die Zusicherung nicht — dann nie über den Index.
 */
function isVerifiedTextIndex(params: Record<string, unknown> | null): boolean {
  return (
    params !== null &&
    params.type === 'text' &&
    params.tokenizer === 'word' &&
    params.lowercase === true &&
    params.min_token_len === 2 &&
    params.max_token_len === 50 &&
    !params.stemmer &&
    !params.stopwords &&
    !params.ascii_folding
  );
}

/**
 * `chunkTextIndex` aus einem `payload_schema`-Abruf, je Sammlung einmal. Ein
 * Fehler wird nicht gemerkt — der nächste Aufruf fragt neu, bis dahin gilt
 * „kein Index" (der Lesepfad, nie eine falsche Vollständigkeit).
 */
export function cachedChunkTextIndex(
  fetchSchema: (qdrantCollection: string) => Promise<Record<string, unknown>>
): SystemNotebookSourcesDeps['chunkTextIndex'] {
  const cache = new Map<string, Record<string, unknown> | null>();
  return async (qdrantCollection) => {
    const hit = cache.get(qdrantCollection);
    if (hit !== undefined) return hit;
    try {
      const field = (await fetchSchema(qdrantCollection)).chunk_text as
        { data_type?: unknown; params?: unknown } | undefined;
      const params =
        field?.data_type === 'text' && field.params && typeof field.params === 'object'
          ? (field.params as Record<string, unknown>)
          : null;
      cache.set(qdrantCollection, params);
      return params;
    } catch {
      return null;
    }
  };
}

/**
 * Der Filter, der alle Chunks mit jedem Wort der Phrase holt (unter dem
 * Standardfilter, optional nur aus `sourceUrls`), und die Schreibweisen, die
 * danach zählen. `null`: kein Wort der Phrase kennt der Index.
 */
export function systemTermQuery(
  collection: SystemCollection,
  phrase: string,
  sourceUrls?: readonly string[]
): { filter: QdrantFilter; accept: (matched: string) => boolean } | null {
  const words = phrase.replaceAll('\u00AD', '').trim().split(/\s+/).map(wordForms);
  const clauses = words
    .filter((w) => w.queries.length > 0)
    .map((w) => ({ should: w.queries.map((text) => ({ key: 'chunk_text', match: { text } })) }));
  if (clauses.length === 0) return null;
  const scope = sourceUrls ? [{ key: 'source_url', match: { any: [...sourceUrls] } }] : [];
  // Verschachtelte `should`-Bedingungen kennt `QdrantFilter` nicht — Qdrant schon.
  const filter = applyDefaultFilter(collection.systemId, {
    must: [...scope, ...clauses],
  } as QdrantFilter) as QdrantFilter;
  const accept = (matched: string): boolean => {
    const got = matched.normalize('NFC').toLowerCase().split(/\s+/);
    return got.length === words.length && got.every((w, i) => words[i]!.accepted.has(w));
  };
  return { filter, accept };
}

/**
 * grep und rank by=term über den Volltextindex auf `chunk_text`: statt
 * höchstens `SYSTEM_SCAN_MAX_SOURCES` ganze Quellen zu lesen, holt ein Scroll
 * genau die Chunks, die jedes Wort der Phrase enthalten — unter dem
 * Standardfilter und, mit `sourceUrls`, nur aus diesen Quellen. Gezählt wird
 * danach mit `grepText`, eingeschränkt über `accept` auf die Schreibweisen
 * aus `wordForms`: genau die findet der Index, also ist die Zählung
 * vollständig, sobald der Scroll durchläuft. Gegen die echte Berliner Sammlung
 * geprüft in `notebookSourceTools.live.vitest.ts`.
 *
 * `null`: die Phrase hat kein Wort, das der Index kennt, oder die Sammlung
 * hat nicht den geprüften Index (`isVerifiedTextIndex`) — dann liest der
 * Aufrufer die Texte wie bisher.
 */
export async function loadSystemTermMatches(
  input: {
    collection: SystemCollection;
    phrase: string;
    /** Nur diese URLs (aus `filterSystemSourceUrls`). */
    sourceUrls?: readonly string[];
  },
  deps: Pick<SystemNotebookSourcesDeps, 'scrollPage' | 'chunkTextIndex'>
): Promise<(ScanLoad & { accept: (matched: string) => boolean }) | null> {
  const { collection } = input;
  const query = systemTermQuery(collection, input.phrase, input.sourceUrls);
  if (!query) return null;
  if (!isVerifiedTextIndex(await deps.chunkTextIndex(collection.qdrantCollection))) return null;
  const { filter, accept } = query;

  const byUrl = new Map<string, { title: string; chunks: TermChunk[] }>();
  let scrolled = 0;
  let offset: string | number | null = null;
  let more = true;
  while (more && scrolled < SYSTEM_TEXT_MATCH_MAX_POINTS) {
    const page = await deps.scrollPage(collection.qdrantCollection, filter, {
      limit: Math.min(SCROLL_PAGE, SYSTEM_TEXT_MATCH_MAX_POINTS - scrolled),
      offset,
      payload: TEXT_MATCH_PAYLOAD,
    });
    scrolled += page.points.length;
    for (const { payload } of page.points) {
      const url = str(payload.source_url);
      if (!url) continue;
      const entry = byUrl.get(url) ?? { title: str(payload.title) ?? url, chunks: [] };
      entry.chunks.push({
        index: num(payload.chunk_index) ?? 0,
        text: typeof payload.chunk_text === 'string' ? payload.chunk_text : '',
        charStart: num(payload.char_start),
        charEnd: num(payload.char_end),
        pageNumber: num(payload.page_number),
      });
      byUrl.set(url, entry);
    }
    offset = page.nextOffset;
    more = offset !== null && page.points.length > 0;
  }
  if (more) {
    capLog.warn(
      `[notebook_quellen:system-text-match] count cap hit: >${SYSTEM_TEXT_MATCH_MAX_POINTS} → ${SYSTEM_TEXT_MATCH_MAX_POINTS} items (rest not scrolled, ${collection.key})`
    );
  }

  const sources = [...byUrl].map(([sourceId, { title, chunks }]) => ({
    sourceId,
    title,
    ...joinTermChunks([...chunks].sort((a, b) => a.index - b.index)),
  }));
  return {
    sources,
    exhaustive: !more,
    incompleteReason: more
      ? `mehr als ${SYSTEM_TEXT_MATCH_MAX_POINTS} Abschnitte mit dem Begriff`
      : null,
    accept,
  };
}

/** Seiten und Chunks einer gelesenen System-Quelle — aus ihrer Chunk-Karte. */
export function systemSourceSize(chunkMap: readonly ChunkLocator[]): {
  pages: number | null;
  chunks: number | null;
} {
  const pages = chunkMap.flatMap((c) => (c.pageNumber === null ? [] : [c.pageNumber]));
  return {
    pages: pages.length ? Math.max(...pages) : null,
    chunks: chunkMap.length || null,
  };
}
