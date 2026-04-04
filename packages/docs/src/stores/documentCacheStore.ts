import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { type Document } from './documentStore';

type CachedDocument = Pick<
  Document,
  'id' | 'title' | 'updated_at' | 'document_subtype' | 'folder_id'
>;

interface DocumentCacheState {
  cachedDocs: CachedDocument[];
  setCachedDocs: (docs: Document[]) => void;
}

function hasChanged(prev: CachedDocument[], next: Document[]): boolean {
  if (prev.length !== next.length) return true;
  return next.some((d, i) => d.id !== prev[i]?.id || d.updated_at !== prev[i]?.updated_at);
}

export const useDocumentCacheStore = create<DocumentCacheState>()(
  persist(
    (set, get) => ({
      cachedDocs: [],
      setCachedDocs: (docs) => {
        if (!hasChanged(get().cachedDocs, docs)) return;
        set({
          cachedDocs: docs.map((d) => ({
            id: d.id,
            title: d.title,
            updated_at: d.updated_at,
            document_subtype: d.document_subtype,
            folder_id: d.folder_id,
          })),
        });
      },
    }),
    { name: 'docs-document-cache' }
  )
);
