import { create } from 'zustand';

const useCitationStore = create<any>((set, get) => ({
  // Current selected citation for modal display
  selectedCitation: null,
  
  // Set the selected citation (opens modal)
  setSelectedCitation: (citation) => set({ selectedCitation: citation }),
  
  // Close the citation modal
  closeCitationModal: () => set({ selectedCitation: null }),
  
  // Check if modal is open
  isModalOpen: () => {
    const state = get();
    return !!state.selectedCitation;
  }
}));

export default useCitationStore;