/**
 * Die Quellen EINES Notebooks — auflisten, öffnen, gliedern, lesen, Passagen
 * finden. Die Naht unter dem Werkzeug `notebook_quellen`
 * (`routes/chat/agents/notebookSourceTools.ts`).
 *
 * Reine Funktionen mit hereingereichten Deps, damit der Test ohne Postgres und
 * Qdrant läuft.
 *
 * DIE Zugriffsregel: gelesen wird eine Quelle nur über
 * `resolveSourceInNotebook` — Lesezugriff aufs Notebook UND Mitgliedschaft der
 * Quelle darin. Erst dann liest `readSourceText` mit der user_id der
 * EIGENTÜMER*IN (die Chunks tragen deren user_id); so werden geteilte
 * Notebooks lesbar, ohne dass der user_id-Filter in `documentRetrieval` fällt.
 */
import { applyContextCap } from '../../utils/contextCap.js';
import { buildPageRangesFromRaw } from '../document-services/TextChunker/pageMarkerProcessing.js';

import { type rerankNotebookResults } from './rerankNotebookResults.js';

import type { NotebookQdrantHelper } from '../../database/services/NotebookQdrantHelper.js';
import type { PostgresService } from '../../database/services/PostgresService.js';
import type { NotebookAccess } from '../../routes/notebook/notebookAccess.js';
import type { DocumentResult, TopChunk } from '../BaseSearchService/types.js';
import type { DocumentSearchService } from '../document-services/DocumentSearchService/DocumentSearchService.js';
import type {
  DocumentChunkItem,
  DocumentChunksResult,
} from '../document-services/DocumentSearchService/types.js';
import type { PageRange } from '../document-services/TextChunker/types.js';
import type { DocDateKind } from '../documentMeta/headerMeta.js';
import type { ExpandedChunkResult } from '../search/types.js';

/**
 * Dieselben Zahlen wie `dokumente_lesen` (`agenticLoop/attachedDocuments.ts`),
 * dort mit Begründung. Nicht importiert, weil jenes Modul `searchNode` und
 * damit den ganzen ChatGraph mitzieht — eine Service-Naht darf das nicht.
 * Wer die Zahlen dort ändert, ändert sie hier mit.
 */
export const SLICE_DEFAULT_CHARS = 10_000;
export const SLICE_REGISTER_CHARS = 12_000;
export const SLICE_MAX_CHARS = SLICE_REGISTER_CHARS - 400;

const LIST_DEFAULT_LIMIT = 20;
const LIST_MAX_LIMIT = 50;
export const FIND_MAX_LIMIT = 20;
/** Durchschnittliche Wortlänge inkl. Leerzeichen im Deutschen — nur Schätzung. */
const CHARS_PER_WORD = 6.5;

/** Wie in `notebookContractRouter.researchSearch`. */
const MODE_WEIGHTS: Record<FindMode, readonly [number, number]> = {
  hybrid: [0.7, 0.3],
  vector: [1.0, 0.0],
  text: [0.0, 1.0],
};

const NOT_FOUND = 'Notebook nicht gefunden oder kein Zugriff.';
const SOURCE_NOT_FOUND = 'Quelle nicht in diesem Notebook oder kein Zugriff.';

export interface NotebookSourcesDeps {
  db: Pick<PostgresService, 'query'>;
  helper: Pick<
    NotebookQdrantHelper,
    'getCollectionDocuments' | 'isDocumentInCollection' | 'getNotebookCollection'
  >;
  documentService: Pick<DocumentSearchService, 'getDocumentChunks' | 'search'>;
  access: (notebookId: string, userId: string) => Promise<NotebookAccess>;
  rerank: typeof rerankNotebookResults;
}

// ---------------------------------------------------------------------------
// Metadaten
// ---------------------------------------------------------------------------

/** Eine Zeile aus `documents`, wie `fetchDocumentMetadata` sie liest. */
export interface DocumentMetadataRow {
  id: string;
  user_id: string | null;
  title: string;
  filename: string | null;
  page_count: number | null;
  /** bigint — pg liefert es als string. */
  file_size: string | number | null;
  status: string | null;
  source_type: string | null;
  source_url: string | null;
  document_type: string | null;
  created_at: Date | string | null;
  vector_count: number | null;
  wolke_share_link_id: string | null;
  metadata: unknown;
  /** Länge des Originaltexts (`markdown_content`), `null` ohne Original. */
  chars: number | null;
}

