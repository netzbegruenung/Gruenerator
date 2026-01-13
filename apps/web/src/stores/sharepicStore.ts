import React from 'react';
import { create } from 'zustand';
import {
  SHAREPIC_TYPES,
  FORM_STEPS,
  FONT_SIZES,
  ERROR_MESSAGES,
  DEFAULT_COLORS,
} from '../components/utils/constants';

// Color scheme type - can be either an object or array of background objects
type ColorScheme = { background: string }[] | {
  primary?: string;
  secondary?: string;
  background?: string;
  text?: string;
};

// Slogan structure
interface Slogan {
  line1?: string;
  line2?: string;
  line3?: string;
  line4?: string;
  line5?: string;
  quote?: string;
}

// Unsplash image interface
interface UnsplashImage {
  id: string;
  urls?: {
    thumb?: string;
    small?: string;
    regular?: string;
    full?: string;
  };
  alt_description?: string;
}

// Sharepic data for editing
interface SharepicData {
  type?: string;
  text?: string;
  image?: string | null;
  line1?: string;
  line2?: string;
  line3?: string;
  quote?: string;
  name?: string;
  header?: string;
  subheader?: string;
  body?: string;
}

// State interface
interface SharepicState {
  type: string;
  thema: string;
  details: string;
  line1: string;
  line2: string;
  line3: string;
  line4: string;
  line5: string;
  quote: string;
  name: string;
  header: string;
  subheader: string;
  body: string;
  description: string;
  mood: string;
  fontSize: number;
  balkenOffset: number[];
  colorScheme: ColorScheme;
  balkenGruppenOffset: number[];
  sunflowerOffset: number[];
  credit: string;
  searchTerms: string[];
  sloganAlternatives: Slogan[];
  campaignId: string;
  campaignTypeId: string;
  editingSource: string | null;
  originalSharepicData: SharepicData | null;
  isEditSession: boolean;
  hasOriginalImage: boolean;
  currentStep: string;
  isAdvancedEditingOpen: boolean;
  isSearchBarActive: boolean;
  isSubmitting: boolean;
  currentSubmittingStep: string | null;
  loading: boolean;
  error: string | null;
  isLoadingUnsplashImages: boolean;
  unsplashError: string | null;
  uploadedImage: string | null;
  file: File | null;
  selectedImage: string | null;
  generatedImageSrc: string | null;
  unsplashImages: UnsplashImage[];
  altText: string;
  isAltTextLoading: boolean;
  altTextError: string | null;
  showAltText: boolean;
}

// Actions interface
interface SharepicActions {
  updateFormData: (data: Partial<SharepicState>) => void;
  handleChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  setCurrentStep: (step: string) => void;
  setLoading: (loading: boolean) => void;
  setLoadingUnsplashImages: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setUnsplashError: (error: string | null) => void;
  setFile: (file: File | null) => void;
  setUploadedImage: (image: string | null) => void;
  setSelectedImage: (image: string | null) => void;
  setGeneratedImage: (src: string | null) => void;
  setUnsplashImages: (images: UnsplashImage[]) => void;
  setSearchBarActive: (isActive: boolean) => void;
  setAdvancedEditing: (isOpen: boolean) => void;
  toggleAdvancedEditing: () => void;
  setSubmitting: (isSubmitting: boolean, step?: string | null) => void;
  setAltText: (text: string) => void;
  setAltTextLoading: (loading: boolean) => void;
  setAltTextError: (error: string | null) => void;
  toggleAltText: () => void;
  setShowAltText: (show: boolean) => void;
  resetUnsplashState: () => void;
  resetStore: () => void;
  updateBalkenGruppenOffset: (newOffset: number[]) => void;
  updateSunflowerOffset: (newOffset: number[]) => void;
  updateCredit: (credit: string) => void;
  setSloganAlternatives: (alternatives: Slogan[]) => void;
  setAlternatives: (alternatives: Slogan[]) => void;
  selectSlogan: (slogan: Slogan) => void;
  handleSloganSelect: (selected: Slogan) => void;
  handleUnsplashSearch: (query: string) => void;
  updateImageModification: (modificationData: Partial<SharepicState>) => void;
  loadSharepicForEditing: (sharepicData: SharepicData, source?: string) => void;
  clearEditingState: () => void;
}

