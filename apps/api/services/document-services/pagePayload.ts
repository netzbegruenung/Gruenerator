/**
 * Die Seitenzahl eines Chunks als Qdrant-Payload — ein Helfer wie
 * `structurePayload` und `offsetPayload`, damit die Upsert-Stellen nicht
 * auseinanderdriften.
 *
 * Gesetzt ist sie nur, wenn der extrahierte Text `## Seite N`-Marken trug
 * (siehe `OcrService/pageMarkers.ts`); für alles andere `null`. Die Leseseite
 * (`getDocumentChunks` → `pageNumber`, `pickRange` `seite`, Zitat „Seite X")
 * liest das Feld schon und leuchtet damit von selbst auf.
 */

import { type ChunkMetadata } from './TextChunker/types.js';

export interface ChunkPagePayload {
  page_number: number | null;
}

export function pagePayload(chunk: { metadata?: ChunkMetadata | undefined }): ChunkPagePayload {
  const page = chunk.metadata?.page_number;
  return {
    page_number: typeof page === 'number' && Number.isInteger(page) && page > 0 ? page : null,
  };
}
