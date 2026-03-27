import type { Citation as ChatCitation } from '../hooks/useChatGraphStream';

/**
 * Maps raw snake_case notebook citations (unknown[]) to the standardized ChatCitation format.
 * Also used as a backward-compat fallback for old stored messages that lack pre-mapped citations.
 */
export function mapRawCitationsToChat(raw: unknown[]): ChatCitation[] {
  return raw
    .filter((c): c is Record<string, unknown> => c != null && typeof c === 'object' && 'index' in c)
    .map((c) => ({
      id: parseInt(String(c.index), 10),
      title: (c.document_title as string) ?? '',
      url: (c.source_url as string) ?? '',
      snippet: (c.cited_text as string) ?? '',
      citedText: c.cited_text as string | undefined,
      source: (c.collection_name as string) ?? '',
      collectionName: c.collection_name as string | undefined,
      documentId: c.document_id as string | undefined,
      chunkIndex: c.chunk_index as number | undefined,
      similarityScore: c.similarity_score as number | undefined,
      collectionId: c.collection_id as string | undefined,
    }));
}

/**
 * Resolves citations from metadata with backward-compat fallbacks.
 * Priority: citations (pre-mapped ChatCitation[]) → rawCitations (mapped on-the-fly) → chatCitations (deprecated)
 */
export function resolveCitations(meta: Record<string, unknown> | undefined): ChatCitation[] {
  if (!meta) return [];
  const citations = meta.citations as ChatCitation[] | undefined;
  if (citations && citations.length > 0) return citations;
  const rawCitations = meta.rawCitations as unknown[] | undefined;
  if (rawCitations && rawCitations.length > 0) return mapRawCitationsToChat(rawCitations);
  const chatCitations = meta.chatCitations as ChatCitation[] | undefined;
  if (chatCitations && chatCitations.length > 0) return chatCitations;
  return [];
}
