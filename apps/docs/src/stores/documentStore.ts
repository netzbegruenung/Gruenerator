import { create } from 'zustand';
import { apiClient } from '../lib/apiClient';

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
  permissions: Record<string, { level: string; granted_at: string }>;
  metadata?: Record<string, unknown>;
}

interface DocumentStore {
  documents: Document[];
  isLoading: boolean;
  error: string | null;
  fetchDocuments: () => Promise<void>;
  createDocument: (title?: string, folderId?: string | null) => Promise<Document>;
  updateDocument: (id: string, updates: Partial<Pick<Document, 'title' | 'folder_id'>>) => Promise<void>;
  deleteDocument: (id: string) => Promise<void>;
  duplicateDocument: (id: string) => Promise<Document>;
  clearError: () => void;
}

export const useDocumentStore = create<DocumentStore>((set, get) => ({
  documents: [],
  isLoading: false,
  error: null,

  fetchDocuments: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiClient.get('/docs');
      set({ documents: response.data, isLoading: false });
    } catch (error) {
      console.error('Failed to fetch documents:', error);
      set({
        error: 'Fehler beim Laden der Dokumente',
        isLoading: false
      });
    }
  },

  createDocument: async (title = 'Untitled Document', folderId = null) => {
    set({ error: null });
    try {
      const response = await apiClient.post('/docs', {
        title,
        folder_id: folderId
      });
      const newDocument = response.data;

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

  updateDocument: async (id, updates) => {
    set({ error: null });
    try {
      const response = await apiClient.put(`/docs/${id}`, updates);
      const updatedDocument = response.data;

      set((state) => ({
        documents: state.documents.map((doc) =>
          doc.id === id ? updatedDocument : doc
        ),
      }));
    } catch (error) {
      console.error('Failed to update document:', error);
      set({ error: 'Fehler beim Aktualisieren des Dokuments' });
      throw error;
    }
  },

  deleteDocument: async (id) => {
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

  duplicateDocument: async (id) => {
    set({ error: null });
    try {
      const response = await apiClient.post(`/docs/${id}/duplicate`);
      const duplicatedDocument = response.data;

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
