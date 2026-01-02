import { create } from 'zustand';
import apiClient from '../components/utils/apiClient';
import { DEFAULT_COLORS } from '../components/utils/constants';
import {
  IMAGE_STUDIO_CATEGORIES,
  IMAGE_STUDIO_TYPES,
  KI_SUBCATEGORIES,
  FORM_STEPS,
  TYPE_CONFIG,
  getTypeConfig
} from '../features/image-studio/utils/typeConfig';

// Font size constants
const FONT_SIZES = {
  S: 75,
  M: 85,
  L: 105
} as const;

// Type for font size keys
type FontSizeKey = keyof typeof FONT_SIZES;

// Color scheme interface
interface ColorScheme {
  primary?: string;
  secondary?: string;
  background?: string;
  text?: string;
  [key: string]: string | undefined;
}

// Veranstaltung field font sizes
interface VeranstaltungFieldFontSizes {
  eventTitle: number;
  beschreibung: number;
  weekday: number;
  date: number;
  time: number;
  locationName: number;
  address: number;
}

// Slogan alternative interface
interface SloganAlternative {
  line1?: string;
  line2?: string;
  line3?: string;
  line4?: string;
  line5?: string;
  quote?: string;
  name?: string;
  header?: string;
  subheader?: string;
  body?: string;
  eventTitle?: string;
  beschreibung?: string;
  weekday?: string;
  date?: string;
  time?: string;
  locationName?: string;
  address?: string;
  [key: string]: string | undefined;
}

// Stock image attribution
interface StockImageAttributionData {
  photographer: string;
  profileUrl: string;
  photoUrl: string;
}

// Stock image interface
interface StockImage {
  filename: string;
  attribution?: StockImageAttributionData;
  category?: string;
  url?: string;
  alt_text?: string;
  [key: string]: any;
}

// Selected image (Unsplash format)
interface SelectedImageData {
  urls: {
    regular: string;
    small: string;
    thumb?: string;
    full?: string;
    raw?: string;
  };
  alt_description?: string;
  user?: {
    name: string;
    links?: {
      html: string;
    };
  };
  [key: string]: any;
}

// Image limit data (rate limiting)
interface ImageLimitData {
  remaining: number;
  limit: number;
  resetTime?: number;
  [key: string]: any;
}

// Original sharepic data for editing
interface OriginalSharepicData {
  image?: string;
  type?: string;
  text?: string;
  [key: string]: any;
}

// Gallery edit data
interface GalleryEditData {
  shareToken: string;
  content?: {
    sharepicType?: string;
    header?: string;
    subheader?: string;
    body?: string;
    quote?: string;
    name?: string;
    line1?: string;
    line2?: string;
    line3?: string;
    line4?: string;
    line5?: string;
    [key: string]: any;
  };
  styling?: {
    sharepicType?: string;
    fontSize?: number;
    colorScheme?: ColorScheme;
    balkenOffset?: number[];
    balkenGruppenOffset?: [number, number];
    sunflowerOffset?: [number, number];
    credit?: string;
    veranstaltungFieldFontSizes?: VeranstaltungFieldFontSizes;
    [key: string]: any;
  };
  originalImageUrl?: string;
  title?: string;
}

// Edit session data from sessionStorage
interface EditSessionData {
  data?: {
    type?: string;
    text?: string;
    imageSessionId?: string;
    hasImage?: boolean;
    [key: string]: any;
  };
  source?: string;
}

// Preloaded image result
interface PreloadedImageResult {
  imageSrc?: string;
  [key: string]: any;
}

// Form data update partial
interface FormDataUpdate {
  loading?: boolean;
  generatedImageSrc?: string | null;
  selectedImage?: SelectedImageData | null;
  balkenOffset?: number[];
  colorScheme?: ColorScheme;
  fontSize?: number;
  quote?: string;
  header?: string;
  subheader?: string;
  body?: string;
  eventTitle?: string;
  beschreibung?: string;
  weekday?: string;
  date?: string;
  time?: string;
  locationName?: string;
  address?: string;
  [key: string]: any;
}

// Image modification data
interface ImageModificationData {
  colorScheme?: ColorScheme;
  fontSize?: number;
  balkenOffset?: number[];
  [key: string]: any;
}

// Store state interface
interface ImageStudioState {
  // Category and type selection
  category: string | null;
  subcategory: string | null;
  type: string | null;

  // Sharepic form data
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

  // Veranstaltung-specific fields
  eventTitle: string;
  beschreibung: string;
  weekday: string;
  date: string;
  time: string;
  locationName: string;
  address: string;

