import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

const AUTH_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

const initialState = {
  documents: [],
  texts: [], // Add texts array for combined content
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
        // Fetching user documents
        
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
          // Documents fetched
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

    // Fetch combined content (documents + texts) for improved performance
    fetchCombinedContent: async () => {
      set((state) => {
        state.isLoading = true;
        state.error = null;
      });

      try {
        const response = await fetch(`${AUTH_BASE_URL}/documents/combined-content`, {
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
            state.documents = result.data.documents || [];
            state.texts = result.data.texts || [];
            state.isLoading = false;
          });
          return result.data;
        } else {
          throw new Error(result.message || 'Failed to fetch combined content');
        }
      } catch (error) {
        console.error('[DocumentsStore] Error fetching combined content:', error);
        set((state) => {
          state.error = error.message;
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

        // Create FormData
        const formData = new FormData();
        formData.append('document', file);
        formData.append('title', title);
        if (groupId) {
          formData.append('group_id', groupId);
        }

        // Upload to manual vectors-only endpoint
        const response = await fetch(`${AUTH_BASE_URL}/documents/upload-manual`, {
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
          
          console.log('[DocumentsStore] Document vectorized successfully:', result.data.id);
          return result.data;
        } else {
          throw new Error(result.message || 'Failed to process document');
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

    // Crawl URL and create document (vectors-only manual mode)
    crawlUrl: async (url, title, groupId = null) => {
      set((state) => {
        state.isUploading = true; // Reuse upload state for crawling
        state.uploadProgress = 0;
        state.error = null;
      });

      try {
        console.log('[DocumentsStore] Crawling URL (manual mode):', { url, title, groupId });

        const response = await fetch(`${AUTH_BASE_URL}/documents/crawl-url-manual`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            url: url.trim(), 
            title: title.trim(),
            group_id: groupId 
          }),
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
          
          console.log('[DocumentsStore] URL crawled and vectorized successfully:', result.data.id);
          return result.data;
        } else {
          throw new Error(result.message || 'Failed to crawl and process URL');
        }
      } catch (error) {
        console.error('[DocumentsStore] Error crawling URL:', error);
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

        const response = await fetch(`${AUTH_BASE_URL}/documents/search`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query, limit, searchMode, documentIds }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        
        if (result.success) {
          set((state) => {
            state.searchResults = (result.data || []).map(item => ({
              ...item,
              // Ensure search_type is present per item for UI meta rendering
              search_type: item.search_type || result.searchType || searchMode
            }));
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

    // Browse files in a Wolke share
    browseWolkeFiles: async (shareLinkId) => {
      set((state) => {
        state.isLoading = true;
        state.error = null;
      });

      try {
        console.log('[DocumentsStore] Browsing Wolke files for share link:', shareLinkId);

        const response = await fetch(`${AUTH_BASE_URL}/documents/wolke/browse/${shareLinkId}`, {
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

        set((state) => {
          state.isLoading = false;
        });

        if (result.success) {
          console.log('[DocumentsStore] Wolke files loaded successfully:', result.files.length, 'files');
          return result;
        } else {
          throw new Error(result.message || 'Failed to browse Wolke files');
        }
      } catch (error) {
        console.error('[DocumentsStore] Error browsing Wolke files:', error);
        set((state) => {
          state.error = error.message;
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

      try {
        console.log('[DocumentsStore] Importing Wolke files:', { shareLinkId, fileCount: files.length });

        // Simulate progress updates during the import
        let progressInterval;
        if (onProgress) {
          let currentProgress = 0;
          progressInterval = setInterval(() => {
            if (currentProgress < 90) {
              currentProgress += Math.random() * 10;
              set((state) => {
                state.uploadProgress = Math.min(currentProgress, 90);
              });
              onProgress(Math.min(currentProgress, 90));
            }
          }, 200);
        }

        const response = await fetch(`${AUTH_BASE_URL}/documents/wolke/import`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            shareLinkId,
            files
          }),
        });

        // Clear progress interval
        if (progressInterval) {
          clearInterval(progressInterval);
        }

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();

        set((state) => {
          state.isUploading = false;
          state.uploadProgress = 100;
        });

        if (onProgress) {
          onProgress(100);
        }

        if (result.success) {
          console.log('[DocumentsStore] Wolke files imported successfully:', result.summary);

          // Refresh documents list to show newly imported files
          await get().fetchDocuments();

          return result;
        } else {
          throw new Error(result.message || 'Failed to import Wolke files');
        }
      } catch (error) {
        console.error('[DocumentsStore] Error importing Wolke files:', error);
        set((state) => {
          state.error = error.message;
          state.isUploading = false;
          state.uploadProgress = 0;
        });

        if (onProgress) {
          onProgress(0);
        }

        throw error;
      }
    },
  };
}));