// Constants interface
interface SharepicConstants {
  SHAREPIC_TYPES: typeof SHAREPIC_TYPES;
  FORM_STEPS: typeof FORM_STEPS;
  FONT_SIZES: typeof FONT_SIZES;
  ERROR_MESSAGES: typeof ERROR_MESSAGES;
}

// Combined store type
type SharepicStore = SharepicState & SharepicActions & SharepicConstants;

const initialState: SharepicState = {
  // Form Data
  type: '',
  thema: '',
  details: '',
  line1: '',
  line2: '',
  line3: '',
  line4: '',
  line5: '',
  quote: '',
  name: '',
  // Info sharepic fields
  header: '',
  subheader: '',
  body: '',
  // Text2Sharepic fields
  description: '',
  mood: '',
  fontSize: FONT_SIZES.S,
  balkenOffset: [50, -100, 50],
  colorScheme: DEFAULT_COLORS,
  balkenGruppenOffset: [0, 0],
  sunflowerOffset: [0, 0],
  credit: '',
  searchTerms: [],
  sloganAlternatives: [],
  // Campaign fields
  campaignId: '',
  campaignTypeId: '',
  
  // Cross-component editing state
  editingSource: null, // null, 'presseSocial', 'sharepicGenerator'
  originalSharepicData: null, // Store original data for reference
  isEditSession: false, // Track if this is an edit session
  hasOriginalImage: false, // Track if original had an image
  
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

const useSharepicStore = create<SharepicStore>((set, get) => ({
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
    line3: slogan.line3,
    line4: slogan.line4 || '',
    line5: slogan.line5 || ''
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

    const newState: Partial<SharepicState> = {
      editingSource: source,
      originalSharepicData: sharepicData,
      generatedImageSrc: sharepicData.image,
      currentStep: FORM_STEPS.RESULT,
    };

    // Map sharepic data to store fields based on type
    if (sharepicData.type === 'info' && sharepicData.text) {
      // Parse the text back into Info fields
      const lines = sharepicData.text.split('\n').filter((line: string) => line.trim());
      newState.type = 'Info';
      newState.header = lines[0] || '';
      newState.subheader = lines[1] || '';
      newState.body = lines.slice(2).join('\n') || '';
    } else if ((sharepicData.type === 'quote' || sharepicData.type === 'quote_pure') && sharepicData.text) {
      // Parse quote data - handle both quoted and unquoted formats
      let quoteMatch: (string | null)[] | null = sharepicData.text.match(/^"(.*)" - (.*)$/);

      if (!quoteMatch) {
        // Try without quotes - fallback to splitting by " - "
        const lastDashIndex = sharepicData.text.lastIndexOf(' - ');
        if (lastDashIndex !== -1) {
          const quote = sharepicData.text.substring(0, lastDashIndex);
          const name = sharepicData.text.substring(lastDashIndex + 3);
          quoteMatch = [null, quote, name]; // Simulate regex match array
        }
      }

      if (quoteMatch) {
        newState.type = sharepicData.type === 'quote_pure' ? 'Zitat_Pure' : 'Zitat';
        newState.quote = quoteMatch[1] || '';
        newState.name = quoteMatch[2] || '';
      }
    } else if (sharepicData.type === 'dreizeilen' && sharepicData.text) {
      // Parse three-line data
      const lines = sharepicData.text.split('\n').filter((line: string) => line.trim());
      newState.type = 'Dreizeilen';
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
export type { Slogan, SharepicData, UnsplashImage };