/**
 * Die eine Metadaten-Abfrage für Notebook-Quellen — geteilt mit
 * `enrichNotebookCollection`, damit Liste im Chat und Notebook-Seite dieselben
 * Zeilen sehen.
 */
export async function fetchDocumentMetadata(
  db: Pick<PostgresService, 'query'>,
  ids: readonly string[],
  opts: { withChars?: boolean } = {}
): Promise<DocumentMetadataRow[]> {
  if (ids.length === 0) return [];
  // `length(markdown_content)` muss bis zu 500k Zeichen je Zeile entpacken —
  // nur die Quellenliste braucht die Zahl, die Notebook-Seite nicht.
  const chars = opts.withChars ? 'length(markdown_content)' : 'NULL::int';
  return db.query<DocumentMetadataRow>(
    `SELECT id, user_id, title, filename, page_count, file_size, status, source_type, source_url,
            document_type, created_at, vector_count, wolke_share_link_id, metadata,
            ${chars} AS chars
       FROM documents WHERE id = ANY($1)`,
    [ids]
  );
}

export type SourceSortBy =
  'name' | 'date' | 'pages' | 'size' | 'words' | 'chars' | 'status' | 'type';
export type SortOrder = 'asc' | 'desc';

export interface SourceFilter {
  sourceType?: string | undefined;
  status?: string | undefined;
  titleContains?: string | undefined;
  tag?: string | undefined;
  gremium?: string | undefined;
}

export interface NotebookSourceRow {
  id: string;
  title: string;
  sourceType: string | null;
  documentType: string | null;
  sourceUrl: string | null;
  pages: number | null;
  sizeBytes: number | null;
  words: number | null;
  wordsEstimated: boolean;
  chars: number | null;
  status: string | null;
  createdAt: string | null;
  /** Datum aus dem Dokumentkopf (`metadata.doc_meta`) — nicht die Upload-Zeit. */
  docDate: string | null;
  docDateKind: DocDateKind | null;
  gremium: string | null;
  tags: string[];
}

function parseMetadata(raw: unknown): Record<string, unknown> {
  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
}

function docMetaOf(meta: Record<string, unknown>): {
  docDate: string | null;
  docDateKind: DocDateKind | null;
  gremium: string | null;
} {
  const dm =
    meta.doc_meta && typeof meta.doc_meta === 'object'
      ? (meta.doc_meta as Record<string, unknown>)
      : {};
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
  const docDate = str(dm.date);
  return {
    docDate,
    docDateKind: docDate ? (str(dm.dateKind) as DocDateKind | null) : null,
    gremium: str(dm.gremium),
  };
}

/** Das Datum, nach dem eine Quelle sortiert wird: Dokumentdatum, sonst Upload. */
export function sortDateOf(r: NotebookSourceRow): string | null {
  return r.docDate ?? r.createdAt;
}

function toSourceRow(row: DocumentMetadataRow): NotebookSourceRow {
  const meta = parseMetadata(row.metadata);
  const chars = typeof row.chars === 'number' ? row.chars : null;
  const wordCount = typeof meta.wordCount === 'number' ? meta.wordCount : null;
  const words = wordCount ?? (chars !== null ? Math.round(chars / CHARS_PER_WORD) : null);
  const size = row.file_size === null ? NaN : Number(row.file_size);
  const created =
    row.created_at instanceof Date
      ? row.created_at.toISOString()
      : typeof row.created_at === 'string'
        ? row.created_at
        : null;
  return {
    id: String(row.id),
    title: row.title || row.filename || '(ohne Titel)',
    sourceType: row.source_type ?? null,
    documentType: row.document_type ?? null,
    sourceUrl: row.source_url ?? null,
    pages: typeof row.page_count === 'number' && row.page_count > 0 ? row.page_count : null,
    sizeBytes: Number.isFinite(size) && size > 0 ? size : null,
    words,
    wordsEstimated: wordCount === null && words !== null,
    chars,
    status: row.status ?? null,
    createdAt: created,
    ...docMetaOf(meta),
    tags: Array.isArray(meta.tags)
      ? meta.tags.filter((t): t is string => typeof t === 'string')
      : [],
  };
}

