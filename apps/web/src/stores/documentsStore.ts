import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import apiClient from '../components/utils/apiClient';

type DocumentStatus = 'completed' | 'processing' | 'pending' | 'failed';

interface Document {
  id: string;
  title: string;
  status: DocumentStatus;
  filename?: string;
  file_type?: string;
  created_at?: string;
  updated_at?: string;
  user_id?: string;
  group_id?: string;
  description?: string;
  file_size?: number;
  processed_chunks?: number;
}

interface Text {
  id: string;
  title?: string;
  content?: string;
  user_id?: string;
  created_at?: string;
  updated_at?: string;
}

interface SearchResult {
  id: string;
  content?: string;
  search_type?: string;
  score?: number;
  document_id?: string;
  title?: string;
  metadata?: Record<string, unknown>;
}

interface SearchOptions {
  limit?: number;
  mode?: 'intelligent' | 'fulltext';
  documentIds?: string[];
}

interface WolkeFile {
  path: string;
  name: string;
  size?: number;
  mimeType?: string;
  lastModified?: string;
  isDirectory?: boolean;
}

interface DocumentsState {
  documents: Document[];
  texts: Text[];
  isLoading: boolean;
  isUploading: boolean;
  uploadProgress: number;
  error: string | null;
  searchResults: SearchResult[];
  isSearching: boolean;
}

interface WolkeFileResponse {
  success: boolean;
  files: WolkeFile[];
  message?: string;
}

interface WolkeImportResponse {
  success: boolean;
  summary?: Record<string, unknown>;
  message?: string;
}

interface DocumentsActions {
  reset: () => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
  fetchDocuments: () => Promise<void>;
  fetchCombinedContent: () => Promise<{ documents: Document[]; texts: Text[] } | undefined>;
  uploadDocument: (file: File, title: string, groupId?: string | null) => Promise<Document>;
  crawlUrl: (url: string, title: string, groupId?: string | null) => Promise<Document>;
  deleteDocument: (documentId: string) => Promise<boolean>;
  searchDocuments: (query: string, options?: SearchOptions) => Promise<SearchResult[]>;
  clearSearchResults: () => void;
  getDocumentById: (documentId: string) => Document | undefined;
  getCompletedDocuments: () => Document[];
  getProcessingDocuments: () => Document[];
  updateDocumentStatus: (documentId: string, status: DocumentStatus, updates?: Partial<Document>) => void;
  updateDocumentTitle: (documentId: string, newTitle: string) => Promise<boolean>;
  refreshDocument: (documentId: string) => Promise<Document>;
  browseWolkeFiles: (shareLinkId: string) => Promise<WolkeFileResponse>;
  importWolkeFiles: (shareLinkId: string, files: WolkeFile[], onProgress?: ((progress: number) => void) | null) => Promise<WolkeImportResponse>;
}

type DocumentsStore = DocumentsState & DocumentsActions;

const initialState: DocumentsState = {
  documents: [],
  texts: [],
  isLoading: false,
  isUploading: false,
  uploadProgress: 0,
  error: null,
  searchResults: [],
  isSearching: false,
};

/**
 * Zustand store for document management
 * Handles document upload, listing, deletion, and search
 */
