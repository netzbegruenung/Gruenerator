import { useQuery } from '@tanstack/react-query';

import { fetchChunkSearch, fetchDocumentChunks } from '../../../hooks/useChunkInspectorTyped';

/** Eine Seite der Chunk-Liste; deckungsgleich mit der Vorgabe im Vertrag. */
export const CHUNK_PAGE_SIZE = 50;

export function useDocumentChunks(documentId: string, collection: string, offset: number) {
  return useQuery({
    queryKey: ['chunk-inspector', documentId, collection, offset],
    queryFn: () => fetchDocumentChunks(documentId, collection, offset, CHUNK_PAGE_SIZE),
    staleTime: 30_000,
    enabled: documentId.length > 0 && collection.length > 0,
  });
}

export function useChunkSearch(documentId: string, collection: string, query: string) {
  return useQuery({
    queryKey: ['chunk-inspector-search', documentId, collection, query],
    queryFn: () => fetchChunkSearch(documentId, collection, query),
    staleTime: 30_000,
    enabled: query.length >= 2,
  });
}
