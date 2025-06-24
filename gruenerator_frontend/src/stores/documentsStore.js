import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

const AUTH_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

const initialState = {
  documents: [],
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
export const useDocumentsStore = create(immer((set, get) => {
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
        console.log('[DocumentsStore] Fetching user documents');
        
        const response = await fetch(`${AUTH_BASE_URL}/documents/user`, {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        
        if (result.success) {
          set((state) => {
            state.documents = result.data || [];
            state.isLoading = false;
          });
          console.log(`[DocumentsStore] Fetched ${result.data?.length || 0} documents`);
        } else {
          throw new Error(result.message || 'Failed to fetch documents');
        }
      } catch (error) {
        console.error('[DocumentsStore] Error fetching documents:', error);
        set((state) => {
          state.error = error.message;
          state.isLoading = false;
        });
      }
    },

    // Upload document
    uploadDocument: async (file, title, groupId = null, ocrMethod = 'tesseract') => {
      set((state) => {
        state.isUploading = true;
        state.uploadProgress = 0;
        state.error = null;
      });

      try {
        console.log('[DocumentsStore] Uploading document:', { title, filename: file.name, size: file.size, ocrMethod });

        // Create FormData
        const formData = new FormData();
        formData.append('document', file);
        formData.append('title', title);
        formData.append('ocr_method', ocrMethod);
        if (groupId) {
          formData.append('group_id', groupId);
        }

        // Upload with progress tracking
        const response = await fetch(`${AUTH_BASE_URL}/documents/upload`, {
          method: 'POST',
          credentials: 'include',
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        
        if (result.success) {
          set((state) => {
            // Add new document to the list
            state.documents.unshift(result.data);
            state.isUploading = false;
            state.uploadProgress = 100;
          });
          
          console.log('[DocumentsStore] Document uploaded successfully:', result.data.id);
          return result.data;
        } else {
          throw new Error(result.message || 'Failed to upload document');
        }
      } catch (error) {
        console.error('[DocumentsStore] Error uploading document:', error);
        set((state) => {
          state.error = error.message;
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

        const response = await fetch(`${AUTH_BASE_URL}/documents/${documentId}`, {
          method: 'DELETE',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        
        if (result.success) {
          set((state) => {
            // Remove document from the list
            state.documents = state.documents.filter(doc => doc.id !== documentId);
          });
          
          console.log('[DocumentsStore] Document deleted successfully');
          return true;
        } else {
          throw new Error(result.message || 'Failed to delete document');
        }
      } catch (error) {
        console.error('[DocumentsStore] Error deleting document:', error);
        set((state) => {
          state.error = error.message;
        });
        throw error;
      }
    },

    // Search documents
    searchDocuments: async (query, limit = 5) => {
      set((state) => {
        state.isSearching = true;
        state.error = null;
      });

      try {
        console.log('[DocumentsStore] Searching documents:', { query, limit });

        const response = await fetch(`${AUTH_BASE_URL}/documents/search`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query, limit }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        
        if (result.success) {
          set((state) => {
            state.searchResults = result.data || [];
            state.isSearching = false;
          });
          
          console.log(`[DocumentsStore] Found ${result.data?.length || 0} search results`);
          return result.data || [];
        } else {
          throw new Error(result.message || 'Failed to search documents');
        }
      } catch (error) {
        console.error('[DocumentsStore] Error searching documents:', error);
        set((state) => {
          state.error = error.message;
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

        const response = await fetch(`${AUTH_BASE_URL}/documents/${documentId}/metadata`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ title: newTitle.trim() }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        
        if (result.success) {
          set((state) => {
            const docIndex = state.documents.findIndex(doc => doc.id === documentId);
            if (docIndex !== -1) {
              state.documents[docIndex] = {
                ...state.documents[docIndex],
                title: newTitle.trim()
              };
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

        const response = await fetch(`${AUTH_BASE_URL}/documents/${documentId}/content`, {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        
        if (result.success) {
          set((state) => {
            const docIndex = state.documents.findIndex(doc => doc.id === documentId);
            if (docIndex !== -1) {
              state.documents[docIndex] = {
                ...state.documents[docIndex],
                ...result.data
              };
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
  };
}));