  // Sharepic image modifications
  fontSize: number;
  balkenOffset: number[];
  colorScheme: ColorScheme;
  balkenGruppenOffset: [number, number];
  sunflowerOffset: [number, number];
  credit: string;
  searchTerms: string[];
  sloganAlternatives: SloganAlternative[];

  // Veranstaltung per-field font sizes
  veranstaltungFieldFontSizes: VeranstaltungFieldFontSizes;

  // Campaign fields (legacy)
  campaignId: string;
  campaignTypeId: string;

  // Imagine-specific fields
  precisionMode: boolean;
  precisionInstruction: string;
  selectedInfrastructure: string[];
  variant: string | null;
  imagineTitle: string;
  purePrompt: string;
  sharepicPrompt: string;
  allyPlacement: string | null;

  // Cross-component editing state
  editingSource: string | null;
  originalSharepicData: OriginalSharepicData | null;
  isEditSession: boolean;
  hasOriginalImage: boolean;

  // Gallery edit mode state
  galleryEditMode: boolean;
  editShareToken: string | null;
  editTitle: string | null;

  // UI State
  currentStep: string;
  isAdvancedEditingOpen: boolean;
  isSearchBarActive: boolean;
  isSubmitting: boolean;
  currentSubmittingStep: string | null;

  // Loading/Error State
  loading: boolean;
  error: string | null;
  isLoadingUnsplashImages: boolean;
  unsplashError: string | null;

  // Image State
  uploadedImage: File | Blob | null;
  file: File | Blob | null;
  selectedImage: SelectedImageData | null;
  generatedImageSrc: string | null;
  unsplashImages: any[];

  // Alt text state
  altText: string;
  isAltTextLoading: boolean;
  altTextError: string | null;
  showAltText: boolean;

  // Rate limiting (for KI types)
  imageLimitData: ImageLimitData | null;

  // Step wizard animation state
  navigationDirection: 'forward' | 'back';
  isAnimating: boolean;
  previousStep: string | null;

  // Slogan alternative image caching
  cachedSloganImages: Record<number, string>;
  currentAlternativeIndex: number;

  // Auto-save state
  autoSaveStatus: 'idle' | 'saving' | 'saved' | 'error';
  autoSavedShareToken: string | null;
  lastAutoSavedImageSrc: string | null;

  // Flow title (dynamic header)
  flowTitle: string | null;
  flowSubtitle: string | null;

  // Stock images state
  imageSourceTab: 'upload' | 'stock' | 'unsplash';
  stockImages: StockImage[];
  stockImageCategories: string[];
  isLoadingStockImages: boolean;
  stockImagesError: string | null;
  selectedStockImage: StockImage | null;
  stockImageAttribution: StockImageAttributionData | null;
  stockImageCategory: string | null;

  // Parallel preload state
  preloadedImageResult: PreloadedImageResult | null;
  slogansReady: boolean;
}

// Store actions interface
interface ImageStudioActions {
  // Category and type selection
  setCategory: (category: string | null, subcategory?: string | null) => void;
  setSubcategory: (subcategory: string | null) => void;
  setType: (type: string | null) => void;

  // Form data updates
  updateFormData: (data: FormDataUpdate) => void;
  handleChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;

  // Step navigation
  setCurrentStep: (step: string) => void;
  goBack: () => void;
  goToNextStep: () => void;

  // Step wizard animation state
  setNavigationDirection: (direction: 'forward' | 'back') => void;
  setIsAnimating: (isAnimating: boolean) => void;

  // Loading states
  setLoading: (loading: boolean) => void;
  setLoadingUnsplashImages: (loading: boolean) => void;

  // Error handling
  setError: (error: string | null) => void;
  setUnsplashError: (error: string | null) => void;

  // File handling
  setFile: (file: File | Blob | null) => void;
  setUploadedImage: (image: File | Blob | null) => void;

  // Image handling
  setSelectedImage: (image: SelectedImageData | null) => void;
  setGeneratedImage: (src: string | null) => void;
  setUnsplashImages: (images: any[]) => void;

  // UI state
  setSearchBarActive: (isActive: boolean) => void;
  setAdvancedEditing: (isOpen: boolean) => void;
  toggleAdvancedEditing: () => void;
  setSubmitting: (isSubmitting: boolean, step?: string | null) => void;

  // Alt text state management
  setAltText: (text: string) => void;
  setAltTextLoading: (loading: boolean) => void;
  setAltTextError: (error: string | null) => void;
  toggleAltText: () => void;
  setShowAltText: (show: boolean) => void;

