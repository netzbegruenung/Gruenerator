/**
 * Ein Notebook aus mehreren Quellen als Fakes für `NotebookSourcesDeps` —
 * für die Tests von grep, stats, rank und cite, die über mehrere Quellen
 * laufen. Jede Quelle trägt ihren eigenen Originaltext und ihre Chunks.
 */
import { vi } from 'vitest';

import type { NotebookAccess } from '../../../routes/notebook/notebookAccess.js';
import type { DocumentChunkItem } from '../../document-services/DocumentSearchService/types.js';
import type { NotebookSourcesDeps } from '../notebookSources.js';

export const OWNER: NotebookAccess = { exists: true, isOwner: true, canRead: true, canEdit: true };
export const DENIED: NotebookAccess = {
  exists: false,
  isOwner: false,
  canRead: false,
  canEdit: false,
};

export interface FakeSource {
  id: string;
  title?: string;
  /** Originaltext (`markdown_content`); `null` → der Text kommt aus den Chunks. */
  text: string | null;
  chunks?: DocumentChunkItem[];
  /** `length(markdown_content)` wie Postgres es meldet; Standard: Länge von `text`. */
  chars?: number | null;
  pageCount?: number | null;
  vectorCount?: number | null;
  createdAt?: string;
}

export function fakeChunk(
  over: Partial<DocumentChunkItem> & { index: number; text: string }
): DocumentChunkItem {
  return {
    tokens: 10,
    pageNumber: null,
    charStart: null,
    charEnd: null,
    headingPath: null,
    heading: null,
    sectionIndex: null,
    chunkType: 'text',
    ...over,
  };
}

export function fakeNotebookDeps(
  sources: FakeSource[],
  opts: {
    access?: NotebookAccess;
    searchResults?: unknown[];
    searchError?: string;
    /** Diese Quelle gehört nicht (mehr) zum Notebook. */
    notInCollection?: string[];
  } = {}
) {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const row = (s: FakeSource) => ({
    id: s.id,
    user_id: 'owner-1',
    title: s.title ?? s.id,
    filename: null,
    page_count: s.pageCount ?? null,
    file_size: null,
    status: 'completed',
    source_type: 'manual',
    source_url: null,
    document_type: 'upload',
    created_at: s.createdAt ?? '2026-09-01T10:00:00.000Z',
    vector_count: s.vectorCount ?? null,
    wolke_share_link_id: null,
    metadata: {},
    chars: s.chars === undefined ? (s.text?.length ?? null) : s.chars,
  });
  const db = {
    query: vi.fn(async (sql: string, params: unknown[]) => {
      if (sql.includes('markdown_content FROM documents')) {
        const s = byId.get(String(params[0]));
        return s ? [{ markdown_content: s.text }] : [];
      }
      if (sql.includes('WHERE id = ANY($1)')) {
        const ids = params[0] as string[];
        return sources.filter((s) => ids.includes(s.id)).map(row);
      }
      if (sql.includes('WHERE id = $1')) {
        const s = byId.get(String(params[0]));
        return s ? [row(s)] : [];
      }
      return [];
    }),
  };
  const helper = {
    getCollectionDocuments: vi.fn(async () =>
      sources.map((s) => ({ document_id: s.id, added_at: '', added_by: null }))
    ),
    isDocumentInCollection: vi.fn(
      async (_c: string, id: string) => byId.has(id) && !opts.notInCollection?.includes(id)
    ),
    getNotebookCollection: vi.fn(async () => ({ id: 'n1', name: 'Kreisverband' })),
  };
  const documentService = {
    getDocumentChunks: vi.fn(async (_owner: string, id: string) => {
      const chunks = byId.get(id)?.chunks ?? [];
      return chunks.length
        ? { success: true, chunks, chunkCount: chunks.length }
        : { success: false, chunks: [], chunkCount: 0, error: 'No chunks found' };
    }),
    search: vi.fn(async () => ({
      success: !opts.searchError,
      ...(opts.searchError ? { error: opts.searchError } : {}),
      results: opts.searchResults ?? [],
      query: '',
      searchType: 'hybrid',
      message: '',
    })),
  };
  const deps = {
    db,
    helper,
    documentService,
    access: vi.fn(async () => opts.access ?? OWNER),
    rerank: vi.fn(async (input: { results: unknown[] }) => ({
      results: input.results,
      referencesMap: {},
      contextSummary: '',
      rerankTimeMs: 1,
    })),
  } as unknown as NotebookSourcesDeps;
  return { deps, db, helper, documentService };
}
