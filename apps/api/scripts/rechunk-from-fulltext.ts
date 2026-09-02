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
