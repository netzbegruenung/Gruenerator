/**
 * Die reine Hälfte des Kopierers (`scripts/build-eval-embed-collection.ts`).
 *
 * Sie liegt hier und nicht im Skript, weil das Skript `dotenv` vor seinen
 * App-Importen fährt und beim Laden `main()` startet — ein Test, der es
 * importierte, ginge gegen Qdrant. Alles, was ohne Netz entschieden wird,
 * steht darum in diesem Modul: die Seitenplanung, die Form des kopierten
 * Punkts, und die Schranke vor `deleteCollection`.
 */
import { BM25_SPARSE_VECTOR_NAME } from '../../config/qdrantCollectionsSchema.js';

import { isEvalEmbedCollection } from './embedCandidates.js';

/** Punkte je Scroll-Seite. Payload-only, deshalb grösser als der Schreibstapel. */
export const SCROLL_PAGE = 256;

/** Punkte je Upsert. Dieselbe Zahl wie in `scripts/migrate-bm25-sparse.ts`: der
 *  Reverse-Proxy vor Qdrant hat bei mehr schon mit 413 geantwortet. */
export const UPSERT_BATCH = 16;

/** Wie lange eine Wegwerf-Sammlung als frisch gilt. Steht als
 *  `eval_expires_at` in jeder Payload, damit ein vergessener Aufbau von aussen
 *  als vergessen erkennbar ist — Qdrant räumt nicht selbst auf. */
export const EVAL_TTL_DAYS = 7;

/**
 * Die Seitengrössen eines begrenzten Laufs, oder `null` für "bis Qdrant
 * ausgeht".
 *
 * `--limit` ist die Zahl, mit der ein Probelauf gegen echte Kosten gefahren
 * wird; ohne diese Aufteilung holte die letzte Seite mehr Punkte als erlaubt —
 * und bettete sie auch ein, denn bezahlt wird vor dem Verwerfen.
 */
export function planPages(limit: number | null, pageSize: number = SCROLL_PAGE): number[] | null {
  if (pageSize < 1) throw new Error(`planPages: pageSize must be >= 1, got ${pageSize}`);
  if (limit === null) return null;
  if (!Number.isInteger(limit) || limit < 0) {
    throw new Error(`planPages: limit must be a non-negative integer, got ${limit}`);
  }
  const pages: number[] = [];
  let remaining = limit;
  while (remaining > 0) {
    const page = Math.min(pageSize, remaining);
    pages.push(page);
    remaining -= page;
  }
  return pages;
}

export interface SourcePoint {
  id: string | number;
  payload?: Record<string, unknown> | null | undefined;
  /** Nur der Sparse-Vektor, wenn die Quelle einen führt — der dichte wird gar
   *  nicht erst angefordert. */
  vector?: unknown;
}

/**
 * Der Text, der neu eingebettet wird.
 *
 * `chunk_text` ist das Feld, das die Suche liest (`buildChunkPayloadFields` in
 * searchOperations.ts); `content` ist der Rückfall für ältere Punkte. Ein Punkt
 * ohne beides bekommt keinen Vektor — er wäre sonst ein Zufallstreffer im
 * Vergleich.
 */
export function pointText(payload: Record<string, unknown> | null | undefined): string | null {
  const chunkText = payload?.chunk_text;
  if (typeof chunkText === 'string' && chunkText.trim().length > 0) return chunkText;
  const content = payload?.content;
  if (typeof content === 'string' && content.trim().length > 0) return content;
  return null;
}

export interface EvalPoint {
  id: string | number;
  vector: Record<string, unknown>;
  payload: Record<string, unknown>;
}

/**
 * Ein Quellpunkt plus neuem dichten Vektor.
 *
 * Der dichte Vektor bleibt unbenannt (`''`) wie in der Produktion; der
 * Sparse-Vektor wird nur übernommen, wenn der Quellpunkt einen mitbrachte. Die
 * Payload reist unverändert mit — die Eval-Fälle erkennen ihre Gold-Dokumente
 * daran — plus `eval_expires_at`.
 */
export function toEvalPoint(point: SourcePoint, vector: number[], expiresAt: string): EvalPoint {
  const named: Record<string, unknown> = { '': vector };
  const sourceVectors = point.vector;
  if (
    sourceVectors !== null &&
    typeof sourceVectors === 'object' &&
    !Array.isArray(sourceVectors)
  ) {
    const sparse = (sourceVectors as Record<string, unknown>)[BM25_SPARSE_VECTOR_NAME];
    if (sparse !== undefined && sparse !== null) named[BM25_SPARSE_VECTOR_NAME] = sparse;
  }
  return {
    id: point.id,
    vector: named,
    payload: { ...(point.payload ?? {}), eval_expires_at: expiresAt },
  };
}

/** Nur Namen, die {@link isEvalEmbedCollection} annimmt. Die einzige Schranke
 *  zwischen `--delete` und der Produktion. */
export function guardDelete(names: readonly string[]): string[] {
  return names.filter((name) => isEvalEmbedCollection(name));
}

/**
 * Löscht die Wegwerf-Sammlungen und nur die.
 *
 * `deleteFn` ist ein Argument, damit der Test belegen kann, dass ein
 * Produktionsname sie nie ERREICHT — nicht bloss, dass `guardDelete` ihn
 * herausfiltert. Die zweite Prüfung in der Schleife ist Absicht: wer
 * `guardDelete` je durch etwas Grosszügigeres ersetzt, muss zwei Stellen
 * ändern, nicht eine.
 */
export async function deleteEvalCollections(
  names: readonly string[],
  deleteFn: (name: string) => Promise<unknown>
): Promise<string[]> {
  const deletable = guardDelete(names);
  for (const name of deletable) {
    if (!isEvalEmbedCollection(name)) {
      throw new Error(`refusing to delete "${name}": not an eval collection`);
    }
    await deleteFn(name);
  }
  return deletable;
}

export function expiresAtIso(now: Date = new Date(), days: number = EVAL_TTL_DAYS): string {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}
