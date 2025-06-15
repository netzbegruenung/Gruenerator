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
    social: null
  },
  isInstructionsActive: false,
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
    state.instructions = { antrag: null, social: null };
    state.isInstructionsActive = false;
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

  reset: () => {
    console.log('[KnowledgeStore] reset() called:', {
      stack: new Error().stack
    });
    return set(initialState);
  },
  };
})); 