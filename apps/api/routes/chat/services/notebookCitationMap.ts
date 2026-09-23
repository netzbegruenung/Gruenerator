/**
 * Chat-Zitate des Loops → Notebook-Zitate der Notebook-Seite.
 *
 * Der Präzisionsmodus läuft im agentischen Loop, dessen Quellenregistrierung
 * Chat-Zitate liefert (`id`, camelCase). Die Notebook-Seite liest live und nach
 * dem Reload die Notebook-Form (`index`, snake_case — `validateAndInjectCitations`)
 * und bildet sie mit `mapRawCitationsToChat` (packages/chat) zurück. Diese
 * Abbildung ist deren Umkehrung; der Rundlauf steht im Test.
 */
import type { Citation } from '../../../agents/langgraph/ChatGraph/types.js';
import type { NotebookCitation, NotebookSource } from '@gruenerator/contracts';

export function toNotebookCitations(citations: readonly Citation[]): NotebookCitation[] {
  return citations.map((c) => {
    const collectionName = c.collectionName ?? c.source;
    return {
      index: String(c.id),
      cited_text: c.citedText ?? c.snippet,
      document_title: c.title,
      source_url: c.url || null,
      page_number: c.pageNumber ?? null,
      ...(c.documentId != null && { document_id: c.documentId }),
      ...(c.chunkIndex != null && { chunk_index: c.chunkIndex }),
      ...(c.similarityScore != null && { similarity_score: c.similarityScore }),
      ...(c.collectionId != null && { collection_id: c.collectionId }),
      ...(collectionName ? { collection_name: collectionName } : {}),
    };
  });
}

/** Je Dokument eine Quelle — dieselbe Gruppierung wie `validateAndInjectCitations`. */
export function toNotebookSources(citations: readonly NotebookCitation[]): NotebookSource[] {
  const byDoc = new Map<string, NotebookSource & { texts: string[] }>();
  for (const c of citations) {
    const title = c.document_title ?? '';
    const key = c.document_id || c.source_url || title;
    let doc = byDoc.get(key);
    if (!doc) {
      doc = {
        document_id: c.document_id ?? key,
        document_title: title,
        source_url: c.source_url ?? null,
        chunk_text: '',
        similarity_score: c.similarity_score ?? 0,
        date: c.date ?? null,
        citations: [],
        texts: [],
      };
      byDoc.set(key, doc);
    }
    if (c.cited_text) doc.texts.push(c.cited_text);
    doc.similarity_score = Math.max(doc.similarity_score, c.similarity_score ?? 0);
    doc.citations.push(c);
  }
  return [...byDoc.values()].map(({ texts, ...source }) => ({
    ...source,
    chunk_text: texts.join(' [...] '),
  }));
}
