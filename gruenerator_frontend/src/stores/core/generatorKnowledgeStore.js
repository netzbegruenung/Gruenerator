import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

const initialState = {
  source: { type: 'neutral', id: null, name: null },
  availableKnowledge: [],
  selectedKnowledgeIds: [],
  isLoading: false,
  // New: Instructions state
  instructions: {
    antrag: null,
    social: null,
    universal: null,
    gruenejugend: null
  },
  isInstructionsActive: false,
  // New: Documents state
  availableDocuments: [],
  selectedDocumentIds: [],
  isLoadingDocuments: false,
  isExtractingDocumentContent: false,
  documentExtractionInfo: null,
};

/**
 * Zustand store to manage knowledge selection state within generators.
 * Now the single source of truth for all knowledge and instructions.
 */
export const useGeneratorKnowledgeStore = create(immer((set, get) => {
  console.log('[KnowledgeStore] Store instance created/re-created at:', new Date().toISOString());
  
  return {
    ...initialState,

  setSource: (source) => set((state) => {
    console.log('[KnowledgeStore] setSource called:', { 
      old: state.source, 
      new: source,
      stack: new Error().stack
    });
    state.source = source;
    // Reset selections when source changes
    state.availableKnowledge = [];
    state.selectedKnowledgeIds = [];
    state.isLoading = !!source && source.type !== 'neutral';
    // Reset instructions when source changes
    state.instructions = { antrag: null, social: null, universal: null, gruenejugend: null };
    state.isInstructionsActive = false;
    // Reset documents when source changes (documents are user-scoped, not source-scoped)
    // Only clear if switching to neutral to avoid unnecessary reloads
    if (source.type === 'neutral') {
      state.availableDocuments = [];
      state.selectedDocumentIds = [];
      state.isLoadingDocuments = false;
    }
  }),

  setAvailableKnowledge: (items) => set((state) => {
    console.log('[KnowledgeStore] setAvailableKnowledge called with', items?.length || 0, 'items:', items);
    state.availableKnowledge = items;
    state.isLoading = false;
  }),

  toggleSelection: (id) => {
    // Use setTimeout to batch multiple rapid toggles and reduce re-renders
    const currentState = get();
    const wasSelected = currentState.selectedKnowledgeIds.includes(id);
    
    set((state) => {
      if (wasSelected) {
        state.selectedKnowledgeIds = state.selectedKnowledgeIds.filter(selectedId => selectedId !== id);
        console.log('[KnowledgeStore] toggleSelection: REMOVED', id, 'Now selected:', state.selectedKnowledgeIds);
      } else {
        state.selectedKnowledgeIds.push(id);
        console.log('[KnowledgeStore] toggleSelection: ADDED', id, 'Now selected:', state.selectedKnowledgeIds);
      }
    });
  },
  
  setLoading: (isLoading) => set({ isLoading }),

  // New: Instructions management
  setInstructions: (instructions) => set((state) => {
    state.instructions = instructions;
  }),

  setInstructionsActive: (active) => set((state) => {
    state.isInstructionsActive = active;
  }),

  // Helper: Get active instruction for current context
  getActiveInstruction: (type) => {
    const state = get();
    if (!state.isInstructionsActive || !state.instructions) return null;
    return state.instructions[type] || null;
  },

  // Helper: Generate knowledge content for API
  getKnowledgeContent: () => {
    const state = get();
    if (state.selectedKnowledgeIds.length === 0) return null;
    
    const selectedItems = state.availableKnowledge.filter(item => 
      state.selectedKnowledgeIds.includes(item.id)
    );
    
    return selectedItems.map(item => {
      return `## ${item.title}\n${item.content}`;
    }).join('\n\n');
  },

  // New: Document management functions
  setAvailableDocuments: (documents) => set((state) => {
    console.log('[KnowledgeStore] setAvailableDocuments called with', documents?.length || 0, 'documents');
    state.availableDocuments = documents || [];
    state.isLoadingDocuments = false;
    // Clear any extraction status when documents change
    state.isExtractingDocumentContent = false;
    state.documentExtractionInfo = null;
  }),

  setLoadingDocuments: (isLoading) => set((state) => {
    state.isLoadingDocuments = isLoading;
  }),

  // Helper: Handle document loading errors
  handleDocumentLoadError: (error) => set((state) => {
    console.error('[KnowledgeStore] Document loading error:', error);
    state.isLoadingDocuments = false;
    state.isExtractingDocumentContent = false;
    state.documentExtractionInfo = null;
    // Keep existing documents if any
  }),

  setExtractingDocumentContent: (isExtracting, info = null) => set((state) => {
    state.isExtractingDocumentContent = isExtracting;
    state.documentExtractionInfo = info;
  }),

  toggleDocumentSelection: (documentId) => {
    const currentState = get();
    const wasSelected = currentState.selectedDocumentIds.includes(documentId);
    
    set((state) => {
      if (wasSelected) {
        state.selectedDocumentIds = state.selectedDocumentIds.filter(id => id !== documentId);
        console.log('[KnowledgeStore] toggleDocumentSelection: REMOVED', documentId, 'Now selected:', state.selectedDocumentIds);
      } else {
        state.selectedDocumentIds.push(documentId);
        console.log('[KnowledgeStore] toggleDocumentSelection: ADDED', documentId, 'Now selected:', state.selectedDocumentIds);
      }
    });
  },

  // Helper: Generate document content for API (now with intelligent vector search)
  getDocumentContent: async (searchQuery = null) => {
    const state = get();
    const { setExtractingDocumentContent } = get();
    
    if (state.selectedDocumentIds.length === 0) return null;
    
    const selectedDocuments = state.availableDocuments.filter(doc => 
      state.selectedDocumentIds.includes(doc.id)
    );
    
    if (selectedDocuments.length === 0) return null;

    // If we have a search query, use intelligent content extraction
    if (searchQuery && searchQuery.trim()) {
      try {
        console.log('[KnowledgeStore] Using intelligent document content extraction with query:', searchQuery);
        
        // Set loading state with info
        setExtractingDocumentContent(true, {
          type: 'vector_search',
          query: searchQuery,
          documentCount: selectedDocuments.length,
          message: `Extrahiere relevante Inhalte für "${searchQuery}" aus ${selectedDocuments.length} Dokument(en)...`
        });
        
        const response = await fetch('/api/documents/search-content', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            query: searchQuery.trim(),
            documentIds: state.selectedDocumentIds,
            limit: 5,
            mode: 'hybrid'
          }),
        });

        setExtractingDocumentContent(false);

        if (response.ok) {
          const result = await response.json();
          if (result.success && result.results) {
            console.log('[KnowledgeStore] Vector search returned', result.results.length, 'intelligent document contents');
            
            const intelligentContents = result.results.map(doc => {
              const contentType = doc.content_type === 'vector_search' ? 'Vector Search' :
                                doc.content_type === 'full_text' ? 'Volltext' : 'Intelligenter Auszug';
              
              return `## Dokument: ${doc.title}\n**Datei:** ${doc.filename}\n**Seiten:** ${doc.page_count || 'Unbekannt'}\n**Inhalt:** ${contentType}\n**Info:** ${doc.search_info}\n\n${doc.content}`;
            }).join('\n\n---\n\n');
            
            // Show success feedback briefly
            setExtractingDocumentContent(true, {
              type: 'success',
              message: `✅ Intelligente Inhalte aus ${result.results.length} Dokument(en) extrahiert`,
              vectorResults: result.metadata?.vector_search_results || 0,
              responseTime: result.metadata?.response_time_ms || 0
            });
            
            setTimeout(() => setExtractingDocumentContent(false), 2000);
            
            return intelligentContents;
          }
        } else {
          console.warn('[KnowledgeStore] Vector search API failed, falling back to simple extraction');
          setExtractingDocumentContent(true, {
            type: 'fallback',
            message: '⚠️ Vector Search fehlgeschlagen, verwende einfache Extraktion...'
          });
          setTimeout(() => setExtractingDocumentContent(false), 1500);
        }
      } catch (error) {
        console.error('[KnowledgeStore] Error in intelligent document content extraction:', error);
        setExtractingDocumentContent(true, {
          type: 'error',
          message: '⚠️ Fehler bei intelligenter Extraktion, verwende Fallback...'
        });
        setTimeout(() => setExtractingDocumentContent(false), 1500);
        // Fall back to simple extraction below
      }
    }

    // Fallback: Use simple content extraction (Phase 1 behavior)
    console.log('[KnowledgeStore] Using simple document content extraction (fallback)');
    
    return selectedDocuments.map(doc => {
      // For short documents (≤2 pages), include full content
      // For longer documents, use smart excerpt
      const isShortDocument = (doc.page_count || 0) <= 2;
      let content = doc.ocr_text || '';
      
      if (!isShortDocument && content.length > 2000) {
        // Smart truncation for longer documents - take first portion
        content = content.substring(0, 1500) + '\n\n[... Dokument gekürzt ...]';
      }
      
      return `## Dokument: ${doc.title}\n**Datei:** ${doc.filename}\n**Seiten:** ${doc.page_count || 'Unbekannt'}\n**Inhalt:** ${isShortDocument ? 'Volltext' : 'Intelligenter Auszug'}\n\n${content}`;
    }).join('\n\n---\n\n');
  },

  // Helper: Get selected documents for display
  getSelectedDocuments: () => {
    const state = get();
    return state.availableDocuments.filter(doc => 
      state.selectedDocumentIds.includes(doc.id)
    );
  },

  reset: () => {
    console.log('[KnowledgeStore] reset() called:', {
      stack: new Error().stack
    });
    return set(initialState);
  },
  };
})); 