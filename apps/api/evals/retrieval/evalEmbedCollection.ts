/**
 * Die reine Hälfte des Kopierers (`scripts/build-eval-embed-collection.ts`).
 *
 * Sie liegt hier und nicht im Skript, weil das Skript `dotenv` vor seinen
 * App-Importen fährt und beim Laden `main()` startet — ein Test, der es
 * importierte, ginge gegen Qdrant. Alles, was ohne Netz entschieden wird,
 * steht darum in diesem Modul: die Seitenplanung, die Form des kopierten
 * Punkts, und die Schranke vor `deleteCollection`.
 */
import {
  BM25_SPARSE_VECTOR_NAME,
  COLLECTION_SCHEMAS,
  getCollectionConfig,
  INDEX_TYPES,
} from '../../config/qdrantCollectionsSchema.js';
import {
  getSystemCollectionConfig,
  getSystemQdrantCollections,
} from '../../config/systemCollectionsConfig.js';

import { evalCandidatePrefix, isEvalEmbedCollection } from './embedCandidates.js';

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

/**
 * Nur Namen, die {@link isEvalEmbedCollection} annimmt — die einzige Schranke
 * zwischen `--delete` und der Produktion.
 *
 * Mit `slug` zusätzlich auf EINEN Kandidaten eingeengt. Das ist kein Komfort:
 * ein Aufräumen nach dem ersten Kandidaten würde sonst die Sammlungen eines
 * zweiten mitnehmen, der gerade gemessen wird, und der Lauf fiele mit leeren
 * Trefferlisten auf, die wie ein Modellbefund aussehen.
 */
export function guardDelete(names: readonly string[], slug: string | null = null): string[] {
  const prefix = slug === null ? null : evalCandidatePrefix(slug);
  return names.filter(
    (name) => isEvalEmbedCollection(name) && (prefix === null || name.startsWith(prefix))
  );
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
  deleteFn: (name: string) => Promise<unknown>,
  slug: string | null = null
): Promise<string[]> {
  const deletable = guardDelete(names, slug);
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

/**
 * Die Quellsammlungen eines Bau-Laufs — als System-Kennung
 * (`grundsatz-system`) oder als physischer Name (`grundsatz_documents`).
 *
 * Die Positivliste ist `getSystemQdrantCollections()`, und das ist eine
 * Sicherheitsschranke, keine Bequemlichkeit: `documents` und `user_knowledge`
 * tragen NUTZERINHALTE. Sie stehen nicht in der Liste, ein Tippfehler oder ein
 * kopierter Befehl kann sie also nicht in eine Wegwerf-Sammlung kopieren — und
 * damit auch nicht in eine Kopie, die niemand aufräumt und die keine
 * Zugriffskontrolle kennt.
 */
export function resolveSourceCollections(names: readonly string[]): string[] {
  const allowed = [...new Set(getSystemQdrantCollections())];
  const allowedSet = new Set(allowed);
  return names.map((name) => {
    const physical = getSystemCollectionConfig(name)?.qdrantCollection ?? name;
    if (!allowedSet.has(physical)) {
      throw new Error(
        `"${name}" is not an allowed source collection. ` +
          `Only system collections can be copied (user content must never be). ` +
          `Allowed: ${allowed.join(', ')}`
      );
    }
    return physical;
  });
}

/** Was die Wegwerf-Sammlung anlegt — nur die zwei Aufrufe, die dafür nötig
 *  sind, damit der Test sie ohne Qdrant mitschreiben kann. */
export interface TargetCollectionWriter {
  createCollection: (name: string, config: Record<string, unknown>) => Promise<unknown>;
  createPayloadIndex: (
    name: string,
    params: { field_name: string; field_schema: Record<string, unknown> }
  ) => Promise<unknown>;
}

/**
 * Die Anlage-Konfiguration der Wegwerf-Sammlung.
 *
 * `withSparse` ist der Grund, warum das eine eigene Funktion ist:
 * `getCollectionConfig` deklariert IMMER den `bm25`-Sparse-Vektor. Auf einer
 * Quelle ohne Sparse-Vektor legte die Kopie damit einen an — und
 * `collectionSupportsBm25` schickt eine Sammlung, die ihn deklariert, über den
 * server-seitigen Fusions-Pfad. Der Kandidat würde dann gegen eine ANDERE
 * Fusion gemessen als die Basis, und der Unterschied stünde in der Tabelle als
 * Modellbefund. Deshalb wird er hier entfernt, wenn die Quelle keinen führt.
 */
export function buildTargetConfig(
  dims: number,
  source: string,
  withSparse: boolean
): Record<string, unknown> {
  const schema = COLLECTION_SCHEMAS[source];
  const config: Record<string, unknown> = schema
    ? { ...getCollectionConfig(dims, schema) }
    : { vectors: { size: dims, distance: 'Cosine' } };
  if (withSparse) {
    config.sparse_vectors = { [BM25_SPARSE_VECTOR_NAME]: { modifier: 'idf' } };
  } else {
    delete config.sparse_vectors;
  }
  return config;
}

/**
 * Legt die Wegwerf-Sammlung an: gleiche Dimension wie der Kandidat, Cosine,
 * dieselben Payload-Indexe wie die Quelle.
 *
 * NICHT nachgebaut werden die `TEXT_SEARCH_INDEXES` — siehe den Kopfkommentar
 * von `scripts/build-eval-embed-collection.ts`.
 */
export async function createTargetCollection(
  writer: TargetCollectionWriter,
  target: string,
  source: string,
  dims: number,
  withSparse: boolean,
  warn: (message: string) => void = console.warn
): Promise<void> {
  const schema = COLLECTION_SCHEMAS[source];
  if (!schema) {
    warn(`  ${source} has no entry in COLLECTION_SCHEMAS — creating ${target} without indexes`);
  }
  await writer.createCollection(target, buildTargetConfig(dims, source, withSparse));

  for (const index of schema?.indexes ?? []) {
    try {
      await writer.createPayloadIndex(target, {
        field_name: index.field,
        field_schema: INDEX_TYPES[index.type] as unknown as Record<string, unknown>,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('already exists')) {
        warn(`  index ${index.field} on ${target} failed: ${message}`);
      }
    }
  }
}
