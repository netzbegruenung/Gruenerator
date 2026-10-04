/**
 * Ein DIP-Dokument (`DipParent`) in Qdrant schreiben: jede Einheit läuft durch
 * `smartChunkDocument`, wird mit Titel und Überschriftenpfad eingebettet, und
 * die Punkte ersetzen alles, was unter derselben `parent_id` lag — die Zahl der
 * Einheiten und Chunks kann sich zwischen zwei Fassungen ändern.
 */
import { batchUpsert } from '../../../../database/services/QdrantService/operations/batchOperations.js';
import { chunkQualityService } from '../../../ChunkQualityService/index.js';
import {
  buildEmbeddingText,
  embeddingPayload,
  offsetPayload,
  smartChunkDocument,
  structurePayload,
} from '../../../document-services/index.js';
import { mistralEmbeddingService } from '../../../mistral/index.js';

import { dipPointId, unitPayload, type DipParent } from './builders.js';

import type { QdrantClient } from '@qdrant/js-client-rest';

export const DIP_COLLECTION = 'bundestag_dip_documents';

const EMBED_BATCH = 50;
// Der Qdrant-Proxy lehnt große Bodies mit 413 ab. Ein 1024-dim-Vektor sind
// ~15 KB JSON, ein Kopf-Chunk trägt zusätzlich `full_text` der Einheit.
const UPSERT_MAX_POINTS = 10;
const UPSERT_MAX_CHARS = 300_000;
const VECTOR_JSON_CHARS = 15_000;
const FULL_TEXT_MAX_CHARS = 250_000;

export interface PreparedPoint {
  id: string;
  embedText: string;
  payload: Record<string, unknown>;
}

export async function prepareParentPoints(parent: DipParent): Promise<PreparedPoint[]> {
  const indexedAt = new Date().toISOString();
  const points: PreparedPoint[] = [];
  for (const unit of parent.units) {
    const chunks = await smartChunkDocument(unit.text, {
      baseMetadata: { title: unit.title, source: 'bundestag-dip', source_url: unit.sourceUrl },
    });
    const base = unitPayload(unit, parent);
    chunks.forEach((chunk, chunkIndex) => {
      const structure = structurePayload(chunk);
      // Der Chunker sieht nur den Text der Einheit; ihr Pfad kommt von außen,
      // Gliederungsüberschriften darin (`# I. …`) hängt er an.
      const headingPath = [...unit.headingPath, ...(structure.heading_path ?? [])];
      points.push({
        id: dipPointId(unit.documentId, chunkIndex),
        embedText: buildEmbeddingText(chunk.text, unit.title, headingPath),
        payload: {
          ...base,
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
 * Ersetzt alle Punkte des Dokuments. Erst schreiben, dann die übrig gebliebenen
 * alten Punkte löschen — nie umgekehrt: ein Abbruch dazwischen hinterließe sonst
 * ein Dokument ohne Punkte, und liegt es außerhalb des Aktualisierungsfensters,
 * holt der Scraper es nicht wieder.
 */
export async function writeParent(client: QdrantClient, parent: DipParent): Promise<number> {
  const prepared = await prepareParentPoints(parent);
  const vectors: number[][] = [];
  for (let i = 0; i < prepared.length; i += EMBED_BATCH) {
    const batch = prepared.slice(i, i + EMBED_BATCH).map((p) => p.embedText);
    vectors.push(...(await mistralEmbeddingService.generateBatchEmbeddings(batch)));
  }

  const previous = await pointIdsOf(client, parent.parentId);
  const points = prepared.map((p, i) => ({ id: p.id, vector: vectors[i], payload: p.payload }));
  for (const batch of upsertBatches(points)) await batchUpsert(client, DIP_COLLECTION, batch);

  const current = new Set(prepared.map((p) => p.id));
  const stale = previous.filter((id) => !current.has(String(id)));
  if (stale.length > 0) await client.delete(DIP_COLLECTION, { points: stale, wait: true });
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

async function pointIdsOf(client: QdrantClient, parentId: string): Promise<Array<string | number>> {
  const ids: Array<string | number> = [];
  let offset: string | number | undefined;
  for (;;) {
    const page = await client.scroll(DIP_COLLECTION, {
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
