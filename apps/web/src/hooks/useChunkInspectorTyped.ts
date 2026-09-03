/**
 * useChunkInspectorTyped — typisierte ts-rest-Hüllen für den Chunk-Inspektor.
 * Wirft bei allem ausser 200, damit TanStack Query es als Fehler zeigt — mit
 * einer pro Status passenden Meldung statt einer einzigen generischen.
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
  // documentId kann eine Quell-URL sein (gescrapte Sammlungen) — und eine URL
  // überlebt den Pfad nicht: der Reverse-Proxy dekodiert %2F und merged
  // Slashes, bevor Express routet. URL-förmige IDs reisen deshalb im
  // Query-String, der Pfad trägt den Platzhalter '-'.
  const isUrlId = /^https?:\/\//.test(documentId);
  const result = await client.chunkInspector.inspectDocument({
    params: { documentId: isUrlId ? '-' : encodeURIComponent(documentId) },
    query: { collection, offset, limit, ...(isUrlId ? { documentId } : {}) },
  });
  // 403 nennt den Grund direkt statt der immer gleichen Server-Meldung. 404
  // gibt die Server-Meldung weiter (z.B. „Keine Chunks gefunden."), sie ist
  // dokumentspezifisch. Alles andere bleibt generisch mit dem HTTP-Status.
  if (result.status === 403) {
    throw new Error('Kein Zugriff (Instanz-Admin erforderlich)');
  }
  if (result.status === 404) {
    throw new Error(result.body.message);
  }
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
  // s.o.: URL-förmige IDs reisen im Query-String, Pfad trägt '-'.
  const isUrlId = /^https?:\/\//.test(documentId);
  const result = await client.chunkInspector.inspectSearch({
    params: { documentId: isUrlId ? '-' : encodeURIComponent(documentId) },
    query: { collection, query, ...(isUrlId ? { documentId } : {}) },
  });
  if (result.status === 403) {
    throw new Error('Kein Zugriff (Instanz-Admin erforderlich)');
  }
  if (result.status === 404) {
    throw new Error(result.body.message);
  }
  if (result.status !== 200) {
    throw new Error(`Chunk-Inspektor: Die Suche ist fehlgeschlagen (HTTP ${result.status})`);
  }
  return result.body;
}
