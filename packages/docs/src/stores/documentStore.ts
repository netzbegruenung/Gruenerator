import { create } from 'zustand';
import type { DocsApiClient } from '../context/DocsContext';

export interface Document {
  id: string;
  title: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  last_edited_by: string;
  last_edited_at: string;
  folder_id: string | null;
  is_deleted: boolean;
  is_public: boolean;
  document_subtype: string;
  content?: string;
  permissions: Record<string, { level: string; granted_at: string }>;
  metadata?: Record<string, unknown>;
}

interface DocumentStore {
  documents: Document[];
  isLoading: boolean;
  error: string | null;
  fetchDocuments: (apiClient: DocsApiClient) => Promise<void>;
  createDocument: (
    apiClient: DocsApiClient,
    title?: string,
    folderId?: string | null,
    documentSubtype?: string
  ) => Promise<Document>;
  updateDocument: (
    apiClient: DocsApiClient,
    id: string,
    updates: Partial<Pick<Document, 'title' | 'folder_id'>>
  ) => Promise<void>;
  deleteDocument: (apiClient: DocsApiClient, id: string) => Promise<void>;
  duplicateDocument: (apiClient: DocsApiClient, id: string) => Promise<Document>;
  clearError: () => void;
}

export const useDocumentStore = create<DocumentStore>((set) => ({
  documents: [],
  isLoading: false,
  error: null,

  fetchDocuments: async (apiClient) => {
    set({ isLoading: true, error: null });
    try {
      const data = await apiClient.get<Document[]>('/docs');
      set({ documents: data, isLoading: false });
    } catch (error) {
      console.error('Failed to fetch documents:', error);
      set({
        error: 'Fehler beim Laden der Dokumente',
        isLoading: false,
      });
    }
  },

  createDocument: async (
    apiClient,
    title = 'Neues Dokument',
    folderId = null,
    documentSubtype = 'blank'
  ) => {
    set({ error: null });
    try {
      const newDocument = await apiClient.post<Document>('/docs', {
        title,
        folder_id: folderId,
        document_subtype: documentSubtype,
      });

      set((state) => ({
        documents: [newDocument, ...state.documents],
      }));

      return newDocument;
    } catch (error) {
      console.error('Failed to create document:', error);
      set({ error: 'Fehler beim Erstellen des Dokuments' });
      throw error;
    }
  },

  updateDocument: async (apiClient, id, updates) => {
    set({ error: null });
    try {
      const updatedDocument = await apiClient.put<Document>(`/docs/${id}`, updates);

      set((state) => ({
        documents: state.documents.map((doc) => (doc.id === id ? updatedDocument : doc)),
      }));
    } catch (error) {
      console.error('Failed to update document:', error);
      set({ error: 'Fehler beim Aktualisieren des Dokuments' });
      throw error;
    }
  },

  deleteDocument: async (apiClient, id) => {
    set({ error: null });
    try {
      await apiClient.delete(`/docs/${id}`);

      set((state) => ({
        documents: state.documents.filter((doc) => doc.id !== id),
      }));
    } catch (error) {
      console.error('Failed to delete document:', error);
      set({ error: 'Fehler beim Löschen des Dokuments' });
      throw error;
    }
  },

  duplicateDocument: async (apiClient, id) => {
    set({ error: null });
    try {
      const duplicatedDocument = await apiClient.post<Document>(`/docs/${id}/duplicate`);

      set((state) => ({
        documents: [duplicatedDocument, ...state.documents],
      }));

      return duplicatedDocument;
    } catch (error) {
      console.error('Failed to duplicate document:', error);
      set({ error: 'Fehler beim Duplizieren des Dokuments' });
      throw error;
    }
  },

  clearError: () => set({ error: null }),
}));
