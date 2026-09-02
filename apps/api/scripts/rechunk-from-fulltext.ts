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
import { generatePointId, stringToNumericHash } from '../utils/validation/hash.js';

import { type Chunk, type ChunkMetadata } from '../services/document-services/TextChunker/types.js';

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
        collection = argv[++i] ?? null;
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
      case '--limit':
        limit = Number.parseInt(argv[++i] ?? '', 10) || Infinity;
        break;
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
    default:
      return null;
  }
}

export interface IdRecipeMismatch {
  id: string | number;
  key: string;
  chunkIndex: number;
  expected: number;
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
      });
      continue;
    }

    const expected = recipe.id(key, chunkIndex);
    if (point.id === expected) {
      matched++;
    } else {
      mismatches.push({ id: point.id, key, chunkIndex, expected });
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
    rechunked_at: ctx.now,
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

export type SkipReason = 'no_full_text' | 'fast_path' | 'no_chunks' | 'already_rechunked';

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
  };

  for (const outcome of outcomes) {
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

  // UPSERT ZUERST. Die IDs sind deterministisch, der Upsert überschreibt die
  // alten Punkte 0 … min(n,m)-1 an Ort und Stelle; es entstehen keine Dubletten.
  for (const batch of upsertBatches(points)) {
    await deps.upsert(collection, batch);
  }

  // LÖSCHEN DANACH, und nur was die neue Menge nicht abdeckt.
  const leftovers = leftoverPointIds(
    doc.pointIds,
    points.map((point) => point.id)
  );
  if (leftovers.length > 0) {
    await deps.deletePoints(collection, leftovers);
  }

  return { ...measured, written: points.length, deleted: leftovers.length };
}
