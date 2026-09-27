/**
 * Die Zeichen-Offsets eines Chunks im Quelldokument als Qdrant-Payload.
 *
 * Ein Helfer und kein wiederholtes Objektliteral, aus demselben Grund wie
 * `structurePayload` und `embeddingPayload`: dieselben fünfzehn Upsert-Stellen
 * spreizen ihn, und sie auseinanderdriften zu lassen ist genau die Ausfallart,
 * gegen die `buildChunkPayloadFields` auf der Leseseite gebaut wurde.
 *
 * NUR EIN VOLLSTÄNDIGES PAAR ZÄHLT. Ein halbes Offset — Anfang ohne Ende, oder
 * ein Ende vor dem Anfang — wäre für eine Sprungmarke schlimmer als gar keins,
 * weil sie ihm glauben und irgendwohin springen würde. Deshalb prüft der
 * Helfer das Paar und gibt im Zweifel zweimal `null` zurück.
 *
 * `null` heißt „nicht auffindbar", nicht „kaputt": ein Chunk vor #3223 trägt
 * die Felder gar nicht, und ein Tabellen-Teilstück mit wiederholter Kopfzeile
 * ist im Rohtext bauartbedingt nicht zusammenhängend zu finden (siehe
 * `TextChunker/sourceOffsets.ts`). Dieselbe Lesart wie ein PDF-Punkt ohne
 * gespeicherten `file_hash`.
 */

import { type ChunkMetadata } from './TextChunker/types.js';

export interface ChunkOffsetPayload {
  /** Erstes Zeichen im Quelltext, inklusiv. */
  char_start: number | null;
  /** Hinter dem letzten Zeichen im Quelltext, exklusiv. */
  char_end: number | null;
}

export function offsetPayload(chunk: { metadata?: ChunkMetadata | undefined }): ChunkOffsetPayload {
  const meta = chunk.metadata ?? {};
  const start = meta.startPosition;
  const end = meta.endPosition;

  if (typeof start !== 'number' || typeof end !== 'number') {
    return { char_start: null, char_end: null };
  }
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start) {
    return { char_start: null, char_end: null };
  }

  return { char_start: start, char_end: end };
}
