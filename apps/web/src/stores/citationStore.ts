import { create } from 'zustand';

interface Citation {
  index?: number | string;
  title?: string;
  url?: string;
  source?: string;
  content?: string;
  cited_text?: string;
  document_title?: string;
  similarity_score?: number;
  document_id?: string;
  [key: string]: unknown;
}

interface CitationState {
  selectedCitation: Citation | null;
  setSelectedCitation: (citation: Citation | null) => void;
  closeCitationModal: () => void;
  isModalOpen: () => boolean;
}

const useCitationStore = create<CitationState>((set, get) => ({
  // Current selected citation for modal display
  selectedCitation: null,

  // Set the selected citation (opens modal)
  setSelectedCitation: (citation: Citation | null) => set({ selectedCitation: citation }),

  // Close the citation modal
  closeCitationModal: () => set({ selectedCitation: null }),

  // Check if modal is open
  isModalOpen: () => {
    const state = get();
    return !!state.selectedCitation;
  }
}));

export default useCitationStore;