  // Rate limit data
  setImageLimitData: (data: ImageLimitData | null) => void;

  // Imagine-specific state
  setPrecisionMode: (mode: boolean) => void;
  setPrecisionInstruction: (instruction: string) => void;
  setSelectedInfrastructure: (infrastructure: string[]) => void;
  setVariant: (variant: string | null) => void;
  setImagineTitle: (title: string) => void;
  setPurePrompt: (prompt: string) => void;
  setSharepicPrompt: (prompt: string) => void;
  setAllyPlacement: (placement: string | null) => void;

  // Veranstaltung per-field font size controls
  updateFieldFontSize: (fieldName: keyof VeranstaltungFieldFontSizes, value: number) => void;
  resetFieldFontSizes: () => void;

  // Reset functionality
  resetUnsplashState: () => void;
  resetToTypeSelect: () => void;
  resetToCategorySelect: () => void;
  resetStore: () => void;

  // Advanced editing controls
  updateBalkenGruppenOffset: (newOffset: number[]) => void;
  updateSunflowerOffset: (newOffset: number[]) => void;
  updateCredit: (credit: string) => void;

  // Slogan handling
  setSloganAlternatives: (alternatives: SloganAlternative[]) => void;
  setAlternatives: (alternatives: SloganAlternative[]) => void;
  selectSlogan: (slogan: SloganAlternative) => void;
  handleSloganSelect: (selected: SloganAlternative) => void;

  // Slogan image caching
  cacheSloganImage: (alternativeIndex: number, imageSrc: string | null) => void;
  getCachedSloganImage: (alternativeIndex: number) => string | null;
  clearSloganImageCache: () => void;
  setCurrentAlternativeIndex: (index: number) => void;

  // Unsplash integration
  handleUnsplashSearch: (query: string) => void;

  // Stock images
  setImageSourceTab: (tab: 'upload' | 'stock' | 'unsplash') => void;
  fetchStockImages: (category?: string | null) => Promise<StockImage[]>;
  setStockImageCategory: (category: string | null) => void;
  selectStockImage: (image: StockImage | null) => Promise<File | undefined>;
  resetStockImageState: () => void;

  // Image modification state updates
  updateImageModification: (modificationData: ImageModificationData) => void;

  // Load data for editing
  loadSharepicForEditing: (sharepicData: OriginalSharepicData, source?: string) => void;
  clearEditingState: () => void;
  loadGalleryEditData: (editData: GalleryEditData) => Promise<Record<string, any>>;
  loadEditSessionData: (editSessionId: string) => Promise<Record<string, any> | null>;
  clearGalleryEditState: () => void;

  // Auto-save state management
  setAutoSaveStatus: (status: 'idle' | 'saving' | 'saved' | 'error') => void;
  setAutoSavedShareToken: (token: string | null) => void;
  setLastAutoSavedImageSrc: (src: string | null) => void;
  clearAutoSaveState: () => void;

  // Flow title and subtitle
  setFlowTitle: (title: string | null) => void;
  setFlowSubtitle: (subtitle: string | null) => void;

  // Parallel preload state management
  setPreloadedImageResult: (result: PreloadedImageResult | null) => void;
  setSlogansReady: (value: boolean) => void;
  clearPreloadState: () => void;

  // Helper methods
  isKiType: () => boolean;
  hasRateLimit: () => boolean;
}

// Constants exposed on store
interface ImageStudioConstants {
  IMAGE_STUDIO_CATEGORIES: typeof IMAGE_STUDIO_CATEGORIES;
  IMAGE_STUDIO_TYPES: typeof IMAGE_STUDIO_TYPES;
  KI_SUBCATEGORIES: typeof KI_SUBCATEGORIES;
  FORM_STEPS: typeof FORM_STEPS;
  FONT_SIZES: typeof FONT_SIZES;
  DEFAULT_COLORS: typeof DEFAULT_COLORS;
}

// Combined store type
type ImageStudioStore = ImageStudioState & ImageStudioActions & ImageStudioConstants;

