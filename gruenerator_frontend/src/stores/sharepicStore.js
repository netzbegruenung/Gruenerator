import { create } from 'zustand';
import { debounce } from 'lodash';
import { prepareDataForDreizeilenCanvas, prepareDataForQuoteCanvas } from '../features/sharepic/dreizeilen/utils/dataPreparation';
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
  fontSize: FONT_SIZES.M,
  balkenOffset: [50, -100, 50],
  colorScheme: DEFAULT_COLORS,
  balkenGruppenOffset: [0, 0],
  sunflowerOffset: [0, 0],
  credit: '',
  searchTerms: [],
  sloganAlternatives: [],
  
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

  // Image modification
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

    const { currentStep } = get();
    if (currentStep === FORM_STEPS.RESULT) {
      get().debouncedModifyImage(modificationData);
    }
  },

  // Image generation and modification
  modifyImage: async (modificationData) => {
    const state = get();
    try {
      console.log('Modifying image with data:', modificationData);
      const formDataToSend = prepareDataForDreizeilenCanvas(state, modificationData, state.file);

      const response = await fetch('/api/dreizeilen_canvas', {
        method: 'POST',
        body: formDataToSend,
      });

      if (!response.ok) {
        throw new Error(ERROR_MESSAGES.NETWORK_ERROR);
      }

      const result = await response.json();
      if (!result.image) {
        throw new Error(ERROR_MESSAGES.NO_IMAGE_DATA);
      }

      set({
        generatedImageSrc: result.image,
        fontSize: modificationData.fontSize,
        balkenOffset: modificationData.balkenOffset,
        colorScheme: modificationData.colorScheme,
        credit: modificationData.credit,
      });

      console.log('Image successfully modified');
      return result.image;
    } catch (error) {
      console.error('Error in modifyImage:', error);
      set({ error: error.message });
      throw error;
    }
  },

  // Create debounced version of modifyImage (will be set after store creation)
  debouncedModifyImage: null,

  // Generate image function
  generateImage: async (modificationData) => {
    const state = get();
    try {
      const isQuote = state.type === 'Zitat';
      const formDataToSend = isQuote 
        ? prepareDataForQuoteCanvas(state, modificationData)
        : prepareDataForDreizeilenCanvas(state, modificationData);

      const endpoint = isQuote ? 'zitat_canvas' : 'dreizeilen_canvas';
      const response = await fetch(`/api/${endpoint}`, {
        method: 'POST',
        body: formDataToSend
      });

      if (!response.ok) {
        throw new Error('Fehler beim Generieren des Bildes');
      }

      const data = await response.json();
      return data.image;
    } catch (error) {
      console.error('Fehler beim Generieren des Bildes:', error);
      throw error;
    }
  },

  // Generate quote function
  generateQuote: async (thema, details, existingQuote = '', name = '') => {
    try {
      const response = await fetch('/api/zitat_claude', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          thema,
          details,
          quote: existingQuote,
          name
        })
      });

      if (!response.ok) {
        throw new Error('Fehler bei der Zitat-Generierung');
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Fehler bei der Zitat-Generierung:', error);
      throw error;
    }
  },

  // Constants access
  SHAREPIC_TYPES,
  FORM_STEPS,
  FONT_SIZES,
  ERROR_MESSAGES,
}));

// Initialize the debounced modify image function after store creation
useSharepicStore.setState((state) => ({
  debouncedModifyImage: debounce(state.modifyImage, 300)
}));

export default useSharepicStore;