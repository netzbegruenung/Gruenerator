#!/usr/bin/env npx tsx
/**
 * Re-Chunk bestehender Qdrant-Punkte aus dem gespeicherten `full_text` (#3145).
 *
 * Zerlegt Dokumente einer Sammlung mit dem heutigen Struktur-Chunker neu —
 * OHNE Download, OHNE PDF.js, OHNE OCR. Die einzige Eingabe ist das Feld
 * `full_text`, das der Ingest auf dem Kopf-Punkt (`chunk_index = 0`) abgelegt
 * hat. Ein Dokument ohne `full_text` wird gezählt und übersprungen, nie
 * nachgeholt: der Rekonstruktions-Backfill aus `scripts/backfillFullText.ts`
 * liefert plattgedrückten Fließtext ohne eine einzige erkennbare Überschrift
 * (Spec, Abschnitt B.2) und ist eine bewusste, gesonderte Entscheidung.
 *
 * REIHENFOLGE JE DOKUMENT: UPSERT ZUERST, LÖSCHEN DANACH. Nie umgekehrt.
 * `full_text` liegt ausschliesslich auf dem Kopf-Punkt. Wer erst per Filter
 * löscht — wie `scripts/reprocess-pdfs.ts:298`, das sich einen Neu-Download
 * leisten kann — und dann abstürzt, hat die einzige Eingabe dieses Skripts
 * vernichtet. Einen Download gibt es hier per Konstruktion nicht.
 *
 * Usage (aus apps/api):
 *   npx tsx scripts/rechunk-from-fulltext.ts --collection grundsatz_documents --dry-run
 *   npx tsx scripts/rechunk-from-fulltext.ts --collection landesverbaende_documents --only-structured
 *
 * NOTE: dotenv muss vor jedem App-Import laufen, der die Umgebung beim Import
 * parst (`config/env.js`) — deshalb stehen diese Importe dynamisch in `main()`.
 * Die statischen Importe hier oben sind bewusst nur solche ohne Nebenwirkung:
 * reine Rechnungen und Typen.
 */
import { basename } from 'node:path';

import dotenv from 'dotenv';

import { buildEmbeddingTextsForChunks } from '../services/document-services/embeddingText.js';
import { structurePayload } from '../services/document-services/structurePayload.js';
import { type Chunk, type ChunkMetadata } from '../services/document-services/TextChunker/types.js';
import { generatePointId, stringToNumericHash } from '../utils/validation/hash.js';

dotenv.config();

// =============================================================================
// CLI
// =============================================================================

export interface CliArgs {
  collection: string;
  dryRun: boolean;
  onlyStructured: boolean;
  resume: boolean;
  limit: number;
}

const USAGE =
  'Usage: rechunk-from-fulltext.ts --collection <name> [--dry-run] [--only-structured] [--resume] [--limit N]';

/**
 * Liest den Wert hinter einem Flag. Ein fehlender Wert oder einer, der selbst
 * wie ein Flag aussieht (`--collection --dry-run`), ist ein Fehler — sonst
 * schluckt `--collection` das nächste Flag stillschweigend als Sammlungsnamen.
 */
function readFlagValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${flag} braucht einen Wert.\n${USAGE}`);
  }
  return value;
}

/**
 * `--collection` ist Pflicht und es gibt kein `--all` und keine Vorgabe: ein
 * Werkzeug, das versehentlich 25 615 Punkte neu einbettet, gehört nicht ins
 * Repo. Ein unbekanntes Argument ist ein Fehler, kein Rauschen — ein
 * verschluckter Tippfehler in `--dry-run` wäre ein Schreiblauf.
 */
export function parseArgs(argv: string[]): CliArgs {
  let collection: string | null = null;
  let dryRun = false;
  let onlyStructured = false;
  let resume = false;
  let limit = Infinity;

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--collection':
        collection = readFlagValue(argv, ++i, '--collection');
        break;
      case '--dry-run':
        dryRun = true;
        break;
      case '--only-structured':
        onlyStructured = true;
        break;
      case '--resume':
        resume = true;
        break;
      case '--limit': {
        const raw = readFlagValue(argv, ++i, '--limit');
        const parsed = Number.parseInt(raw, 10);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          throw new Error(`--limit erwartet eine positive Zahl, bekam "${raw}".\n${USAGE}`);
        }
        limit = parsed;
        break;
      }
      default:
        throw new Error(`Unknown argument: ${argv[i]}\n${USAGE}`);
    }
  }

  if (!collection) throw new Error(USAGE);
  return { collection, dryRun, onlyStructured, resume, limit };
}

// =============================================================================
// Reine Rechnungen — kein I/O. Exportiert für rechunk-from-fulltext.vitest.ts.
// =============================================================================

export interface PointIdRecipe {
  /** Payload-Feld, das das Dokument benennt — zugleich der Gruppierungsschlüssel. */
  idKey: string;
  /** Punkt-ID des Chunks `index` des Dokuments `key`. */
  id(key: string, index: number): number;
}

/**
 * Ein Rezept je Sammlung, und nur für die, deren Rezept nachgerechnet ist.
 * `null` heisst Abbruch — nicht „nimm irgendeins". `documents` steht hier
 * bewusst nicht: die Sammlung hat kein `full_text`, gehört einzelnen
 * Nutzer*innen und ist in diesem PR tabu.
 */
export function pointIdRecipeFor(collection: string): PointIdRecipe | null {
  switch (collection) {
    case 'grundsatz_documents':
      // ProgramPdfScraper.ts:371 mit sourceGroupId 'grundsatz' (:76).
      return {
        idKey: 'document_id',
        id: (key, index) => generatePointId('grundsatz', key, index),
      };
    case 'landesverbaende_documents':
      // LandesverbandScraper.ts:1259-1268, benutzt in DocumentProcessor.ts:148.
      // Der Schlüssel ist source_url; document_id ist dort `lv_<contentHash>`
      // und geht gar nicht in die ID ein.
      return {
        idKey: 'source_url',
        id: (key, index) => stringToNumericHash(`lv_${key}_${index}`),
      };
    case 'bundestag_content':
      // indexing.ts:198 — chunkToNumericId(url, index), OHNE Präfix. Der
      // Schlüssel ist source_url; die Sammlung führt gar kein document_id.
      return {
        idKey: 'source_url',
        id: (key, index) => stringToNumericHash(`${key}_${index}`),
      };
    case 'boell_stiftung_documents':
      // BoellStiftungScraper.ts:637.
      return {
        idKey: 'source_url',
        id: (key, index) => generatePointId('boell', key, index),
      };
    case 'gruene_at_documents':
      // GrueneAtScraper.ts:451.
      return {
        idKey: 'source_url',
        id: (key, index) => generatePointId('gruene_at', key, index),
      };
    case 'gruenblog_documents':
      // GruenblogScraper.ts:409.
      return {
        idKey: 'source_url',
        id: (key, index) => generatePointId('gruenblog', key, index),
      };
    default:
      return null;
  }
}

export interface Bm25PreconditionResult {
  /** `false` heisst: `main()` muss abbrechen (`process.exitCode = 1`, `return`). */
  proceed: boolean;
  /** `null` heisst: bm25 ist da, nichts zu melden. */
  log: { level: 'error' | 'warn'; message: string } | null;
}

/**
 * Vorbedingung 1 (bm25). Ein echter Schreib-Lauf ohne bm25 bricht weiterhin ab
 * — dicht-only geschriebene Punkte kosten die Einbettung nach der Migration
 * ein zweites Mal. `--dry-run` schreibt nichts und bezahlt keine Einbettung:
 * der fehlende Sparse-Vektor ist dort keine Gefahr, sondern genau die Zahl,
 * die die Migrationsentscheidung braucht (Finding 7, 02.09.2026, gegen die
 * echte Produktions-Qdrant beobachtet). Ohne diese Ausnahme zählt NIE eine
 * noch nicht migrierte Sammlung — und `landesverbaende_documents`, die
 * einzige mit nachgerechnetem Rezept UND full_text-reichen Dokumenten, hat
 * bm25 noch nicht.
 */
export function checkBm25Precondition(
  collection: string,
  hasBm25: boolean,
  dryRun: boolean
): Bm25PreconditionResult {
  if (hasBm25) return { proceed: true, log: null };

  const message =
    `${collection} deklariert den Sparse-Vektor bm25 nicht. Sonst kostet der ` +
    'Lauf seine Einbettungen zweimal. Zuerst:\n' +
    `  npx tsx scripts/migrate-bm25-sparse.ts --collection ${collection}`;

  if (dryRun) return { proceed: true, log: { level: 'warn', message } };
  return { proceed: false, log: { level: 'error', message } };
}

export interface IdRecipeMismatch {
  id: string | number;
  key: string;
  chunkIndex: number;
  expected: number;
  /** `missing_key` heisst: kein Rezept konnte gerechnet werden. `id_mismatch`
   * heisst: gerechnet, aber der lebende Punkt trägt eine andere ID. */
  reason: 'missing_key' | 'id_mismatch';
}

export interface IdRecipeCheck {
  checked: number;
  matched: number;
  mismatches: IdRecipeMismatch[];
}

/**
 * Rechnet für jeden gescrollten Punkt die ID nach. Eine einzige Abweichung
 * heisst, dass Upsert-zuerst Dubletten erzeugen würde statt zu überschreiben —
 * genau die Ausfallart, die `reprocess-pdfs.ts:303-306` mit seinem md5-Rezept
 * für dieselben Dokumente derselben Sammlung erzeugt.
 */
export function checkIdRecipe(
  points: ReadonlyArray<{ id: string | number; payload: Record<string, unknown> | null }>,
  recipe: PointIdRecipe
): IdRecipeCheck {
  const mismatches: IdRecipeMismatch[] = [];
  let matched = 0;

  for (const point of points) {
    const key = point.payload?.[recipe.idKey];
    const rawIndex = point.payload?.chunk_index;
    const chunkIndex = typeof rawIndex === 'number' ? rawIndex : -1;

    if (typeof key !== 'string' || chunkIndex < 0) {
      mismatches.push({
        id: point.id,
        key: typeof key === 'string' ? key : '',
        chunkIndex,
        expected: -1,
        reason: 'missing_key',
      });
      continue;
    }

    const expected = recipe.id(key, chunkIndex);
    if (point.id === expected) {
      matched++;
    } else {
      mismatches.push({ id: point.id, key, chunkIndex, expected, reason: 'id_mismatch' });
    }
  }

  return { checked: points.length, matched, mismatches };
}

export interface RechunkPoint {
  id: number;
  vector: number[];
  payload: Record<string, unknown>;
}

/**
 * Die einzigen Payload-Schlüssel, die dieses Skript neu berechnet. Alles andere
 * wird aus dem Kopf-Punkt übernommen — AUSSCHLUSSLISTE, nicht Erlaubnisliste.
 *
 * Eine Erlaubnisliste hätte `themes`/`primary_topic`/`persons`/`nlp_*` still
 * abgeräumt (notebookEnrichmentService.ts:8-11 schreibt sie auf JEDEN Chunk)
 * und mit ihnen die Themen- und Personen-Facetten der Sammlung; und sie hätte
 * die Spar-Gatter `content_hash`/`file_hash`/`source_etag`/
 * `source_last_modified` verloren, womit jedes angefasste Dokument im nächsten
 * nächtlichen Lauf als unbekannt gilt und voll neu ausgelesen wird — bei
 * Scan-PDFs seitenweise über Mistral-OCR abgerechnet.
 */
export const RECOMPUTED_PAYLOAD_KEYS: readonly string[] = [
  'chunk_index',
  'chunk_text',
  'heading_path',
  'heading',
  'chunk_type',
  'section_index',
  'quality_score',
  'token_count',
  'indexed_at',
  'page_number',
  'full_text',
  'rechunked_at',
  'chunk_method',
];

export function rebuildChunkPayload(
  headPayload: Record<string, unknown>,
  chunk: { text: string; tokens: number; metadata?: ChunkMetadata | undefined },
  ctx: { index: number; fullText: string; qualityScore: number; now: string }
): Record<string, unknown> {
  const carried: Record<string, unknown> = { ...headPayload };
  for (const key of RECOMPUTED_PAYLOAD_KEYS) delete carried[key];

  const pageNumber = headPayload.page_number;
  const carriesTokenCount = Object.prototype.hasOwnProperty.call(headPayload, 'token_count');

  return {
    ...carried,
    chunk_index: ctx.index,
    chunk_text: chunk.text,
    ...structurePayload(chunk),
    quality_score: ctx.qualityScore,
    ...(carriesTokenCount ? { token_count: chunk.tokens } : {}),
    // NIE schätzen: full_text trägt keine Seitenmarker, der Chunker hat also
    // keine Seiteninformation, und die anteilige Schätzung aus
    // ProgramPdfScraper.ts:390-396 ist nicht reproduzierbar, sobald sich die
    // Chunk-Zahl ändert.
    ...(typeof pageNumber === 'number' ? { page_number: pageNumber } : {}),
    indexed_at: ctx.now,
    // rechunked_at NICHT hier setzen: wer zwischen Upsert und Löschen abstürzt,
    // soll bei einem erneuten --resume-Lauf wieder gefunden werden. Der
    // Kopf-Punkt bekommt den Stempel erst NACH dem Löschen, per setPayload
    // (siehe processDocument) — nie im Upsert-Payload.
    chunk_method: chunk.metadata?.chunkingMethod ?? null,
    ...(ctx.index === 0 ? { full_text: ctx.fullText } : {}),
  };
}

/**
 * Die alten Punkte, die die neue Menge nicht überschreibt (`m > n`). Explizite
 * IDs statt eines Filters, weil `grundsatz_documents` keinen Payload-Index auf
 * `document_id` hat (`config/qdrantCollectionsSchema.ts:214-219`) und weil eine
 * ID-Liste nicht danebengreifen kann.
 */
export function leftoverPointIds(
  oldIds: ReadonlyArray<string | number>,
  newIds: ReadonlyArray<number>
): Array<string | number> {
  const keep = new Set<string | number>(newIds);
  return oldIds.filter((id) => !keep.has(id));
}

/**
 * 16 Punkte je Upsert — 64 Punkte mit Vektor und Payload sind ~1 MB, und der
 * Reverse-Proxy vor Qdrant antwortet dann mit 413 (migrate-bm25-sparse.ts:41-45,
 * gemessen am 02.09.2026 an kommunalwiki_documents). Der Punkt mit `full_text`
 * trägt den ganzen Dokumenttext und geht deshalb allein.
 */
export const UPSERT_BATCH = 16;

export function upsertBatches<T extends { payload: Record<string, unknown> }>(points: T[]): T[][] {
  const batches: T[][] = [];
  let current: T[] = [];

  for (const point of points) {
    if ('full_text' in point.payload) {
      if (current.length > 0) {
        batches.push(current);
        current = [];
      }
      batches.push([point]);
      continue;
    }
    current.push(point);
    if (current.length === UPSERT_BATCH) {
      batches.push(current);
      current = [];
    }
  }

  if (current.length > 0) batches.push(current);
  return batches;
}

export type SkipReason = 'no_full_text' | 'fast_path' | 'no_chunks' | 'already_rechunked' | 'error';

export interface DocumentOutcome {
  /** Wert des `idKey`-Payloadfelds — der Gruppierungsschlüssel des Dokuments. */
  key: string;
  skipped: SkipReason | null;
  structured: boolean;
  oldChunks: number;
  newChunks: number;
  chars: number;
  written: number;
  deleted: number;
}

/**
 * Ob der Struktur-Pfad gegriffen hat. Geprüft wird auf `=== 'structure-blocks'`
 * (TextChunker.ts:72) gegen „alles andere" — NIE auf Gleichheit mit einem der
 * alten Etiketten. Alte und neue Punkte liegen in derselben Sammlung, und die
 * alten tragen für immer `'langchain-sentences'`, `'fallback-paragraph'`,
 * `'langchain'`, `'hierarchical'` oder `'hierarchical-single'`.
 */
export function isStructured(
  chunks: ReadonlyArray<{ metadata?: ChunkMetadata | undefined }>
): boolean {
  return chunks.some((chunk) => chunk.metadata?.chunkingMethod === 'structure-blocks');
}

/**
 * Untergrenze der Einbettungsstapel: `MistralEmbeddingClient` stapelt bei 16
 * Texten ODER 8000 geschätzten Token, je nachdem was zuerst greift
 * (MistralEmbeddingService/MistralEmbeddingClient.ts:85-97). Lange Chunks
 * erzeugen also mehr Stapel als diese Zahl, nie weniger.
 */
export const EMBEDDING_BATCH_SIZE = 16;

export interface RunSummary {
  documents: number;
  withFullText: number;
  withoutFullText: number;
  alreadyRechunked: number;
  fastPathSkipped: number;
  noChunks: number;
  processed: number;
  processedStructured: number;
  oldChunks: number;
  newChunks: number;
  chars: number;
  embeddingBatches: number;
  deleteCalls: number;
  /** processDocument ist geworfen — weder verarbeitet noch übersprungen. */
  errors: number;
}

export function summarizeOutcomes(outcomes: ReadonlyArray<DocumentOutcome>): RunSummary {
  const summary: RunSummary = {
    documents: outcomes.length,
    withFullText: 0,
    withoutFullText: 0,
    alreadyRechunked: 0,
    fastPathSkipped: 0,
    noChunks: 0,
    processed: 0,
    processedStructured: 0,
    oldChunks: 0,
    newChunks: 0,
    chars: 0,
    embeddingBatches: 0,
    deleteCalls: 0,
    errors: 0,
  };

  for (const outcome of outcomes) {
    if (outcome.skipped === 'error') {
      summary.errors++;
      continue;
    }
    if (outcome.skipped === 'no_full_text') {
      summary.withoutFullText++;
      continue;
    }
    summary.withFullText++;

    if (outcome.skipped === 'already_rechunked') {
      summary.alreadyRechunked++;
      continue;
    }
    if (outcome.skipped === 'fast_path') {
      summary.fastPathSkipped++;
      continue;
    }
    if (outcome.skipped === 'no_chunks') {
      summary.noChunks++;
      continue;
    }

    summary.processed++;
    if (outcome.structured) summary.processedStructured++;
    summary.oldChunks += outcome.oldChunks;
    summary.newChunks += outcome.newChunks;
    summary.chars += outcome.chars;
    summary.embeddingBatches += Math.ceil(outcome.newChunks / EMBEDDING_BATCH_SIZE);
    if (outcome.oldChunks > outcome.newChunks) summary.deleteCalls++;
  }

  return summary;
}

/**
 * Alles, was `processDocument` von aussen braucht. Als Abhängigkeitsobjekt und
 * nicht als direkter Client-Zugriff, damit der Test die Reihenfolge Upsert →
 * Löschen beweisen kann, ohne eine Qdrant-Instanz zu brauchen.
 */
export interface RechunkDeps {
  chunk(text: string, baseMetadata: Record<string, unknown>): Promise<Chunk[]>;
  embed(texts: string[]): Promise<number[][]>;
  quality(text: string): number;
  upsert(collection: string, points: RechunkPoint[]): Promise<void>;
  deletePoints(collection: string, ids: Array<string | number>): Promise<void>;
  /** Stempelt NUR den Kopf-Punkt mit `{ rechunked_at }`, nach dem Löschen. */
  setPayload(
    collection: string,
    pointId: string | number,
    payload: Record<string, unknown>
  ): Promise<void>;
  now(): string;
}

export interface DocumentGroup {
  /** Wert des `idKey`-Payloadfelds. */
  key: string;
  /** Payload des Kopf-Punkts (`chunk_index = 0`) — die einzige Quelle von `full_text`. */
  headPayload: Record<string, unknown>;
  /** IDs ALLER heute lebenden Punkte des Dokuments, Kopf eingeschlossen. */
  pointIds: Array<string | number>;
}

export interface RunOptions {
  dryRun: boolean;
  onlyStructured: boolean;
  resume: boolean;
}

/**
 * Wirft processDocument nach dem Upsert oder dem Löschen, trägt dieser Fehler
 * die bis dahin erreichten Zähler — sonst meldet der Bericht für ein
 * Dokument, das an setPayload scheiterte, `written: 0` obwohl der Upsert
 * längst geschrieben hat.
 */
export class RechunkWriteError extends Error {
  readonly written: number;
  readonly deleted: number;

  constructor(cause: unknown, counts: { written: number; deleted: number }) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
    this.name = 'RechunkWriteError';
    this.written = counts.written;
    this.deleted = counts.deleted;
  }
}

export async function processDocument(
  deps: RechunkDeps,
  collection: string,
  recipe: PointIdRecipe,
  doc: DocumentGroup,
  options: RunOptions
): Promise<DocumentOutcome> {
  const base: DocumentOutcome = {
    key: doc.key,
    skipped: null,
    structured: false,
    oldChunks: doc.pointIds.length,
    newChunks: 0,
    chars: 0,
    written: 0,
    deleted: 0,
  };

  const fullText = doc.headPayload.full_text;
  if (typeof fullText !== 'string' || fullText.trim().length === 0) {
    // Zählen und überspringen. NIE nachholen: der Rekonstruktions-Backfill aus
    // den chunk_text-Feldern liefert plattgedrückten Fließtext (Spec B.2) und
    // macht aus einem ehrlichen „nichts zu tun" einen teuren Leerlauf.
    return { ...base, skipped: 'no_full_text' };
  }

  if (options.resume && typeof doc.headPayload.rechunked_at === 'string') {
    return { ...base, skipped: 'already_rechunked' };
  }

  const title = typeof doc.headPayload.title === 'string' ? doc.headPayload.title : '';
  const chunks = await deps.chunk(fullText, {
    title,
    source: doc.headPayload.source ?? null,
    source_url: doc.headPayload.source_url ?? null,
  });

  if (chunks.length === 0) return { ...base, skipped: 'no_chunks' };

  const measured: DocumentOutcome = {
    ...base,
    structured: isStructured(chunks),
    newChunks: chunks.length,
    chars: fullText.length,
  };

  if (options.onlyStructured && !measured.structured) {
    return { ...measured, skipped: 'fast_path' };
  }
  if (options.dryRun) return measured;

  const embeddings = await deps.embed(buildEmbeddingTextsForChunks(chunks, title));
  if (embeddings.length !== chunks.length) {
    throw new Error(`embed returned ${embeddings.length} vectors for ${chunks.length} chunks`);
  }
  const now = deps.now();

  const points: RechunkPoint[] = chunks.map((chunk, index) => ({
    id: recipe.id(doc.key, index),
    vector: embeddings[index],
    payload: rebuildChunkPayload(doc.headPayload, chunk, {
      index,
      fullText,
      qualityScore: deps.quality(chunk.text),
      now,
    }),
  }));

  let written = 0;
  let deleted = 0;

  try {
    // UPSERT ZUERST. Die IDs sind deterministisch, der Upsert überschreibt die
    // alten Punkte 0 … min(n,m)-1 an Ort und Stelle; es entstehen keine Dubletten.
    for (const batch of upsertBatches(points)) {
      await deps.upsert(collection, batch);
      written += batch.length;
    }

    // LÖSCHEN DANACH, und nur was die neue Menge nicht abdeckt.
    const leftovers = leftoverPointIds(
      doc.pointIds,
      points.map((point) => point.id)
    );
    if (leftovers.length > 0) {
      await deps.deletePoints(collection, leftovers);
      deleted = leftovers.length;
    }

    // ERST NACH DEM LÖSCHEN den Kopf als „fertig" markieren. Wirft deletePoints,
    // läuft dieser Aufruf nie — genau der Punkt: ein halbfertiges Dokument darf
    // --resume nie als erledigt vortäuschen.
    await deps.setPayload(collection, recipe.id(doc.key, 0), { rechunked_at: now });
  } catch (error) {
    throw new RechunkWriteError(error, { written, deleted });
  }

  return { ...measured, written, deleted };
}

// =============================================================================
// I/O
// =============================================================================

const SCROLL_BATCH = 256;

type ScrollPage = {
  points: Array<{ id: string | number; payload?: Record<string, unknown> | null }>;
  next_page_offset?: string | number | null;
};

type ScrollingClient = {
  scroll(collection: string, params: Record<string, unknown>): Promise<ScrollPage>;
  delete(collection: string, params: Record<string, unknown>): Promise<unknown>;
};

async function scrollAll(
  client: ScrollingClient,
  collection: string,
  params: Record<string, unknown>
): Promise<Array<{ id: string | number; payload: Record<string, unknown> | null }>> {
  const all: Array<{ id: string | number; payload: Record<string, unknown> | null }> = [];
  await scrollEach(client, collection, params, async (points) => {
    all.push(...points);
  });
  return all;
}

/**
 * Wie `scrollAll`, aber ohne die Gesamtmenge zu materialisieren: jede Seite
 * geht durch `onPage` und wird danach freigegeben. Pass B scrollt die
 * Kopf-Punkte MIT vollem Payload — ~8000 Stück auf
 * `landesverbaende_documents`, jeder mit seinem `full_text`. `scrollAll`
 * hätte das für den ganzen Lauf im Speicher gehalten, obwohl nur je ein
 * Dokument gleichzeitig verarbeitet wird.
 */
export async function scrollEach(
  client: ScrollingClient,
  collection: string,
  params: Record<string, unknown>,
  onPage: (
    points: Array<{ id: string | number; payload: Record<string, unknown> | null }>
  ) => Promise<void | 'stop'>
): Promise<void> {
  let offset: string | number | null | undefined = undefined;

  for (;;) {
    const page = await client.scroll(collection, {
      ...params,
      limit: SCROLL_BATCH,
      with_vector: false,
      ...(offset != null && { offset }),
    });

    // `'stop'` beendet den Scroll, bevor die nächste Seite geholt wird —
    // sonst zöge `--limit 5` trotzdem jede Kopfseite der Sammlung übers Netz.
    const signal = await onPage(
      page.points.map((point) => ({
        id: point.id,
        payload: (point.payload as Record<string, unknown>) ?? null,
      }))
    );
    if (signal === 'stop') break;

    offset = page.next_page_offset ?? null;
    if (offset == null) break;
  }
}

function printReport(summary: RunSummary, options: RunOptions): void {
  console.log(
    `  Dokumente: ${summary.documents} · mit full_text: ${summary.withFullText} · ` +
      `ohne full_text: ${summary.withoutFullText} (übersprungen)`
  );
  if (summary.errors > 0) {
    console.log(`  Fehler (nicht verarbeitet, siehe stderr): ${summary.errors}`);
  }

  if (summary.withFullText === 0) {
    console.log('  Nichts zu tun.');
    return;
  }

  if (summary.alreadyRechunked > 0) {
    console.log(`  bereits neu geschnitten (--resume): ${summary.alreadyRechunked}`);
  }
  if (summary.noChunks > 0) {
    console.log(`  ohne Chunks (leerer full_text nach Bereinigung): ${summary.noChunks}`);
  }
  if (summary.fastPathSkipped > 0) {
    console.log(
      `  Fließtext-Schnellpfad, mit --only-structured übersprungen: ${summary.fastPathSkipped}`
    );
  }

  console.log(`  davon struktur-wirksam:       ${summary.processedStructured}`);
  console.log(
    `  davon Fließtext-Schnellpfad: ${summary.processed - summary.processedStructured}` +
      '  (Chunks byteweise unverändert)'
  );
  console.log(
    `  ${summary.processed} Dokumente · alt ${summary.oldChunks} → neu ${summary.newChunks} Chunks`
  );
  console.log(
    `  mindestens ${summary.embeddingBatches} Einbettungsstapel (16 Texte / 8000 Token) · ` +
      `${summary.chars.toLocaleString('de-DE')} Zeichen · ${summary.deleteCalls} Lösch-Aufrufe`
  );

  if (options.dryRun) {
    console.log('\n  (dry-run — kein Punkt geschrieben, keine Einbettung bezahlt)');
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const recipe = pointIdRecipeFor(args.collection);
  if (!recipe) {
    console.error(
      `[abort] ${args.collection}: kein nachgerechnetes ID-Rezept. Bekannt sind ` +
        'grundsatz_documents und landesverbaende_documents. Ein fremdes Rezept zu raten ' +
        'verdoppelt die Sammlung (siehe reprocess-pdfs.ts:303-306).'
    );
    process.exitCode = 1;
    return;
  }

  const { env } = await import('../config/env.js');
  const { createQdrantClient } = await import('../database/services/QdrantService/connection.js');
  const { batchUpsert, collectionSupportsBm25 } =
    await import('../database/services/QdrantService/operations/batchOperations.js');
  const { chunkQualityService } = await import('../services/ChunkQualityService/index.js');
  const { smartChunkDocument } = await import('../services/document-services/index.js');
  const { mistralEmbeddingService } = await import('../services/mistral/index.js');

  const client = createQdrantClient({
    url: env.QDRANT_URL ?? 'http://localhost:6333',
    apiKey: env.QDRANT_API_KEY ?? '',
    ...(env.QDRANT_BASIC_AUTH_USERNAME && { basicAuthUsername: env.QDRANT_BASIC_AUTH_USERNAME }),
    ...(env.QDRANT_BASIC_AUTH_PASSWORD && { basicAuthPassword: env.QDRANT_BASIC_AUTH_PASSWORD }),
  });

  // Vorbedingung 1: ohne den Sparse-Vektor bleibt jeder neue Punkt dicht-only,
  // und der Lauf müsste nach der BM25-Migration ein zweites Mal bezahlt werden.
  const hasBm25 = await collectionSupportsBm25(client, args.collection);
  console.log(`[${args.collection}]  bm25: ${hasBm25 ? 'JA' : 'NEIN'}`);
  const bm25 = checkBm25Precondition(args.collection, hasBm25, args.dryRun);
  if (bm25.log) {
    const prefix = bm25.log.level === 'error' ? '[abort]' : '[warnung]';
    (bm25.log.level === 'error' ? console.error : console.warn)(`${prefix} ${bm25.log.message}`);
  }
  if (!bm25.proceed) {
    process.exitCode = 1;
    return;
  }

  // Grenzstelle: das Skript braucht vom echten Client nur `scroll` und
  // `delete`, und der gemockte Client in den Tests implementiert genau diese
  // zwei Methoden — deshalb dieser enge Typ statt des vollen Qdrant-Clients.
  const scrolling = client as unknown as ScrollingClient;

  // Durchlauf A: jeder Punkt, aber nur mit zwei Payload-Feldern.
  const skeleton = await scrollAll(scrolling, args.collection, {
    with_payload: { include: [recipe.idKey, 'chunk_index'] },
  });

  // Vorbedingung 2: eine einzige Abweichung heisst, dass Upsert-zuerst
  // Dubletten erzeugen würde statt zu überschreiben.
  const check = checkIdRecipe(skeleton, recipe);
  console.log(`  ID-Rezept: ${check.matched}/${check.checked} bestätigt`);
  if (check.mismatches.length > 0) {
    console.error(
      `[abort] ${args.collection}: ${check.mismatches.length} Punkte folgen dem ID-Rezept nicht. ` +
        'Upsert-zuerst würde sie verdoppeln statt zu überschreiben. Erste Abweichungen:'
    );
    for (const mismatch of check.mismatches.slice(0, 5)) {
      console.error(
        `  id=${mismatch.id} key=${mismatch.key} chunk_index=${mismatch.chunkIndex} ` +
          `erwartet=${mismatch.expected} grund=${mismatch.reason}`
      );
    }
    process.exitCode = 1;
    return;
  }

  const idsByKey = new Map<string, Array<string | number>>();
  for (const point of skeleton) {
    const key = point.payload?.[recipe.idKey];
    if (typeof key !== 'string') continue;
    const list = idsByKey.get(key);
    if (list) list.push(point.id);
    else idsByKey.set(key, [point.id]);
  }

  const deps: RechunkDeps = {
    chunk: (text, baseMetadata) => smartChunkDocument(text, { baseMetadata }),
    embed: async (texts) => {
      await mistralEmbeddingService.init();
      return mistralEmbeddingService.generateBatchEmbeddings(texts);
    },
    quality: (text) => chunkQualityService.calculateQualityScore(text),
    // Über batchUpsert, NICHT über client.upsert: nur dieser Weg hängt den
    // BM25-Sparse-Vektor aus dem neuen chunk_text an (batchOperations.ts:110-111).
    upsert: async (collection, points) => {
      await batchUpsert(client, collection, points);
    },
    deletePoints: async (collection, ids) => {
      await scrolling.delete(collection, { points: ids, wait: true });
    },
    setPayload: async (collection, pointId, payload) => {
      await client.setPayload(collection, { points: [pointId], payload, wait: true });
    },
    now: () => new Date().toISOString(),
  };

  const options: RunOptions = {
    dryRun: args.dryRun,
    onlyStructured: args.onlyStructured,
    resume: args.resume,
  };

  const outcomes: DocumentOutcome[] = [];
  let processed = 0;

  // Durchlauf B: nur die Kopf-Punkte, dafür mit vollem Payload — Seite für
  // Seite verarbeitet, damit nie mehr als eine Seite `full_text` gleichzeitig
  // im Speicher liegt (siehe scrollEach-Kommentar).
  await scrollEach(
    scrolling,
    args.collection,
    { filter: { must: [{ key: 'chunk_index', match: { value: 0 } }] }, with_payload: true },
    async (heads) => {
      for (const head of heads) {
        if (processed >= args.limit) return 'stop';
        const key = head.payload?.[recipe.idKey];
        if (typeof key !== 'string') continue;

        try {
          const outcome = await processDocument(
            deps,
            args.collection,
            recipe,
            { key, headPayload: head.payload ?? {}, pointIds: idsByKey.get(key) ?? [head.id] },
            options
          );
          outcomes.push(outcome);
          if (outcome.skipped === null) processed++;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`[error] ${key}: ${message}`);
          process.exitCode = 1;
          const partial = error instanceof RechunkWriteError ? error : null;
          // Zählen, statt stillschweigend zu verschwinden: sonst unterschätzt der
          // Bericht seine eigene Dokumentenzahl gegenüber den gescannten Köpfen.
          outcomes.push({
            key,
            skipped: 'error',
            structured: false,
            oldChunks: (idsByKey.get(key) ?? [head.id]).length,
            newChunks: 0,
            chars: 0,
            written: partial?.written ?? 0,
            deleted: partial?.deleted ?? 0,
          });
        }
      }
    }
  );

  printReport(summarizeOutcomes(outcomes), options);
}

// Nur bei direktem Aufruf laufen — die reinen Funktionen oben sind für
// rechunk-from-fulltext.vitest.ts exportiert, und ein Import darf keinen
// CLI-Lauf, keinen Env-Parse und keine Qdrant-Verbindung auslösen.
if (process.argv[1] && import.meta.url.endsWith(basename(process.argv[1]))) {
  await main();
  // Explizit beenden: die dynamisch importierten Qdrant- und Redis-Clients
  // halten die Event-Loop offen (z. B. das geloggte "Erfolgreich mit Redis
  // verbunden"), egal ob main() über einen Abbruchpfad (process.exitCode = 1
  // + return) oder den Erfolgspfad zurückkehrt — beide laufen hier durch.
  // Ohne process.exit() hängt der Prozess, statt mit dem gesetzten Exit-Code
  // zu beenden.
  process.exit(process.exitCode ?? 0);
}