const SORT_KEY: Record<SourceSortBy, (r: NotebookSourceRow) => string | number | null> = {
  name: (r) => r.title.toLocaleLowerCase('de'),
  date: (r) => {
    const d = sortDateOf(r);
    return d ? Date.parse(d) : null;
  },
  pages: (r) => r.pages,
  size: (r) => r.sizeBytes,
  words: (r) => r.words,
  chars: (r) => r.chars,
  status: (r) => r.status,
  type: (r) => r.sourceType,
};

export const DESC_BY_DEFAULT: ReadonlySet<SourceSortBy> = new Set([
  'date',
  'pages',
  'size',
  'words',
  'chars',
]);

export function compareRows(sortBy: SourceSortBy, order: SortOrder) {
  const key = SORT_KEY[sortBy];
  const sign = order === 'asc' ? 1 : -1;
  const byTitle = (a: NotebookSourceRow, b: NotebookSourceRow) =>
    a.title.localeCompare(b.title, 'de', { sensitivity: 'base' });
  return (a: NotebookSourceRow, b: NotebookSourceRow): number => {
    const ka = key(a);
    const kb = key(b);
    // Unbekanntes steht immer hinten — in beiden Richtungen.
    if (ka === null && kb === null) return byTitle(a, b);
    if (ka === null) return 1;
    if (kb === null) return -1;
    const cmp =
      typeof ka === 'number' && typeof kb === 'number'
        ? ka - kb
        : String(ka).localeCompare(String(kb), 'de', { sensitivity: 'base' });
    return cmp === 0 ? byTitle(a, b) : sign * cmp;
  };
}

function matchesFilter(row: NotebookSourceRow, filter: SourceFilter | undefined): boolean {
  if (!filter) return true;
  if (filter.sourceType && row.sourceType !== filter.sourceType) return false;
  if (filter.status && row.status !== filter.status) return false;
  if (
    filter.titleContains &&
    !row.title.toLocaleLowerCase('de').includes(filter.titleContains.toLocaleLowerCase('de'))
  ) {
    return false;
  }
  if (filter.tag && !row.tags.includes(filter.tag)) return false;
  if (
    filter.gremium &&
    row.gremium?.toLocaleLowerCase('de') !== filter.gremium.toLocaleLowerCase('de')
  ) {
    return false;
  }
  return true;
}

export async function listNotebookSources(
  input: {
    collectionId: string;
    sortBy?: SourceSortBy | undefined;
    order?: SortOrder | undefined;
    filter?: SourceFilter | undefined;
    offset?: number | undefined;
    limit?: number | undefined;
  },
  deps: Pick<NotebookSourcesDeps, 'db' | 'helper'>
): Promise<{ total: number; items: NotebookSourceRow[] }> {
  const links = await deps.helper.getCollectionDocuments(input.collectionId);
  const rows = await fetchDocumentMetadata(
    deps.db,
    links.map((l) => l.document_id),
    { withChars: true }
  );
  const sortBy = input.sortBy ?? 'date';
  const order = input.order ?? (DESC_BY_DEFAULT.has(sortBy) ? 'desc' : 'asc');
  const filtered = rows
    .map(toSourceRow)
    .filter((r) => matchesFilter(r, input.filter))
    .sort(compareRows(sortBy, order));
  const offset = Math.max(0, Math.floor(input.offset ?? 0));
  const limit = Math.min(
    LIST_MAX_LIMIT,
    Math.max(1, Math.floor(input.limit ?? LIST_DEFAULT_LIMIT))
  );
  return { total: filtered.length, items: filtered.slice(offset, offset + limit) };
}

/**
 * Die Quelle zu einer sourceId, die kein ref dieses Notebooks ist — meist ein
 * geratener Name („Niederschrift", der Dateiname). Genau eine Quelle im
 * Notebook, oder genau ein Titel, der den Namen enthält (oder in ihm steht);
 * sonst `null`.
 */