// Initial state
const initialState: ImageStudioState = {
  // Category and type selection
  category: null,
  subcategory: null,
  type: null,

  // Sharepic form data
  thema: '',
  details: '',
  line1: '',
  line2: '',
  line3: '',
  line4: '',
  line5: '',
  quote: '',
  name: '',
  header: '',
  subheader: '',
  body: '',
  description: '',
  mood: '',

  // Veranstaltung-specific fields
  eventTitle: '',
  beschreibung: '',
  weekday: '',
  date: '',
  time: '',
  locationName: '',
  address: '',

  // Sharepic image modifications
  fontSize: FONT_SIZES.M,
  balkenOffset: [50, -100, 50],
  colorScheme: DEFAULT_COLORS as unknown as ColorScheme,
  balkenGruppenOffset: [0, 0],
  sunflowerOffset: [0, 0],
  credit: '',
  searchTerms: [],
  sloganAlternatives: [],

  // Veranstaltung per-field font sizes (in pixels)
  veranstaltungFieldFontSizes: {
    eventTitle: 94,
    beschreibung: 62,
    weekday: 57,
    date: 55,
    time: 55,
    locationName: 42,
    address: 42
  },

  // Campaign fields (legacy)
  campaignId: '',
  campaignTypeId: '',

  // Imagine-specific fields
  precisionMode: false,
  precisionInstruction: '',
  selectedInfrastructure: [],
  variant: null,
  imagineTitle: '',
  purePrompt: '',
  sharepicPrompt: '',
  allyPlacement: null,

  // Cross-component editing state
  editingSource: null,
  originalSharepicData: null,
  isEditSession: false,
  hasOriginalImage: false,

  // Gallery edit mode state
  galleryEditMode: false,
  editShareToken: null,
  editTitle: null,

  // UI State
  currentStep: FORM_STEPS.CATEGORY_SELECT,
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
  showAltText: false,

  // Rate limiting (for KI types)
  imageLimitData: null,

  // Step wizard animation state
  navigationDirection: 'forward',
  isAnimating: false,
  previousStep: null,

  // Slogan alternative image caching
  cachedSloganImages: {},
  currentAlternativeIndex: -1,

  // Auto-save state
  autoSaveStatus: 'idle',
  autoSavedShareToken: null,
  lastAutoSavedImageSrc: null,

  // Flow title (dynamic header)
  flowTitle: null,
  flowSubtitle: null,

  // Stock images state
  imageSourceTab: 'upload',
  stockImages: [],
  stockImageCategories: [],
  isLoadingStockImages: false,
  stockImagesError: null,
  selectedStockImage: null,
  stockImageAttribution: null,
  stockImageCategory: null,

  // Parallel preload state
  preloadedImageResult: null,
  slogansReady: false
};

