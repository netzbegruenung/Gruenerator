import { create } from 'zustand';
import {
  fetchCombinedContent as apiFetchCombinedContent,
  deleteDocument as apiDeleteDocument,
  deleteText as apiDeleteText,
  updateTextTitle as apiUpdateTextTitle,
  type Document,
  type SavedText,
  type CombinedContentItem,
} from '../services/content';
import { getErrorMessage } from '../utils/errors';

interface ContentState {
  documents: Document[];
  texts: SavedText[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
}

interface ContentActions {
  fetchContent: () => Promise<void>;
  refreshContent: () => Promise<void>;
  deleteDocument: (id: string) => Promise<void>;
  deleteText: (id: string) => Promise<void>;
  updateTextTitle: (id: string, title: string) => Promise<void>;
  getCombinedContent: () => CombinedContentItem[];
  reset: () => void;
}

type ContentStore = ContentState & ContentActions;

const initialState: ContentState = {
  documents: [],
  texts: [],
  isLoading: false,
  isRefreshing: false,
  error: null,
};

export const useContentStore = create<ContentStore>()((set, get) => ({
  ...initialState,

  fetchContent: async () => {
    set({ isLoading: true, error: null });
    try {
      const result = await apiFetchCombinedContent();
      set({
        documents: result?.documents || [],
        texts: result?.texts || [],
        isLoading: false,
      });
    } catch (error: unknown) {
      set({ error: getErrorMessage(error), isLoading: false });
    }
  },

  refreshContent: async () => {
    set({ isRefreshing: true, error: null });
    try {
      const result = await apiFetchCombinedContent();
      set({
        documents: result?.documents || [],
        texts: result?.texts || [],
        isRefreshing: false,
      });
    } catch (error: unknown) {
      set({ error: getErrorMessage(error), isRefreshing: false });
    }
  },

  deleteDocument: async (id: string) => {
    try {
      await apiDeleteDocument(id);
      set((state) => ({
        documents: state.documents.filter((doc) => doc.id !== id),
      }));
    } catch (error: unknown) {
      set({ error: getErrorMessage(error) });
      throw error;
    }
  },

  deleteText: async (id: string) => {
    try {
      await apiDeleteText(id);
      set((state) => ({
        texts: state.texts.filter((text) => text.id !== id),
      }));
    } catch (error: unknown) {
      set({ error: getErrorMessage(error) });
      throw error;
    }
  },

  updateTextTitle: async (id: string, title: string) => {
    try {
      await apiUpdateTextTitle(id, title);
      set((state) => ({
        texts: state.texts.map((text) => (text.id === id ? { ...text, title } : text)),
      }));
    } catch (error: unknown) {
      set({ error: getErrorMessage(error) });
      throw error;
    }
  },

  getCombinedContent: () => {
    const { documents, texts } = get();
    const docsWithType: CombinedContentItem[] = (documents || []).map((doc) => ({
      ...doc,
      title: doc.title || 'Ohne Titel',
      type: doc.type || 'unknown',
      itemType: 'document' as const,
    }));
    const textsWithType: CombinedContentItem[] = (texts || []).map((text) => ({
      id: text.id,
      title: text.title || 'Ohne Titel',
      type: text.document_type || 'universal',
      source_type: 'gruenerierte_texte',
      full_content: text.content || '',
      word_count: text.word_count || (text.content ? text.content.split(/\s+/).length : 0),
      created_at: text.created_at || new Date().toISOString(),
      updated_at: text.updated_at || new Date().toISOString(),
      itemType: 'text' as const,
    }));
    return [...docsWithType, ...textsWithType].sort(
      (a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime()
    );
  },

  reset: () => {
    set(initialState);
  },
}));
