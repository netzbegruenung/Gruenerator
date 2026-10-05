/**
 * Ein Quelldokument aus mehreren Einheiten (Reden eines Protokolls, Abschnitte
 * einer Drucksache, Teile eines Gegenstands) in Qdrant schreiben: jede Einheit
 * läuft durch `smartChunkDocument`, wird mit Titel und Überschriftenpfad
 * eingebettet, und die Punkte ersetzen alles, was unter derselben `parent_id`
 * lag — die Zahl der Einheiten und Chunks kann sich zwischen zwei Fassungen
 * ändern.
 *
 * Die Einheit und nicht das Quelldokument trägt die `document_id`: die
 * Facetten zählen nur Punkte mit `chunk_index = 0` (`getFacetCountFilter`).
 */
import { batchUpsert } from '../../../database/services/QdrantService/operations/batchOperations.js';
import { chunkQualityService } from '../../ChunkQualityService/index.js';
import {
  buildEmbeddingText,
  embeddingPayload,
  offsetPayload,
  smartChunkDocument,
  structurePayload,
} from '../../document-services/index.js';
import { mistralEmbeddingService } from '../../mistral/index.js';

import type { QdrantClient } from '@qdrant/js-client-rest';

const EMBED_BATCH = 50;
// Der Qdrant-Proxy lehnt große Bodies mit 413 ab. Ein 1024-dim-Vektor sind
// ~15 KB JSON, ein Kopf-Chunk trägt zusätzlich `full_text` der Einheit.
const UPSERT_MAX_POINTS = 10;
const UPSERT_MAX_CHARS = 300_000;
const VECTOR_JSON_CHARS = 15_000;
const FULL_TEXT_MAX_CHARS = 250_000;

export interface ParentUnit {
  documentId: string;
  title: string;
  headingPath: string[];
  text: string;
  sourceUrl: string;
  /** Facetten- und Anzeigefelder, die in jedem Punkt der Einheit stehen. */
  payload: Record<string, unknown>;
}

export interface ParentDoc {
  parentId: string;
  units: ParentUnit[];
}

export interface ParentStoreConfig {
  collection: string;
  source: string;
  pointId: (documentId: string, chunkIndex: number) => string;
  /**
   * Payload-Schlüssel, an denen der Scraper ein unverändertes Dokument erkennt
   * (`content_hash`, `row_hash`). Sie werden erst gesetzt, wenn alle Punkte
   * stehen — bis dahin sind sie `null`, und ein abgebrochenes Schreiben gilt
   * beim nächsten Lauf als unbekannt statt als fertig.
   */
  commitKeys: readonly string[];
}

export interface PreparedPoint {
  id: string;
  embedText: string;
  payload: Record<string, unknown>;
}

export async function prepareParentPoints(
  config: ParentStoreConfig,
  parent: ParentDoc
): Promise<PreparedPoint[]> {
  const indexedAt = new Date().toISOString();
  const points: PreparedPoint[] = [];
  for (const unit of parent.units) {
    const chunks = await smartChunkDocument(unit.text, {
      baseMetadata: { title: unit.title, source: config.source, source_url: unit.sourceUrl },
    });
    chunks.forEach((chunk, chunkIndex) => {
      const structure = structurePayload(chunk);
      // Der Chunker sieht nur den Text der Einheit; ihr Pfad kommt von außen,
      // Gliederungsüberschriften darin (`# I. …`) hängt er an.
      const headingPath = [...unit.headingPath, ...(structure.heading_path ?? [])];
      points.push({
        id: config.pointId(unit.documentId, chunkIndex),
        embedText: buildEmbeddingText(chunk.text, unit.title, headingPath),
        payload: {
          ...unit.payload,
          document_id: unit.documentId,
          parent_id: parent.parentId,
          title: unit.title,
          source_url: unit.sourceUrl,
          source: config.source,
          ...structure,
          heading_path: headingPath,
          heading: headingPath.at(-1) ?? null,
          ...embeddingPayload(),
          ...offsetPayload(chunk),
          chunk_index: chunkIndex,
          chunk_text: chunk.text,
          quality_score: chunkQualityService.calculateQualityScore(chunk.text),
          indexed_at: indexedAt,
          // Darüber setzt der Quellen-Leser den Text aus den Chunks zusammen.
          ...(chunkIndex === 0 && unit.text.length <= FULL_TEXT_MAX_CHARS
            ? { full_text: unit.text }
            : {}),
        },
      });
    });
  }
  return points;
}