const useImageStudioStore = create<ImageStudioStore>((set, get) => ({
  ...initialState,

  // Category and type selection
  setCategory: (category, subcategory = null) => {
    set({
      category,
      subcategory,
      type: null,
      currentStep: FORM_STEPS.TYPE_SELECT,
      error: null
    });
  },

  setSubcategory: (subcategory) => {
    set({
      subcategory,
      type: null,
      currentStep: FORM_STEPS.TYPE_SELECT,
      error: null
    });
  },

  setType: (type) => {
    const config = getTypeConfig(type);
    const firstStep = config?.steps?.[0] || FORM_STEPS.INPUT;
    set({
      type,
      currentStep: firstStep,
      error: null,
      precisionMode: config?.alwaysPrecision || false
    });
  },

  // Form data updates
  updateFormData: (data) => {
    set((state) => {
      const safeData = { ...data };

      if ('balkenOffset' in safeData && !Array.isArray(safeData.balkenOffset)) {
        delete safeData.balkenOffset;
      }

      return {
        ...state,
        ...safeData,
        loading: safeData.loading !== undefined ? safeData.loading : state.loading,
        generatedImageSrc: safeData.generatedImageSrc !== undefined ? safeData.generatedImageSrc : state.generatedImageSrc,
        selectedImage: safeData.selectedImage || state.selectedImage,
      };
    });
  },

  handleChange: (e) => {
    const { name, value } = e.target;
    set((state) => ({ ...state, [name]: value }));
  },

  // Step navigation
  setCurrentStep: (step) => {
    set({ currentStep: step });
  },

  goBack: () => {
    const { currentStep, type, category, subcategory } = get();
    const config = type ? getTypeConfig(type) : null;

    set({ navigationDirection: 'back', previousStep: currentStep });

    if (currentStep === FORM_STEPS.TYPE_SELECT) {
      if (subcategory) {
        set({ subcategory: null, type: null });
        return;
      }
      set({ currentStep: FORM_STEPS.CATEGORY_SELECT, category: null, subcategory: null, type: null });
      return;
    }

    if (config?.steps) {
      const currentIndex = config.steps.indexOf(currentStep);
      if (currentIndex > 0) {
        set({ currentStep: config.steps[currentIndex - 1] });
        return;
      }
    }

    set({ currentStep: FORM_STEPS.TYPE_SELECT, type: null });
  },

  goToNextStep: () => {
    const { currentStep, type } = get();
    const config = type ? getTypeConfig(type) : null;

    set({ navigationDirection: 'forward', previousStep: currentStep });

    if (config?.steps) {
      const currentIndex = config.steps.indexOf(currentStep);
      if (currentIndex < config.steps.length - 1) {
        set({ currentStep: config.steps[currentIndex + 1] });
      }
    }
  },

  // Step wizard animation state
  setNavigationDirection: (direction) => set({ navigationDirection: direction }),
  setIsAnimating: (isAnimating) => set({ isAnimating }),

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

  // Rate limit data (for KI types)
  setImageLimitData: (data) => set({ imageLimitData: data }),

  // Imagine-specific state
  setPrecisionMode: (mode) => set({ precisionMode: mode }),
  setPrecisionInstruction: (instruction) => set({ precisionInstruction: instruction }),
  setSelectedInfrastructure: (infrastructure) => set({ selectedInfrastructure: infrastructure }),
  setVariant: (variant) => set({ variant }),
  setImagineTitle: (title) => set({ imagineTitle: title }),
  setPurePrompt: (prompt) => set({ purePrompt: prompt }),
  setSharepicPrompt: (prompt) => set({ sharepicPrompt: prompt }),
  setAllyPlacement: (placement) => set({ allyPlacement: placement }),

  // Veranstaltung per-field font size controls (px-based)
  updateFieldFontSize: (fieldName, value) => {
    const baseFontSizes: VeranstaltungFieldFontSizes = {
      eventTitle: 94, beschreibung: 62,
      weekday: 57, date: 55, time: 55, locationName: 42, address: 42
    };
    const base = baseFontSizes[fieldName] || 60;
    const minPx = Math.round(base * 0.7);
    const maxPx = Math.round(base * 1.3);
    set((state) => ({
      veranstaltungFieldFontSizes: {
        ...state.veranstaltungFieldFontSizes,
        [fieldName]: Math.max(minPx, Math.min(maxPx, value))
      }
    }));
  },
  resetFieldFontSizes: () => {
    set({
      veranstaltungFieldFontSizes: {
        eventTitle: 94,
        beschreibung: 62,
        weekday: 57,
        date: 55,
        time: 55,
        locationName: 42,
        address: 42
      }
    });
  },

  // Reset functionality
  resetUnsplashState: () => set({
    unsplashImages: [],
    isLoadingUnsplashImages: false,
    unsplashError: null,
    selectedImage: null
  }),

  resetToTypeSelect: () => {
    const { category } = get();
    set({
      ...initialState,
      category,
      currentStep: FORM_STEPS.TYPE_SELECT
    });
  },

  resetToCategorySelect: () => {
    set({
      ...initialState,
      currentStep: FORM_STEPS.CATEGORY_SELECT
    });
  },

  resetStore: () => set({
    ...initialState
  }),

  // Advanced editing controls
  updateBalkenGruppenOffset: (newOffset: [number, number]) => set({ balkenGruppenOffset: newOffset }),
  updateSunflowerOffset: (newOffset: [number, number]) => set({ sunflowerOffset: newOffset }),
  updateCredit: (credit) => set({ credit }),

  // Slogan handling
  setSloganAlternatives: (alternatives) => set({ sloganAlternatives: alternatives }),
  setAlternatives: (alternatives) => set({ sloganAlternatives: alternatives }),
  selectSlogan: (slogan) => set({
    line1: slogan.line1 || '',
    line2: slogan.line2 || '',
    line3: slogan.line3 || '',
    line4: slogan.line4 || '',
    line5: slogan.line5 || ''
  }),
  handleSloganSelect: (selected) => {
    const { type } = get();
    const config = getTypeConfig(type);

    if (config?.legacyType === 'Zitat' || config?.legacyType === 'Zitat_Pure') {
      get().updateFormData({ quote: selected.quote });
    } else if (config?.legacyType === 'Info') {
      get().updateFormData({
        header: selected.header,
        subheader: selected.subheader,
        body: selected.body
      });
    } else if (config?.legacyType === 'Veranstaltung') {
      get().updateFormData({
        eventTitle: selected.eventTitle,
        beschreibung: selected.beschreibung,
        weekday: selected.weekday,
        date: selected.date,
        time: selected.time,
        locationName: selected.locationName,
        address: selected.address
      });
    } else {
      get().selectSlogan(selected);
    }
  },

  // Slogan image caching for alternative switching
  cacheSloganImage: (alternativeIndex, imageSrc) => {
    if (!imageSrc) return;
    const { cachedSloganImages } = get();
    set({ cachedSloganImages: { ...cachedSloganImages, [alternativeIndex]: imageSrc } });
  },
  getCachedSloganImage: (alternativeIndex) => {
    const { cachedSloganImages } = get();
    return cachedSloganImages[alternativeIndex] || null;
  },
  clearSloganImageCache: () => set({ cachedSloganImages: {}, currentAlternativeIndex: -1 }),
  setCurrentAlternativeIndex: (index) => set({ currentAlternativeIndex: index }),

  // Unsplash integration
  handleUnsplashSearch: (query) => {
    if (!query) return;
    const searchUrl = `https://unsplash.com/de/s/fotos/${encodeURIComponent(query)}?license=free`;
    window.open(searchUrl, '_blank');
  },

  // Stock images
  setImageSourceTab: (tab) => set({ imageSourceTab: tab }),

  fetchStockImages: async (category = null) => {
    set({ isLoadingStockImages: true, stockImagesError: null });

    try {
      const url = category && category !== 'all'
        ? `/image-picker/stock-catalog?category=${category}`
        : '/image-picker/stock-catalog';

      const response = await apiClient.get(url);

      if (response.data.success) {
        set({
          stockImages: response.data.images,
          stockImageCategories: response.data.categories || [],
          isLoadingStockImages: false,
          stockImageCategory: category
        });
        return response.data.images;
      } else {
        throw new Error(response.data.error || 'Failed to fetch stock images');
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || error.message || 'Failed to fetch stock images';
      set({ isLoadingStockImages: false, stockImagesError: errorMessage });
      throw new Error(errorMessage);
    }
  },

  setStockImageCategory: (category) => {
    set({ stockImageCategory: category });
    get().fetchStockImages(category);
  },

  selectStockImage: async (image) => {
    if (!image) {
      set({
        selectedStockImage: null,
        stockImageAttribution: null
      });
      return;
    }

    set({
      selectedStockImage: image,
      stockImageAttribution: image.attribution ?? null
    });

    try {
      const imageUrl = `${apiClient.defaults.baseURL}/image-picker/stock-image/${image.filename}`;
      const response = await fetch(imageUrl);

      if (!response.ok) {
        throw new Error('Failed to fetch stock image');
      }

      const blob = await response.blob();
      const file = new File([blob], image.filename, { type: blob.type || 'image/jpeg' });

      set({
        uploadedImage: file,
        file: file
      });

      return file;
    } catch (error) {
      console.error('[ImageStudioStore] Failed to load stock image:', error);
      throw error;
    }
  },

  resetStockImageState: () => set({
    imageSourceTab: 'upload',
    stockImages: [],
    stockImageCategories: [],
    isLoadingStockImages: false,
    stockImagesError: null,
    selectedStockImage: null,
    stockImageAttribution: null,
    stockImageCategory: null
  }),

  // Image modification state updates
  updateImageModification: (modificationData) => {
    set((state) => ({
      ...state,
      colorScheme: modificationData.colorScheme || state.colorScheme,
      fontSize: modificationData.fontSize || state.fontSize,
      balkenOffset: Array.isArray(modificationData.balkenOffset)
        ? modificationData.balkenOffset
        : (Array.isArray(state.balkenOffset) ? state.balkenOffset : [50, -100, 50]),
    }));
  },

  // Load data for editing
  loadSharepicForEditing: (sharepicData, source = 'presseSocial') => {
    const newState: Partial<ImageStudioState> = {
      editingSource: source,
      originalSharepicData: sharepicData,
      generatedImageSrc: sharepicData.image || null,
      currentStep: FORM_STEPS.RESULT,
      category: IMAGE_STUDIO_CATEGORIES.TEMPLATES
    };

    if (sharepicData.type === 'info') {
      const lines = (sharepicData.text || '').split('\n').filter((line: string) => line.trim());
      (newState as any).type = IMAGE_STUDIO_TYPES.INFO;
      newState.header = lines[0] || '';
      newState.subheader = lines[1] || '';
      newState.body = lines.slice(2).join('\n') || '';
    } else if (sharepicData.type === 'quote' || sharepicData.type === 'quote_pure') {
      let quoteMatch = (sharepicData.text || '').match(/^"(.*)" - (.*)$/);

      if (!quoteMatch) {
        const lastDashIndex = (sharepicData.text || '').lastIndexOf(' - ');
        if (lastDashIndex !== -1) {
          const quote = sharepicData.text!.substring(0, lastDashIndex);
          const name = sharepicData.text!.substring(lastDashIndex + 3);
          quoteMatch = [null, quote, name] as any;
        }
      }

      if (quoteMatch) {
        (newState as any).type = sharepicData.type === 'quote_pure' ? IMAGE_STUDIO_TYPES.ZITAT_PURE : IMAGE_STUDIO_TYPES.ZITAT;
        newState.quote = quoteMatch[1];
        newState.name = quoteMatch[2];
      }
    } else if (sharepicData.type === 'dreizeilen') {
      const lines = (sharepicData.text || '').split('\n').filter((line: string) => line.trim());
      (newState as any).type = IMAGE_STUDIO_TYPES.DREIZEILEN;
      newState.line1 = lines[0] || '';
      newState.line2 = lines[1] || '';
      newState.line3 = lines[2] || '';
    }

    set(newState as ImageStudioState);
  },

  clearEditingState: () => {
    set({
      editingSource: null,
      originalSharepicData: null,
      galleryEditMode: false,
      editShareToken: null,
      editTitle: null
    });
  },

  // Load data from gallery for editing
  loadGalleryEditData: async (editData) => {
    const { shareToken, content, styling, originalImageUrl, title } = editData;
    const sharepicType = content?.sharepicType || styling?.sharepicType;

    // Map legacy type names to IMAGE_STUDIO_TYPES
    const typeMap: Record<string, string> = {
      'Dreizeilen': IMAGE_STUDIO_TYPES.DREIZEILEN,
      'Zitat': IMAGE_STUDIO_TYPES.ZITAT,
      'Zitat_Pure': IMAGE_STUDIO_TYPES.ZITAT_PURE,
      'Info': IMAGE_STUDIO_TYPES.INFO
    };

    const mappedType = sharepicType ? (typeMap[sharepicType] || sharepicType) : null;

    // Build form data from saved content and styling
    const formData: Record<string, any> = {
      galleryEditMode: true,
      editShareToken: shareToken,
      editTitle: title,
      isEditSession: true,
      hasOriginalImage: true,
      category: IMAGE_STUDIO_CATEGORIES.TEMPLATES,
      type: mappedType,
      currentStep: FORM_STEPS.RESULT,
      editingSource: 'gallery'
    };

    // Apply styling parameters
    if (styling) {
      if (styling.fontSize) formData.fontSize = styling.fontSize;
      if (styling.colorScheme) formData.colorScheme = styling.colorScheme;
      if (styling.balkenOffset) formData.balkenOffset = styling.balkenOffset;
      if (styling.balkenGruppenOffset) formData.balkenGruppenOffset = styling.balkenGruppenOffset;
      if (styling.sunflowerOffset) formData.sunflowerOffset = styling.sunflowerOffset;
      if (styling.credit) formData.credit = styling.credit;
      if (styling.veranstaltungFieldFontSizes) formData.veranstaltungFieldFontSizes = styling.veranstaltungFieldFontSizes;
    }

    // Apply content based on type
    if (content) {
      if (sharepicType === 'Info') {
        formData.header = content.header || '';
        formData.subheader = content.subheader || '';
        formData.body = content.body || '';
      } else if (sharepicType === 'Zitat' || sharepicType === 'Zitat_Pure') {
        formData.quote = content.quote || '';
        formData.name = content.name || '';
      } else {
        formData.line1 = content.line1 || '';
        formData.line2 = content.line2 || '';
        formData.line3 = content.line3 || '';
        if (content.line4) formData.line4 = content.line4;
        if (content.line5) formData.line5 = content.line5;
      }
    }

    // Fetch original background image if URL is provided
    if (originalImageUrl) {
      try {
        // Strip /api prefix since apiClient baseURL already includes it
        const urlPath = originalImageUrl.startsWith('/api') ? originalImageUrl.slice(4) : originalImageUrl;
        const response = await apiClient.get(urlPath, { responseType: 'blob' });
        formData.uploadedImage = response.data;
        formData.file = response.data;
      } catch (error) {
        console.warn('[ImageStudioStore] Failed to fetch original image:', error);
      }
    }

    set(formData as Partial<ImageStudioState>);
    return formData;
  },

  // Load data from editSession (from PresseSocialGenerator)
  loadEditSessionData: async (editSessionId) => {
    try {
      const sessionDataStr = sessionStorage.getItem(editSessionId);
      if (!sessionDataStr) {
        console.warn('[ImageStudioStore] No session data found for:', editSessionId);
        return null;
      }

      const sessionData: EditSessionData = JSON.parse(sessionDataStr);
      const { data, source } = sessionData;

      if (!data) {
        console.warn('[ImageStudioStore] Invalid session data structure');
        return null;
      }

      const typeMap: Record<string, string> = {
        'dreizeilen': IMAGE_STUDIO_TYPES.DREIZEILEN,
        'default': IMAGE_STUDIO_TYPES.DREIZEILEN,
        'zitat': IMAGE_STUDIO_TYPES.ZITAT,
        'zitat-pure': IMAGE_STUDIO_TYPES.ZITAT_PURE,
        'info': IMAGE_STUDIO_TYPES.INFO
      };

      const mappedType = data.type ? (typeMap[data.type] || IMAGE_STUDIO_TYPES.DREIZEILEN) : IMAGE_STUDIO_TYPES.DREIZEILEN;

      const formData: Record<string, any> = {
        category: IMAGE_STUDIO_CATEGORIES.TEMPLATES,
        type: mappedType,
        currentStep: FORM_STEPS.INPUT,
        editingSource: source || 'external',
        isEditSession: true
      };

      if (data.text) {
        if (mappedType === IMAGE_STUDIO_TYPES.ZITAT || mappedType === IMAGE_STUDIO_TYPES.ZITAT_PURE) {
          formData.quote = data.text;
        } else if (mappedType === IMAGE_STUDIO_TYPES.INFO) {
          formData.body = data.text;
        } else {
          const lines = data.text.split('\n').filter((l: string) => l.trim());
          formData.line1 = lines[0] || '';
          formData.line2 = lines[1] || '';
          formData.line3 = lines[2] || '';
        }
      }

      if (data.imageSessionId && data.hasImage) {
        try {
          const response = await apiClient.get(`/sharepic/edit-session/${data.imageSessionId}`);
          const imageData = response.data;
          if (imageData.imageData) {
            const fetchRes = await fetch(imageData.imageData);
            const blob = await fetchRes.blob();
            formData.uploadedImage = blob;
            formData.file = blob;
            formData.hasOriginalImage = !!imageData.hasOriginalImage;
          }
        } catch (error: any) {
          console.warn('[ImageStudioStore] Failed to fetch session image:', error);
        }
      }

      sessionStorage.removeItem(editSessionId);

      set(formData as Partial<ImageStudioState>);
      return formData;
    } catch (error) {
      console.error('[ImageStudioStore] Error loading edit session:', error);
      return null;
    }
  },

  // Clear gallery edit state
  clearGalleryEditState: () => {
    set({
      galleryEditMode: false,
      editShareToken: null,
      editTitle: null
    });
  },

  // Auto-save state management
  setAutoSaveStatus: (status) => set({ autoSaveStatus: status }),
  setAutoSavedShareToken: (token) => set({ autoSavedShareToken: token }),
  setLastAutoSavedImageSrc: (src) => set({ lastAutoSavedImageSrc: src }),
  clearAutoSaveState: () => set({
    autoSaveStatus: 'idle',
    autoSavedShareToken: null,
    lastAutoSavedImageSrc: null
  }),

  // Flow title and subtitle (dynamic header per step)
  setFlowTitle: (title) => set({ flowTitle: title }),
  setFlowSubtitle: (subtitle) => set({ flowSubtitle: subtitle }),

  // Parallel preload state management
  setPreloadedImageResult: (result) => set({ preloadedImageResult: result }),
  setSlogansReady: (value) => set({ slogansReady: value }),
  clearPreloadState: () => set({
    preloadedImageResult: null,
    slogansReady: false
  }),

  // Helper to check if current type uses FLUX API
  isKiType: () => {
    const { type } = get();
    const config = getTypeConfig(type);
    return config?.usesFluxApi || false;
  },

  // Helper to check if current type has rate limit
  hasRateLimit: () => {
    const { type } = get();
    const config = getTypeConfig(type);
    return config?.hasRateLimit || false;
  },

  // Constants access
  IMAGE_STUDIO_CATEGORIES,
  IMAGE_STUDIO_TYPES,
  KI_SUBCATEGORIES,
  FORM_STEPS,
  FONT_SIZES,
  DEFAULT_COLORS
}));

export default useImageStudioStore;

// Export types for use in components
export type {
  VeranstaltungFieldFontSizes,
  StockImageAttributionData,
  SelectedImageData,
  StockImage,
  SloganAlternative,
  ColorScheme,
  ImageStudioStore
};
