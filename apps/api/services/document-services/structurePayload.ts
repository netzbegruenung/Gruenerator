/**
 * Die vier Strukturfelder eines Chunks als Qdrant-Payload.
 *
 * Ein Helfer und kein wiederholtes Objektliteral, weil neun Upsert-Stellen ihn
 * spreizen und sie sonst auseinanderdriften — genau die Ausfallart, gegen die
 * `buildChunkPayloadFields` auf der Leseseite gebaut wurde.
 *
 * Die Rückgabe hat IMMER alle vier Schlüssel; nie `undefined`. Ein Chunk ohne
 * Struktur (Fließtext, alter Bestand) trägt `null` bzw. `'text'`.
 */

import { type ChunkMetadata } from './TextChunker/types.js';

export interface ChunkStructurePayload {
  heading_path: string[] | null;
  heading: string | null;
  chunk_type: 'text' | 'table';
  section_index: number | null;
}

export function structurePayload(chunk: {
  metadata?: ChunkMetadata | undefined;
}): ChunkStructurePayload {
  const meta = chunk.metadata ?? {};

  const path = Array.isArray(meta.headingPath)
    ? meta.headingPath.filter((h): h is string => typeof h === 'string' && h.trim().length > 0)
    : [];

  const heading =
    typeof meta.heading === 'string' && meta.heading.trim().length > 0
      ? meta.heading
      : (path.at(-1) ?? null);

  return {
    heading_path: path.length > 0 ? path : null,
    heading,
    // Nur der Block-Segmenter schreibt `'table'`. Die sechs Werte des toten
    // hierarchischen Chunkers (`detectChunkType`) fallen bewusst auf `'text'`.
    chunk_type: meta.chunkType === 'table' ? 'table' : 'text',
    section_index: typeof meta.sectionIndex === 'number' ? meta.sectionIndex : null,
  };
}
