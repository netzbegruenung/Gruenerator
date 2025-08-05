import { create } from 'zustand';
import {
  SHAREPIC_TYPES,
  FORM_STEPS,
  FONT_SIZES,
  ERROR_MESSAGES,
  DEFAULT_COLORS,
} from '../components/utils/constants';

const initialState = {
  // Form Data
  type: '',
  thema: '',
  details: '',
  line1: '',
  line2: '',
  line3: '',
  quote: '',
  name: '',
  // Info sharepic fields
  header: '',
  subheader: '',
  body: '',
  fontSize: FONT_SIZES.M,
  balkenOffset: [50, -100, 50],
  colorScheme: DEFAULT_COLORS,
  balkenGruppenOffset: [0, 0],
  sunflowerOffset: [0, 0],
  credit: '',
  searchTerms: [],
  sloganAlternatives: [],
  
  // Cross-component editing state
  editingSource: null, // null, 'presseSocial', 'sharepicGenerator'
  originalSharepicData: null, // Store original data for reference
  
  // UI State
  currentStep: FORM_STEPS.WELCOME,
  isAdvancedEditingOpen: false,
  isSearchBarActive: false,
  isSubmitting: false,
  currentSubmittingStep: null,
  
  // Loading/Error State
  loading: false,
  error: null,
  isLoadingUnsplashImages: false,
  unsplashError: null,
  
  // Image State
  uploadedImage: null,
  file: null,
  selectedImage: null,
  generatedImageSrc: null,
  unsplashImages: [],
  
  // Alt text state
  altText: '',
  isAltTextLoading: false,
  altTextError: null,
  showAltText: false
};