export function matchSourceByName(
  rows: readonly NotebookSourceRow[],
  wanted: string
): NotebookSourceRow | null {
  if (rows.length === 1) return rows[0] ?? null;
  const norm = (s: string) =>
    s
      .toLocaleLowerCase('de')
      .replace(/\.[a-z0-9]{2,4}$/, '')
      .replace(/[_\-.\s]+/g, ' ')
      .trim();
  const w = norm(wanted);
  if (w.length < 3) return null;
  const hits = rows.filter((r) => {
    const t = norm(r.title);
    return t.length >= 3 && (t.includes(w) || w.includes(t));
  });
  return hits.length === 1 ? (hits[0] ?? null) : null;
}

// ---------------------------------------------------------------------------
// Zugriff
// ---------------------------------------------------------------------------

export type ResolvedSource =
  | { ok: true; ownerUserId: string; collectionName: string; title: string }
  | { ok: false; error: string };

/** DIE Zugriffsregel — jeder Lesezugriff auf eine Quelle geht hier durch. */
export async function resolveSourceInNotebook(
  input: { collectionId: string; sourceId: string; userId: string },
  deps: Pick<NotebookSourcesDeps, 'db' | 'helper' | 'access'>
): Promise<ResolvedSource> {
  const access = await deps.access(input.collectionId, input.userId);
  if (!access.exists || !access.canRead) return { ok: false, error: NOT_FOUND };
  if (!(await deps.helper.isDocumentInCollection(input.collectionId, input.sourceId))) {
    return { ok: false, error: SOURCE_NOT_FOUND };
  }
  const [collection, rows] = await Promise.all([
    deps.helper.getNotebookCollection(input.collectionId),
    deps.db.query<{ user_id: string | null; title: string | null }>(
      'SELECT user_id, title FROM documents WHERE id = $1',
      [input.sourceId]
    ),
  ]);
  if (!collection) return { ok: false, error: NOT_FOUND };
  const owner = rows[0]?.user_id;
  if (!owner) return { ok: false, error: SOURCE_NOT_FOUND };
  return {
    ok: true,
    ownerUserId: String(owner),
    collectionName: collection.name,
    title: rows[0]?.title || '(ohne Titel)',
  };
}

// ---------------------------------------------------------------------------
// Text, Gliederung, Scheiben
// ---------------------------------------------------------------------------

export interface ChunkLocator {
  index: number;
  charStart: number;
  charEnd: number;
  pageNumber: number | null;
}

export interface SourceText {
  text: string;
  origin: 'original' | 'chunks';
  chunkMap: ChunkLocator[];
  /** Die Chunks samt Gliederungsfeldern — `outlineSource` und `section` brauchen sie. */
  chunks: DocumentChunkItem[];
}

/**
 * Offsets je Chunk im Originaltext. Aus der Nutzlast, wo sie steht; sonst der
 * Chunktext der Reihe nach im Original gesucht. Nicht gefunden (Chunk trägt
 * z. B. einen Überschriften-Präfix) → er beginnt, wo der vorige endete.
 */
export function locateInOriginal(text: string, chunks: DocumentChunkItem[]): ChunkLocator[] {
  let cursor = 0;
  return chunks.map((c) => {
    let start: number;
    let end: number;
    if (typeof c.charStart === 'number' && typeof c.charEnd === 'number') {
      start = c.charStart;
      end = c.charEnd;
    } else {
      const found = text.indexOf(c.text, cursor);
      start = found === -1 ? cursor : found;
      end = start + c.text.length;
    }
    cursor = end;
    return { index: c.index, charStart: start, charEnd: end, pageNumber: c.pageNumber ?? null };
  });
}

/**
 * Offsets in den aus Chunks zusammengesetzten Text. Die Nutzlast-Offsets zeigen
 * ins Original und gelten hier NICHT.
 */
export function locateInJoined(chunks: DocumentChunkItem[]): ChunkLocator[] {
  let cursor = 0;
  return chunks.map((c, i) => {
    const start = cursor + (i === 0 ? 0 : 2);
    cursor = start + c.text.length;
    return { index: c.index, charStart: start, charEnd: cursor, pageNumber: c.pageNumber ?? null };
  });
}

