/**
 * useChunkInspectorTyped — typisierte ts-rest-Hüllen für den Chunk-Inspektor.
 * Wirft bei allem ausser 200, damit TanStack Query es als Fehler zeigt.
 */
import { type InspectDocumentResponse, type InspectSearchResponse } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';

export async function fetchDocumentChunks(
  documentId: string,
  collection: string,
  offset: number,
  limit: number
): Promise<InspectDocumentResponse> {
  const client = getContractsClient();
  const result = await client.chunkInspector.inspectDocument({
    params: { documentId },
    query: { collection, offset, limit },
  });
  if (result.status !== 200) {
    throw new Error(`Chunk-Inspektor: Chunks konnten nicht geladen werden (HTTP ${result.status})`);
  }
  return result.body;
}

export async function fetchChunkSearch(
  documentId: string,
  collection: string,
  query: string
): Promise<InspectSearchResponse> {
  const client = getContractsClient();
  const result = await client.chunkInspector.inspectSearch({
    params: { documentId },
    query: { collection, query },
  });
  if (result.status !== 200) {
    throw new Error(`Chunk-Inspektor: Die Suche ist fehlgeschlagen (HTTP ${result.status})`);
  }
  return result.body;
}