/**
 * Ersetzt alle Punkte des Quelldokuments. Erst schreiben, dann die übrig
 * gebliebenen alten Punkte löschen — nie umgekehrt: ein Abbruch dazwischen
 * hinterließe sonst ein Dokument ohne Punkte. Die `commitKeys` stehen davor
 * auf `null` und werden als Letztes gesetzt; ein Abbruch irgendwo dazwischen
 * hinterlässt so ein Dokument, das der nächste Lauf neu liest.
 */
export async function writeParent(
  client: QdrantClient,
  config: ParentStoreConfig,
  parent: ParentDoc
): Promise<number> {
  const prepared = await prepareParentPoints(config, parent);
  const vectors: number[][] = [];
  for (let i = 0; i < prepared.length; i += EMBED_BATCH) {
    const batch = prepared.slice(i, i + EMBED_BATCH).map((p) => p.embedText);
    vectors.push(...(await mistralEmbeddingService.generateBatchEmbeddings(batch)));
  }

  const byParent = { must: [{ key: 'parent_id', match: { value: parent.parentId } }] };
  const commit = Object.fromEntries(
    config.commitKeys.map((key) => [key, prepared[0]?.payload[key] ?? null])
  );
  const pending = Object.fromEntries(config.commitKeys.map((key) => [key, null]));

  const previous = await pointIdsOf(client, config.collection, parent.parentId);
  if (previous.length > 0 && config.commitKeys.length > 0) {
    await client.setPayload(config.collection, { payload: pending, filter: byParent, wait: true });
  }
  const points = prepared.map((p, i) => ({
    id: p.id,
    vector: vectors[i],
    payload: { ...p.payload, ...pending },
  }));
  for (const batch of upsertBatches(points)) await batchUpsert(client, config.collection, batch);

  const current = new Set(prepared.map((p) => p.id));
  const stale = previous.filter((id) => !current.has(String(id)));
  if (stale.length > 0) await client.delete(config.collection, { points: stale, wait: true });
  if (config.commitKeys.length > 0) {
    await client.setPayload(config.collection, { payload: commit, filter: byParent, wait: true });
  }
  return prepared.length;
}

/** Teilt nach Punktzahl UND geschätzter Body-Größe; ein übergroßer Punkt geht allein. */
export function upsertBatches<T extends { payload: Record<string, unknown> }>(points: T[]): T[][] {
  const batches: T[][] = [];
  let current: T[] = [];
  let chars = 0;
  for (const point of points) {
    const size = JSON.stringify(point.payload).length + VECTOR_JSON_CHARS;
    if (
      current.length > 0 &&
      (current.length >= UPSERT_MAX_POINTS || chars + size > UPSERT_MAX_CHARS)
    ) {
      batches.push(current);
      current = [];
      chars = 0;
    }
    current.push(point);
    chars += size;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

async function pointIdsOf(
  client: QdrantClient,
  collection: string,
  parentId: string
): Promise<Array<string | number>> {
  const ids: Array<string | number> = [];
  let offset: string | number | undefined;
  for (;;) {
    const page = await client.scroll(collection, {
      filter: { must: [{ key: 'parent_id', match: { value: parentId } }] },
      limit: 1000,
      with_payload: false,
      with_vector: false,
      ...(offset !== undefined ? { offset } : {}),
    });
    ids.push(...page.points.map((p) => p.id));
    const next = page.next_page_offset;
    if (typeof next !== 'string' && typeof next !== 'number') return ids;
    offset = next;
  }
}