/** Der Fehlertext von `getDocumentChunks` für eine Quelle ohne Chunks. */
const NO_CHUNKS_FOUND = 'No chunks found';

/**
 * Die Chunks eines Lesevorgangs. „No chunks found" ist ein legitimer Befund
 * (Quelle ohne Chunks); jeder andere Fehlschlag wird geworfen — sonst läse ein
 * Qdrant-Ausfall sich als „keine Seitenzahlen" oder „keine Gliederung".
 */
export function chunksOrThrow(result: DocumentChunksResult): DocumentChunkItem[] {
  if (result.success) return result.chunks;
  if (result.error === NO_CHUNKS_FOUND) return [];
  throw new Error(`getDocumentChunks failed: ${result.error ?? 'unknown error'}`);
}

export async function readSourceText(
  input: { sourceId: string; ownerUserId: string },
  deps: Pick<NotebookSourcesDeps, 'db' | 'documentService'>
): Promise<SourceText> {
  const [rows, chunkResult] = await Promise.all([
    deps.db.query<{ markdown_content: string | null }>(
      'SELECT markdown_content FROM documents WHERE id = $1',
      [input.sourceId]
    ),
    deps.documentService.getDocumentChunks(input.ownerUserId, input.sourceId),
  ]);
  const chunks = chunksOrThrow(chunkResult);
  const original = rows[0]?.markdown_content ?? '';
  if (original.trim()) {
    return {
      text: original,
      origin: 'original',
      chunkMap: locateInOriginal(original, chunks),
      chunks,
    };
  }
  return {
    text: chunks.map((c) => c.text).join('\n\n'),
    origin: 'chunks',
    chunkMap: locateInJoined(chunks),
    chunks,
  };
}

export interface SourceSlice {
  slice: string;
  from: number;
  to: number;
  total: number;
  continuationHint: string | null;
  pageRange: { from: number; to: number } | null;
}

/**
 * Seitenbereiche aus den `## Seite N`-Marken des gespeicherten Texts. Genauer
 * als die Chunks: eine kurze Seite hat oft keinen Chunk, der auf ihr beginnt,
 * steht aber als eigene Marke im Text. Leer, wenn der Text keine Marken hat.
 */
export function markedPageRanges(text: string): PageRange[] {
  return buildPageRangesFromRaw(text);
}

/**
 * Die Seite eines Offsets nach den `## Seite N`-Marken — `null` ohne Marken
 * oder vor der ersten. Ein Chunk trägt die Seite, auf der er BEGINNT; ein
 * Treffer hinter einem Seitenwechsel im selben Chunk stünde sonst eine Seite zu früh.
 */
export function markedPageAt(marked: readonly PageRange[], offset: number): number | null {
  return marked.find((r) => r.start <= offset && offset < r.end)?.page ?? null;
}

/**
 * Die letzte Seite, die eine Passage erreicht: die höchste `## Seite N`-Marke
 * INNERHALB ihres Zeichenbereichs, auf die dort noch Text folgt. Die Startseite kennt
 * der Chunk schon genau. Gelesen werden nur die Seitenzahlen, nicht der Text.
 * Schlüssel ist der Index in `spans`; ohne Marke im Bereich kein Eintrag.
 */
export async function loadPassagePageEnds(
  db: Pick<PostgresService, 'query'>,
  spans: ReadonlyArray<{ sourceId: string; charStart: number; charEnd: number }>
): Promise<Map<number, number>> {
  if (spans.length === 0) return new Map();
  const rows = await db.query<{ i: string | number; page: number | null }>(
    `SELECT x.i,
            (SELECT max(m[1]::int)
               FROM regexp_matches(substr(d.markdown_content, x.s + 1, x.e - x.s),
                                   '##\\s*Seite\\s+(\\d+)\\s*\\S', 'gi') AS m) AS page
       FROM unnest($1::uuid[], $2::int[], $3::int[]) WITH ORDINALITY AS x(id, s, e, i)
       JOIN documents d ON d.id = x.id`,
    [spans.map((p) => p.sourceId), spans.map((p) => p.charStart), spans.map((p) => p.charEnd)]
  );
  const out = new Map<number, number>();
  for (const r of rows) {
    if (r.page !== null) out.set(Number(r.i) - 1, Number(r.page));
  }
  return out;
}

