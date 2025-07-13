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
    antragGliederung: null,
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
  // New: User texts state
  availableTexts: [],
  selectedTextIds: [],
  isLoadingTexts: false,
  // New: UI Configuration state
  uiConfig: {
    enableKnowledge: false,
    enableDocuments: false,
    enableTexts: false,
    enableSourceSelection: false
  },
};

/**
 * Zustand store to manage knowledge selection state within generators.
 * Now the single source of truth for all knowledge and instructions.
 */
export const useGeneratorKnowledgeStore = create(immer((set, get) => {
  // Store instance created
  
  return {
    ...initialState,

  setSource: (source) => set((state) => {
    // setSource called
    state.source = source;
    // Reset selections when source changes
    state.availableKnowledge = [];
    state.selectedKnowledgeIds = [];
    state.isLoading = !!source && source.type !== 'neutral';
    // Reset instructions when source changes
    state.instructions = { antrag: null, antragGliederung: null, social: null, universal: null, gruenejugend: null };
    state.isInstructionsActive = false;
    // Reset documents when source changes (documents are user-scoped, not source-scoped)
    // Only clear if switching to neutral to avoid unnecessary reloads
    if (source.type === 'neutral') {
      state.availableDocuments = [];
      state.selectedDocumentIds = [];
      state.isLoadingDocuments = false;
      state.availableTexts = [];
      state.selectedTextIds = [];
      state.isLoadingTexts = false;
    }
  }),

  setAvailableKnowledge: (items) => set((state) => {
    // setAvailableKnowledge called
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
        // toggleSelection: REMOVED
      } else {
        state.selectedKnowledgeIds.push(id);
        // toggleSelection: ADDED
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
    // setAvailableDocuments called
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
        // toggleDocumentSelection: REMOVED
      } else {
        state.selectedDocumentIds.push(documentId);
        // toggleDocumentSelection: ADDED
      }
    });
  },

  // Helper: Generate document and text content for API (now with intelligent vector search)
  getDocumentContent: async (searchQuery = null) => {
    const state = get();
    const { setExtractingDocumentContent, getTextContent } = get();
    
    const hasDocuments = state.selectedDocumentIds.length > 0;
    const hasTexts = state.selectedTextIds.length > 0;
    
    if (!hasDocuments && !hasTexts) return null;
    
    const selectedDocuments = hasDocuments ? state.availableDocuments.filter(doc => 
      state.selectedDocumentIds.includes(doc.id)
    ) : [];
    
    // Get text content synchronously
    const textContent = hasTexts ? getTextContent() : null;

    // If we have a search query and documents, use intelligent content extraction
    if (searchQuery && searchQuery.trim() && hasDocuments && selectedDocuments.length > 0) {
      try {
        if (process.env.NODE_ENV === 'development') {
          console.log('[KnowledgeStore] Using intelligent document content extraction with query:', searchQuery);
        }
        
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
            if (process.env.NODE_ENV === 'development') {
              console.log('[KnowledgeStore] Vector search returned', result.results.length, 'intelligent document contents');
            }
            
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
            
            // Combine intelligent document content with text content
            const combinedContent = [intelligentContents, textContent].filter(Boolean).join('\n\n===\n\n');
            return combinedContent || null;
          }
        } else {
          if (process.env.NODE_ENV === 'development') {
            console.warn('[KnowledgeStore] Vector search API failed, falling back to simple extraction');
          }
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
    if (process.env.NODE_ENV === 'development') {
      console.log('[KnowledgeStore] Using simple document and text content extraction (fallback)');
    }
    
    // Generate document content
    const documentContent = hasDocuments ? selectedDocuments.map(doc => {
      // For short documents (≤2 pages), include full content
      // For longer documents, use smart excerpt
      const isShortDocument = (doc.page_count || 0) <= 2;
      let content = doc.ocr_text || '';
      
      if (!isShortDocument && content.length > 2000) {
        // Smart truncation for longer documents - take first portion
        content = content.substring(0, 1500) + '\n\n[... Dokument gekürzt ...]';
      }
      
      return `## Dokument: ${doc.title}\n**Datei:** ${doc.filename}\n**Seiten:** ${doc.page_count || 'Unbekannt'}\n**Inhalt:** ${isShortDocument ? 'Volltext' : 'Intelligenter Auszug'}\n\n${content}`;
    }).join('\n\n---\n\n') : null;
    
    // Combine document and text content
    const combinedContent = [documentContent, textContent].filter(Boolean).join('\n\n===\n\n');
    return combinedContent || null;
  },

  // Helper: Get selected documents for display
  getSelectedDocuments: () => {
    const state = get();
    return state.availableDocuments.filter(doc => 
      state.selectedDocumentIds.includes(doc.id)
    );
  },

  // New: Text management functions
  setAvailableTexts: (texts) => set((state) => {
    // setAvailableTexts called
    state.availableTexts = texts || [];
    state.isLoadingTexts = false;
  }),

  setLoadingTexts: (isLoading) => set((state) => {
    state.isLoadingTexts = isLoading;
  }),

  // Helper: Handle text loading errors
  handleTextLoadError: (error) => set((state) => {
    console.error('[KnowledgeStore] Text loading error:', error);
    state.isLoadingTexts = false;
    // Keep existing texts if any
  }),

  toggleTextSelection: (textId) => {
    const currentState = get();
    const wasSelected = currentState.selectedTextIds.includes(textId);
    
    set((state) => {
      if (wasSelected) {
        state.selectedTextIds = state.selectedTextIds.filter(id => id !== textId);
        // toggleTextSelection: REMOVED
      } else {
        state.selectedTextIds.push(textId);
        // toggleTextSelection: ADDED
      }
    });
  },

  // Helper: Fetch user texts
  fetchTexts: async () => {
    const state = get();
    const { setLoadingTexts, setAvailableTexts, handleTextLoadError } = get();
    
    setLoadingTexts(true);
    
    try {
      // Fetching user texts
      
      const AUTH_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
      const response = await fetch(`${AUTH_BASE_URL}/user-texts`, {
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
        if (process.env.NODE_ENV === 'development') {
          console.log(`[KnowledgeStore] Fetched ${result.data?.length || 0} texts`);
        }
        setAvailableTexts(result.data || []);
      } else {
        throw new Error(result.message || 'Failed to fetch texts');
      }
    } catch (error) {
      console.error('[KnowledgeStore] Error fetching texts:', error);
      handleTextLoadError(error);
      setAvailableTexts([]); // Clear texts on error
    }
  },

  // Helper: Get selected texts for display
  getSelectedTexts: () => {
    const state = get();
    return state.availableTexts.filter(text => 
      state.selectedTextIds.includes(text.id)
    );
  },

  // Helper: Generate text content for API
  getTextContent: () => {
    const state = get();
    if (state.selectedTextIds.length === 0) return null;
    
    const selectedTexts = state.availableTexts.filter(text => 
      state.selectedTextIds.includes(text.id)
    );
    
    if (selectedTexts.length === 0) return null;

    return selectedTexts.map(text => {
      const textType = text.type || 'text';
      const typeDisplayName = {
        'antrag': 'Antrag',
        'social': 'Social Media',
        'universal': 'Universeller Text',
        'press': 'Pressemitteilung',
        'gruene_jugend': 'Grüne Jugend',
        'text': 'Allgemeiner Text'
      }[textType] || textType;
      
      const content = text.full_content || text.content || '';
      
      return `## Text: ${text.title}\n**Typ:** ${typeDisplayName}\n**Wörter:** ${text.word_count || 'Unbekannt'}\n**Erstellt:** ${new Date(text.created_at).toLocaleDateString()}\n\n${content}`;
    }).join('\n\n---\n\n');
  },

  // New: UI Configuration management
  setUIConfig: (config) => set((state) => {
    const oldConfig = { ...state.uiConfig };
    const newConfig = { ...state.uiConfig, ...config };
    // setUIConfig called
    state.uiConfig = newConfig;
  }),

  reset: () => {
    // reset() called
    return set(initialState);
  },
  };
})); 