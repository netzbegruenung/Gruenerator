/**
 * Docs Store
 * Zustand store for managing documents state
 */

import { create } from 'zustand';
import { docsService, type Document, type UpdateDocumentPayload } from '../services/docs';

interface DocsState {
  documents: Document[];
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchDocuments: () => Promise<void>;
  fetchDocument: (id: string) => Promise<Document | null>;
  createDocument: (title: string) => Promise<Document | null>;
  updateDocument: (id: string, payload: UpdateDocumentPayload) => Promise<Document | null>;
  deleteDocument: (id: string) => Promise<boolean>;
  clearError: () => void;
}

export const useDocsStore = create<DocsState>((set, get) => ({
  documents: [],
  isLoading: false,
  error: null,

  fetchDocuments: async () => {
    set({ isLoading: true, error: null });
    try {
      const documents = await docsService.fetchDocuments();
      // Sort by updated_at descending (most recent first)
      documents.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
      set({ documents, isLoading: false });
    } catch (error) {
      console.error('[DocsStore] Failed to fetch documents:', error);
      set({ error: 'Dokumente konnten nicht geladen werden', isLoading: false });
    }
  },

  fetchDocument: async (id: string) => {
    // First check if we have it in state
    const existing = get().documents.find((d) => d.id === id);
    if (existing) {
      return existing;
    }

    // Otherwise fetch from API
    try {
      const document = await docsService.fetchDocument(id);
      if (document) {
        // Add to documents list if not already present
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

  createDocument: async (title: string) => {
    set({ isLoading: true, error: null });
    try {
      const document = await docsService.createDocument({ title });
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

  clearError: () => set({ error: null }),
}));

// Re-export Document type for convenience
export type { Document };