export function sliceSource(
  text: string,
  opts: { von: number; zeichen?: number | undefined },
  chunkMap: readonly ChunkLocator[]
): SourceSlice {
  const total = text.length;
  const from = Math.min(total, Math.max(0, Math.floor(opts.von)));
  const chars = Math.min(
    SLICE_MAX_CHARS,
    Math.max(1, Math.floor(opts.zeichen ?? SLICE_DEFAULT_CHARS))
  );
  const slice = text.slice(from, from + chars);
  const to = from + slice.length;
  const marked = markedPageRanges(text);
  const pages =
    marked.length > 0
      ? marked.filter((r) => r.start < to && r.end > from).map((r) => r.page)
      : chunkMap
          .filter((c) => c.pageNumber !== null && c.charStart < to && c.charEnd > from)
          .map((c) => c.pageNumber as number);
  return {
    slice,
    from,
    to,
    total,
    continuationHint:
      to < total ? `[Zeichen ${from}–${to} von ${total} — weiter mit von=${to}]` : null,
    pageRange: pages.length ? { from: Math.min(...pages), to: Math.max(...pages) } : null,
  };
}

/** Der Zeichenbereich, den eine Menge Chunks im Text belegt — `null` ohne Treffer. */
export function charRangeOfChunks(
  chunkMap: readonly ChunkLocator[],
  pick: (c: ChunkLocator) => boolean
): { von: number; zeichen: number } | null {
  const hit = chunkMap.filter(pick);
  if (hit.length === 0) return null;
  const von = Math.min(...hit.map((c) => c.charStart));
  const bis = Math.max(...hit.map((c) => c.charEnd));
  return { von, zeichen: Math.max(1, bis - von) };
}

export interface OutlineEntry {
  sectionIndex: number | null;
  headingPath: string[];
  heading: string | null;
  chunkFrom: number;
  chunkTo: number;
  pageFrom: number | null;
  pageTo: number | null;
  chars: number;
}

export function outlineSource(chunks: readonly DocumentChunkItem[]): OutlineEntry[] {
  const out: OutlineEntry[] = [];
  let lastKey: string | null = null;
  for (const c of chunks) {
    const path = c.headingPath ?? [];
    const key =
      typeof c.sectionIndex === 'number' ? `s:${c.sectionIndex}` : `h:${path.join(' > ')}`;
    const page = c.pageNumber ?? null;
    const current = out[out.length - 1];
    if (current && key === lastKey) {
      current.chunkTo = c.index;
      current.chars += c.text.length;
      current.heading ??= c.heading ?? null;
      if (page !== null) {
        current.pageFrom = current.pageFrom === null ? page : Math.min(current.pageFrom, page);
        current.pageTo = current.pageTo === null ? page : Math.max(current.pageTo, page);
      }
      continue;
    }
    out.push({
      sectionIndex: typeof c.sectionIndex === 'number' ? c.sectionIndex : null,
      headingPath: path,
      heading: c.heading ?? null,
      chunkFrom: c.index,
      chunkTo: c.index,
      pageFrom: page,
      pageTo: page,
      chars: c.text.length,
    });
    lastKey = key;
  }
  return out;
}

/** Deckel der Gliederung — dieselbe Zahl wie der Detailblock von `notebooks.get`. */
export const OUTLINE_CHARS = 4000;

/** Die Gliederung als nummerierte Textzeilen — für die Quellenregistrierung. */
export function renderOutline(title: string, outline: readonly OutlineEntry[]): string {
  const lines = outline.map((e, i) => {
    const name = e.heading ?? (e.headingPath.at(-1) || '(ohne Überschrift)');
    const depth = Math.max(0, e.headingPath.length - 1);
    const pages =
      e.pageFrom === null
        ? ''
        : e.pageFrom === e.pageTo
          ? `, S. ${e.pageFrom}`
          : `, S. ${e.pageFrom}–${e.pageTo}`;
    const section = e.sectionIndex === null ? '' : `section=${e.sectionIndex}, `;
    return `${'  '.repeat(depth)}${i + 1}. ${name} (${section}Chunks ${e.chunkFrom}–${e.chunkTo}${pages})`;
  });
  return applyContextCap(
    [`Gliederung von „${title}"`, ...lines].join('\n'),
    OUTLINE_CHARS,
    'notebook_quellen:outline'
  );
}