const useSharepicStore = create((set, get) => ({
  // Initialize with default state
  ...initialState,

  // Form data updates
  updateFormData: (data) => {
    console.log('[SharepicStore] updateFormData called with:', JSON.stringify(data));
    
    set((state) => {
      const safeData = { ...data };
      
      // Validate balkenOffset
      if ('balkenOffset' in safeData && !Array.isArray(safeData.balkenOffset)) {
        console.warn('Invalid balkenOffset in updateFormData:', safeData.balkenOffset);
        delete safeData.balkenOffset; // Remove invalid values
      }
      
      console.log('[SharepicStore] Updating state with:', JSON.stringify(safeData));
      return {
        ...state,
        ...safeData,
        loading: safeData.loading !== undefined ? safeData.loading : state.loading,
        generatedImageSrc: safeData.generatedImageSrc !== undefined ? safeData.generatedImageSrc : state.generatedImageSrc,
        selectedImage: safeData.selectedImage || state.selectedImage,
      };
    });
  },

  // Handle form field changes
  handleChange: (e) => {
    const { name, value } = e.target;
    set((state) => ({ ...state, [name]: value }));
  },

  // Step navigation
  setCurrentStep: (step) => {
    console.log('[SharepicStore] setCurrentStep:', step);
    set({ currentStep: step });
  },

  // Loading states
  setLoading: (loading) => set({ loading }),
  setLoadingUnsplashImages: (loading) => set({ isLoadingUnsplashImages: loading }),

  // Error handling
  setError: (error) => set({ error }),
  setUnsplashError: (error) => set({ unsplashError: error }),

  // File handling
  setFile: (file) => set({ file }),
  setUploadedImage: (image) => set({ uploadedImage: image }),

  // Image handling
  setSelectedImage: (image) => set({ selectedImage: image }),
  setGeneratedImage: (src) => set({ generatedImageSrc: src }),
  setUnsplashImages: (images) => {
    console.log('SharepicStore: Setting new unsplash images', images);
    set({ 
      unsplashImages: images,
      isLoadingUnsplashImages: false 
    });
  },

  // UI state
  setSearchBarActive: (isActive) => set({ isSearchBarActive: isActive }),
  setAdvancedEditing: (isOpen) => set({ isAdvancedEditingOpen: isOpen }),
  toggleAdvancedEditing: () => {
    const { isAdvancedEditingOpen } = get();
    set({ isAdvancedEditingOpen: !isAdvancedEditingOpen });
  },
  setSubmitting: (isSubmitting, step = null) => set({ 
    isSubmitting, 
    currentSubmittingStep: step 
  }),

  // Alt text state management
  setAltText: (text) => set({ altText: text }),
  setAltTextLoading: (loading) => set({ isAltTextLoading: loading }),
  setAltTextError: (error) => set({ altTextError: error }),
  toggleAltText: () => set((state) => ({ showAltText: !state.showAltText })),
  setShowAltText: (show) => set({ showAltText: show }),

  // Reset functionality
  resetUnsplashState: () => set({
    unsplashImages: [],
    isLoadingUnsplashImages: false,
    unsplashError: null,
    selectedImage: null
  }),
  resetStore: () => set({
    ...initialState,
    // Reset alt text state as well
    altText: '',
    isAltTextLoading: false,
    altTextError: null,
    showAltText: false
  }),

  // Advanced editing controls
  updateBalkenGruppenOffset: (newOffset) => set({ balkenGruppenOffset: newOffset }),
  updateSunflowerOffset: (newOffset) => set({ sunflowerOffset: newOffset }),
  updateCredit: (credit) => set({ credit }),

  // Slogan handling
  setSloganAlternatives: (alternatives) => set({ sloganAlternatives: alternatives }),
  setAlternatives: (alternatives) => set({ sloganAlternatives: alternatives }), // Alias for backward compatibility
  selectSlogan: (slogan) => set({
    line1: slogan.line1,
    line2: slogan.line2,
    line3: slogan.line3
  }),
  handleSloganSelect: (selected) => {
    const { type } = get();
    if (type === 'Zitat') {
      get().updateFormData({ quote: selected.quote });
    } else {
      get().selectSlogan(selected);
    }
  },

  // Unsplash integration
  handleUnsplashSearch: (query) => {
    if (!query) return;
    const searchUrl = `https://unsplash.com/de/s/fotos/${encodeURIComponent(query)}?license=free`;
    window.open(searchUrl, '_blank');
  },

  // Image modification state updates
  updateImageModification: (modificationData) => {
    console.log('[SharepicStore] updateImageModification:', modificationData);
    
    set((state) => ({
      ...state,
      colorScheme: modificationData.colorScheme || state.colorScheme,
      fontSize: modificationData.fontSize || state.fontSize,
      balkenOffset: Array.isArray(modificationData.balkenOffset) 
        ? modificationData.balkenOffset 
        : (Array.isArray(state.balkenOffset) ? state.balkenOffset : [50, -100, 50]),
    }));

    // Note: Image modification API call is now handled by useSharepicModification hook
  },





  // Load sharepic data for cross-component editing
  loadSharepicForEditing: (sharepicData, source = 'presseSocial') => {
    console.log('[SharepicStore] Loading sharepic for editing:', { sharepicData, source });
    
    const state = get();
    const newState = {
      editingSource: source,
      originalSharepicData: sharepicData,
      generatedImageSrc: sharepicData.image,
      currentStep: FORM_STEPS.RESULT,
    };

    // Map sharepic data to store fields based on type
    if (sharepicData.type === 'info') {
      // Parse the text back into Info fields
      const lines = sharepicData.text.split('\n').filter(line => line.trim());
      newState.type = 'Info';
      newState.header = lines[0] || '';
      newState.subheader = lines[1] || '';
      newState.body = lines.slice(2).join('\n') || '';
    } else if (sharepicData.type === 'quote' || sharepicData.type === 'quote_pure') {
      // Parse quote data
      const quoteMatch = sharepicData.text.match(/^"(.*)" - (.*)$/);
      if (quoteMatch) {
        newState.type = sharepicData.type === 'quote_pure' ? 'Zitat_Pure' : 'Zitat';
        newState.quote = quoteMatch[1];
        newState.name = quoteMatch[2];
      }
    } else if (sharepicData.type === 'dreizeilen' || sharepicData.type === 'headline') {
      // Parse three-line data
      const lines = sharepicData.text.split('\n').filter(line => line.trim());
      newState.type = sharepicData.type === 'headline' ? 'Headline' : 'Dreizeilen';
      newState.line1 = lines[0] || '';
      newState.line2 = lines[1] || '';
      newState.line3 = lines[2] || '';
    }

    set(newState);
  },


  // Clear editing state
  clearEditingState: () => {
    set({
      editingSource: null,
      originalSharepicData: null
    });
  },

  // Constants access
  SHAREPIC_TYPES,
  FORM_STEPS,
  FONT_SIZES,
  ERROR_MESSAGES,
}));


export default useSharepicStore;