import { create } from 'zustand';

import { docsService, type Document, type UpdateDocumentPayload } from '../services/docs/docsApi';
import { isFullDocument } from '../services/docs/documentShape';
import { getRecentDocIds } from '../services/docs/recentDocs';

interface DocsState {
  documents: Document[];
  prefetchedDocs: Map<string, Document>;
  isLoading: boolean;
  error: string | null;

  fetchDocuments: () => Promise<void>;
  fetchDocument: (id: string) => Promise<Document | null>;
  createDocument: (title: string, documentSubtype?: string) => Promise<Document | null>;
  generateDocument: (description: string) => Promise<Document | null>;
  updateDocument: (id: string, payload: UpdateDocumentPayload) => Promise<Document | null>;
  deleteDocument: (id: string) => Promise<boolean>;
  getCachedDoc: (id: string) => Document | undefined;
  prefetchRecentDocs: () => Promise<void>;
  clearError: () => void;
}

export const useDocsStore = create<DocsState>((set, get) => ({
  documents: [],
  prefetchedDocs: new Map(),
  isLoading: false,
  error: null,

  fetchDocuments: async () => {
    set({ isLoading: true, error: null });
    try {
      const documents = await docsService.fetchDocuments();
      documents.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
      // List rows still seed the cache — `getCachedDoc` is read for the title,
      // which lets the editor show its header before the socket connects. They
      // must not overwrite a full document already sitting there, though: that
      // would trade a complete row for a preview of it.
      const prefetchedDocs = new Map(get().prefetchedDocs);
      for (const doc of documents) {
        if (!isFullDocument(prefetchedDocs.get(doc.id))) {
          prefetchedDocs.set(doc.id, doc);
        }
      }
      set({ documents, prefetchedDocs, isLoading: false });
    } catch (error) {
      console.error('[DocsStore] Failed to fetch documents:', error);
      set({ error: 'Dokumente konnten nicht geladen werden', isLoading: false });
    }
  },

  fetchDocument: async (id: string) => {
    // Only a full row short-circuits the request. A list row would satisfy the
    // `find` but carry no body at all.
    const existing = get().documents.find((d) => d.id === id);
    if (isFullDocument(existing)) {
      return existing;
    }

    try {
      const document = await docsService.fetchDocument(id);
      if (document) {
        set((state) => {
          const exists = state.documents.some((d) => d.id === id);
          if (!exists) {
            return { documents: [document, ...state.documents] };
          }
          return state;
        });
      }
      return document;
    } catch (error) {
      console.error('[DocsStore] Failed to fetch document:', error);
      return null;
    }
  },

  createDocument: async (title: string, documentSubtype?: string) => {
    set({ isLoading: true, error: null });
    try {
      const document = await docsService.createDocument({
        title,
        document_subtype: documentSubtype,
      });
      if (document) {
        set((state) => ({
          documents: [document, ...state.documents],
          isLoading: false,
        }));
      }
      return document;
    } catch (error) {
      console.error('[DocsStore] Failed to create document:', error);
      set({ error: 'Dokument konnte nicht erstellt werden', isLoading: false });
      return null;
    }
  },

  generateDocument: async (description: string) => {
    set({ isLoading: true, error: null });
    try {
      const document = await docsService.generateDocument(description);
      if (document) {
        set((state) => ({
          documents: [document, ...state.documents],
          isLoading: false,
        }));
      } else {
        set({ isLoading: false });
      }
      return document;
    } catch (error) {
      console.error('[DocsStore] Failed to generate document:', error);
      set({ error: 'Dokument konnte nicht generiert werden', isLoading: false });
      return null;
    }
  },

  updateDocument: async (id: string, payload: UpdateDocumentPayload) => {
    try {
      const document = await docsService.updateDocument(id, payload);
      if (document) {
        set((state) => ({
          documents: state.documents.map((d) => (d.id === id ? { ...d, ...document } : d)),
        }));
      }
      return document;
    } catch (error) {
      console.error('[DocsStore] Failed to update document:', error);
      return null;
    }
  },

  deleteDocument: async (id: string) => {
    try {
      const success = await docsService.deleteDocument(id);
      if (success) {
        set((state) => ({
          documents: state.documents.filter((d) => d.id !== id),
        }));
      }
      return success;
    } catch (error) {
      console.error('[DocsStore] Failed to delete document:', error);
      return false;
    }
  },

  getCachedDoc: (id: string) => get().prefetchedDocs.get(id),

  prefetchRecentDocs: async () => {
    const recentIds = await getRecentDocIds();
    if (recentIds.length === 0) return;

    // "Missing" means missing a body, not missing a key: since the list seeds
    // this map with preview rows, a plain `has()` would report every recent
    // document as already prefetched and this would fetch nothing.
    const { prefetchedDocs } = get();
    const missingIds = recentIds.filter((id) => !isFullDocument(prefetchedDocs.get(id)));
    if (missingIds.length === 0) return;

    const results = await Promise.allSettled(missingIds.map((id) => docsService.fetchDocument(id)));

    const newCache = new Map(get().prefetchedDocs);
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        newCache.set(result.value.id, result.value);
      }
    }
    set({ prefetchedDocs: newCache });
  },

  clearError: () => set({ error: null }),
}));

export type { Document };