// ---------------------------------------------------------------------------
// Passagensuche
// ---------------------------------------------------------------------------

export type FindMode = 'hybrid' | 'vector' | 'text';

export interface Passage {
  sourceId: string;
  title: string;
  chunkIndex: number;
  pageNumber: number | null;
  charStart: number | null;
  charEnd: number | null;
  /**
   * Die Suchschicht bewertet Dokumente, nicht Chunks: ohne Rerank trägt jede
   * Passage den Wert ihres Dokuments (innerhalb eines Dokuments bleibt die
   * Reihenfolge der Suche). Mit Rerank ist es der Cross-Encoder-Wert der
   * Passage selbst.
   */
  score: number;
  hasTerm: boolean;
  text: string;
}

function toPassage(doc: DocumentResult, tc: TopChunk): Passage {
  return {
    sourceId: doc.document_id,
    title: doc.title || doc.filename || '(ohne Titel)',
    chunkIndex: tc.chunk_index,
    pageNumber: tc.page_number ?? null,
    charStart: tc.char_start ?? null,
    charEnd: tc.char_end ?? null,
    score: doc.similarity_score,
    hasTerm: tc.has_term === true,
    text: tc.text ?? tc.preview,
  };
}

const passageKey = (p: { sourceId: string; chunkIndex: number }): string =>
  `${p.sourceId}:${p.chunkIndex}`;

export async function findPassages(
  input: {
    documentIds: readonly string[];
    query: string;
    mode: FindMode;
    limit: number;
    rerank: boolean;
    userId: string;
  },
  deps: Pick<NotebookSourcesDeps, 'documentService' | 'rerank'>
): Promise<{ passages: Passage[]; reranked: boolean }> {
  if (input.documentIds.length === 0) return { passages: [], reranked: false };
  const limit = Math.min(FIND_MAX_LIMIT, Math.max(1, Math.floor(input.limit)));
  const [vectorWeight, textWeight] = MODE_WEIGHTS[input.mode];
  // Mit `documentIds` filtert die Suche NICHT auf die user_id der Aufrufer*in
  // (searchOperations.vitest.ts) — die Ids sind die Freigabe, geprüft vom Aufrufer.
  const resp = await deps.documentService.search({
    query: input.query,
    userId: input.userId,
    options: {
      limit: limit * 3,
      mode: input.mode === 'text' ? 'text' : 'hybrid',
      vectorWeight,
      textWeight,
      threshold: 0.2,
      searchCollection: 'documents',
    },
    filters: { documentIds: [...input.documentIds] },
  });

  // Ein Fehlschlag (Qdrant, Einbettung) kommt als `success:false` mit leeren
  // Treffern zurück — ungeprüft läse er sich als „steht nicht im Notebook".
  if (!resp.success) {
    throw new Error(`notebook search failed: ${resp.error ?? resp.message ?? 'unknown error'}`);
  }

  // Stabile Sortierung: gleiche Dokumentwerte behalten die Chunk-Reihenfolge der Suche.
  const flat = (resp.results ?? [])
    .flatMap((doc) => (doc.top_chunks ?? []).map((tc) => toPassage(doc, tc)))
    .filter((p) => p.text.trim().length > 0)
    .sort((a, b) => b.score - a.score);

  // `rerankNotebookResults` überspringt selbst bei ≤ 3 Ergebnissen — hier
  // gar nicht erst aufgerufen, damit `reranked` stimmt.
  if (!input.rerank || flat.length <= 3) {
    return { passages: flat.slice(0, limit), reranked: false };
  }

  const candidates: ExpandedChunkResult[] = flat.slice(0, FIND_MAX_LIMIT).map((p) => ({
    document_id: p.sourceId,
    source_url: null,
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