export const useDocumentsStore = create<DocumentsStore>()(immer((set, get) => {
  return {
    ...initialState,

    // Reset store to initial state
    reset: () => set(() => initialState),

    // Set loading state
    setLoading: (isLoading) => set((state) => {
      state.isLoading = isLoading;
    }),

    // Set error state
    setError: (error) => set((state) => {
      state.error = error;
    }),

    // Clear error
    clearError: () => set((state) => {
      state.error = null;
    }),

    // Fetch user documents
    fetchDocuments: async () => {
      set((state) => {
        state.isLoading = true;
        state.error = null;
      });

      try {
        const response = await apiClient.get('/documents/user');
        const result = response.data;

        if (result.success) {
          set((state) => {
            state.documents = result.data || [];
            state.isLoading = false;
          });
        } else {
          throw new Error(result.message || 'Failed to fetch documents');
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('[DocumentsStore] Error fetching documents:', error);
        set((state) => {
          state.error = errorMessage;
          state.isLoading = false;
        });
      }
    },

    // Fetch combined content (documents + texts) for improved performance
    fetchCombinedContent: async () => {
      set((state) => {
        state.isLoading = true;
        state.error = null;
      });

      try {
        const response = await apiClient.get('/documents/combined-content');
        const result = response.data;

        if (result.success) {
          set((state) => {
            state.documents = result.data.documents || [];
            state.texts = result.data.texts || [];
            state.isLoading = false;
          });
          return result.data;
        } else {
          throw new Error(result.message || 'Failed to fetch combined content');
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('[DocumentsStore] Error fetching combined content:', error);
        set((state) => {
          state.error = errorMessage;
          state.isLoading = false;
        });
        throw error;
      }
    },

    // Upload document (vectors-only manual mode)
    uploadDocument: async (file, title, groupId = null) => {
      set((state) => {
        state.isUploading = true;
        state.uploadProgress = 0;
        state.error = null;
      });

      try {
        console.log('[DocumentsStore] Uploading document (manual mode):', { title, filename: file.name, size: file.size });

        const formData = new FormData();
        formData.append('document', file);
        formData.append('title', title);
        if (groupId) {
          formData.append('group_id', groupId);
        }

        const response = await apiClient.post('/documents/upload-manual', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        const result = response.data;

        if (result.success) {
          set((state) => {
            state.documents.unshift(result.data);
            state.isUploading = false;
            state.uploadProgress = 100;
          });
          console.log('[DocumentsStore] Document vectorized successfully:', result.data.id);
          return result.data;
        } else {
          throw new Error(result.message || 'Failed to process document');
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('[DocumentsStore] Error uploading document:', error);
        set((state) => {
          state.error = errorMessage;
          state.isUploading = false;
          state.uploadProgress = 0;
        });
        throw error;
      }
    },

    // Crawl URL and create document (vectors-only manual mode)
    crawlUrl: async (url, title, groupId = null) => {
      set((state) => {
        state.isUploading = true;
        state.uploadProgress = 0;
        state.error = null;
      });

      try {
        console.log('[DocumentsStore] Crawling URL (manual mode):', { url, title, groupId });

        const response = await apiClient.post('/documents/crawl-url-manual', {
          url: url.trim(),
          title: title.trim(),
          group_id: groupId
        });
        const result = response.data;

        if (result.success) {
          set((state) => {
            state.documents.unshift(result.data);
            state.isUploading = false;
            state.uploadProgress = 100;
          });
          console.log('[DocumentsStore] URL crawled and vectorized successfully:', result.data.id);
          return result.data;
        } else {
          throw new Error(result.message || 'Failed to crawl and process URL');
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('[DocumentsStore] Error crawling URL:', error);
        set((state) => {
          state.error = errorMessage;
          state.isUploading = false;
          state.uploadProgress = 0;
        });
        throw error;
      }
    },

    // Delete document
    deleteDocument: async (documentId) => {
      try {
        console.log('[DocumentsStore] Deleting document:', documentId);
        const response = await apiClient.delete(`/documents/${documentId}`);
        const result = response.data;

        if (result.success) {
          set((state) => {
            state.documents = state.documents.filter(doc => doc.id !== documentId);
          });
          console.log('[DocumentsStore] Document deleted successfully');
          return true;
        } else {
          throw new Error(result.message || 'Failed to delete document');
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('[DocumentsStore] Error deleting document:', error);
        set((state) => {
          state.error = errorMessage;
        });
        throw error;
      }
    },

    // Search documents (supports fulltext or intelligent/hybrid)
    searchDocuments: async (query, options = {}) => {
      set((state) => {
        state.isSearching = true;
        state.error = null;
      });

      try {
        const { limit = 5, mode = 'intelligent', documentIds } = options || {};
        const searchMode = mode === 'fulltext' ? 'text' : 'hybrid';
        console.log('[DocumentsStore] Searching documents:', { query, limit, mode: searchMode, documentIds });

        const response = await apiClient.post('/documents/search', { query, limit, searchMode, documentIds });
        const result = response.data;

        if (result.success) {
          set((state) => {
            state.searchResults = (result.data || []).map((item: SearchResult) => ({
              ...item,
              search_type: item.search_type || result.searchType || searchMode
            }));
            state.isSearching = false;
          });
          console.log(`[DocumentsStore] Found ${result.data?.length || 0} search results`);
          return result.data || [];
        } else {
          throw new Error(result.message || 'Failed to search documents');
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('[DocumentsStore] Error searching documents:', error);
        set((state) => {
          state.error = errorMessage;
          state.isSearching = false;
          state.searchResults = [];
        });
        return [];
      }
    },

    // Clear search results
    clearSearchResults: () => set((state) => {
      state.searchResults = [];
    }),

    // Get document by ID
    getDocumentById: (documentId) => {
      const state = get();
      return state.documents.find(doc => doc.id === documentId);
    },

    // Get completed documents
    getCompletedDocuments: () => {
      const state = get();
      return state.documents.filter(doc => doc.status === 'completed');
    },

    // Get processing documents
    getProcessingDocuments: () => {
      const state = get();
      return state.documents.filter(doc => doc.status === 'processing' || doc.status === 'pending');
    },

    // Update document status (for real-time updates)
    updateDocumentStatus: (documentId, status, updates = {}) => set((state) => {
      const docIndex = state.documents.findIndex(doc => doc.id === documentId);
      if (docIndex !== -1) {
        state.documents[docIndex] = {
          ...state.documents[docIndex],
          status,
          ...updates
        };
      }
    }),

    // Update document title
    updateDocumentTitle: async (documentId, newTitle) => {
      try {
        console.log('[DocumentsStore] Updating document title:', { documentId, newTitle });
        const response = await apiClient.post(`/documents/${documentId}/metadata`, { title: newTitle.trim() });
        const result = response.data;

        if (result.success) {
          set((state) => {
            const docIndex = state.documents.findIndex(doc => doc.id === documentId);
            if (docIndex !== -1) {
              state.documents[docIndex] = { ...state.documents[docIndex], title: newTitle.trim() };
            }
          });
          console.log('[DocumentsStore] Document title updated successfully');
          return true;
        } else {
          throw new Error(result.message || 'Failed to update document title');
        }
      } catch (error) {
        console.error('[DocumentsStore] Error updating document title:', error);
        throw error;
      }
    },

    // Refresh document data
    refreshDocument: async (documentId) => {
      try {
        console.log('[DocumentsStore] Refreshing document:', documentId);
        const response = await apiClient.get(`/documents/${documentId}/content`);
        const result = response.data;

        if (result.success) {
          set((state) => {
            const docIndex = state.documents.findIndex(doc => doc.id === documentId);
            if (docIndex !== -1) {
              state.documents[docIndex] = { ...state.documents[docIndex], ...result.data };
            }
          });
          console.log('[DocumentsStore] Document refreshed successfully');
          return result.data;
        } else {
          throw new Error(result.message || 'Failed to refresh document');
        }
      } catch (error) {
        console.error('[DocumentsStore] Error refreshing document:', error);
        throw error;
      }
    },

    // Browse files in a Wolke share
    browseWolkeFiles: async (shareLinkId) => {
      set((state) => {
        state.isLoading = true;
        state.error = null;
      });

      try {
        console.log('[DocumentsStore] Browsing Wolke files for share link:', shareLinkId);
        const response = await apiClient.get(`/documents/wolke/browse/${shareLinkId}`);
        const result = response.data;

        set((state) => { state.isLoading = false; });

        if (result.success) {
          console.log('[DocumentsStore] Wolke files loaded successfully:', result.files.length, 'files');
          return result;
        } else {
          throw new Error(result.message || 'Failed to browse Wolke files');
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('[DocumentsStore] Error browsing Wolke files:', error);
        set((state) => {
          state.error = errorMessage;
          state.isLoading = false;
        });
        throw error;
      }
    },

    // Import selected files from Wolke
    importWolkeFiles: async (shareLinkId, files, onProgress = null) => {
      set((state) => {
        state.isUploading = true;
        state.uploadProgress = 0;
        state.error = null;
      });

      let progressInterval: ReturnType<typeof setInterval> | undefined;
      try {
        console.log('[DocumentsStore] Importing Wolke files:', { shareLinkId, fileCount: files.length });

        if (onProgress) {
          let currentProgress = 0;
          progressInterval = setInterval(() => {
            if (currentProgress < 90) {
              currentProgress += Math.random() * 10;
              set((state) => { state.uploadProgress = Math.min(currentProgress, 90); });
              onProgress(Math.min(currentProgress, 90));
            }
          }, 200);
        }

        const response = await apiClient.post('/documents/wolke/import', { shareLinkId, files });
        if (progressInterval) clearInterval(progressInterval);
        const result = response.data;

        set((state) => {
          state.isUploading = false;
          state.uploadProgress = 100;
        });
        if (onProgress) onProgress(100);

        if (result.success) {
          console.log('[DocumentsStore] Wolke files imported successfully:', result.summary);
          await get().fetchDocuments();
          return result;
        } else {
          throw new Error(result.message || 'Failed to import Wolke files');
        }
      } catch (error: unknown) {
        if (progressInterval) clearInterval(progressInterval);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('[DocumentsStore] Error importing Wolke files:', error);
        set((state) => {
          state.error = errorMessage;
          state.isUploading = false;
          state.uploadProgress = 0;
        });
        if (onProgress) onProgress(0);
        throw error;
      }
    },
  };
}));

export type { Document, Text, SearchResult, SearchOptions, WolkeFile, WolkeFileResponse, WolkeImportResponse };
