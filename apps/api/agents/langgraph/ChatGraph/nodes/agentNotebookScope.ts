/**
 * Die eigenen Notebooks eines Agenten (`defaultNotebookIds` mit Nutzer-UUIDs)
 * als Dokument-Scope — für den Einzeldurchlauf (`searchNode`) und den
 * Vorab-Abruf des Loops (`seedTurnMaterial`) aus einer Hand.
 *
 * Bis 11/2026 las nur `searchNode` diesen Scope. Der Loop sah ihn nie: ein
 * Agent mit drei eigenen Notebooks beantwortete Bürgermails aus dem
 * System-Notebook Berlin oder gar nicht („kein Zugriff auf interne
 * Dokumente"), obwohl die Notebooks eingestellt und lesbar waren.
 */
import { type ChatGraphState, type SearchResult } from '../types.js';

/**
 * Die Dokumente der eigenen Agent-Notebooks — aber nur, wenn der Turn selbst
 * nichts eingegrenzt hat (kein @datei, kein @notebook, kein System-Notebook).
 * Eine ausdrückliche Wahl schlägt die Vorgabe des Agenten.
 */
export function agentNotebookDocIds(
  state: Pick<
    ChatGraphState,
    'documentIds' | 'notebookDocumentIds' | 'notebookCollectionIds' | 'defaultNotebookDocumentIds'
  >
): string[] {
  const hasExplicitScope =
    (state.documentIds?.length ?? 0) > 0 ||
    (state.notebookDocumentIds?.length ?? 0) > 0 ||
    (state.notebookCollectionIds?.length ?? 0) > 0;
  return hasExplicitScope ? [] : (state.defaultNotebookDocumentIds ?? []);
}

/**
 * Eine Suche über eine feste Dokumentmenge. Die Suche filtert nicht nach
 * Besitzer — ein Notebook kann Dokumente anderer enthalten —, deshalb müssen
 * die ids vorher autorisiert sein (`resolveUserNotebookDocumentIds`,
 * `authorizeDocumentScope`).
 */
export async function searchScopedDocuments(params: {
  query: string;
  userId: string | undefined;
  documentIds: readonly string[];
  /** documentId → Notebook, damit der Reader die Quelle öffnen kann. */
  documentNotebookIds?: Record<string, string> | undefined;
}): Promise<SearchResult[]> {
  const documentSearchService = (
    await import('../../../../services/document-services/DocumentSearchService/index.js')
  ).getQdrantDocumentService();
  const response = await documentSearchService.search({
    query: params.query,
    userId: params.userId,
    options: {
      limit: 8,
      mode: 'hybrid',
      threshold: 0.2,
    },
    filters: {
      documentIds: [...params.documentIds],
    },
  });

  return (response.results || []).map((r) => {
    const notebookId = r.document_id ? params.documentNotebookIds?.[r.document_id] : undefined;
    return {
      source: `document:${r.document_id || 'unknown'}`,
      title: r.title || 'Dokument',
      content: r.relevant_content || '',
      url: r.source_url || undefined,
      relevance: r.similarity_score ?? 0.5,
      ...(r.document_id ? { documentId: r.document_id } : {}),
      ...(notebookId ? { collectionId: notebookId } : {}),
    };
  });
}
