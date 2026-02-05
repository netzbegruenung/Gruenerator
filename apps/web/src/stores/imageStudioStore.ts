import { create } from 'zustand';

import apiClient from '../components/utils/apiClient';
import { DEFAULT_COLORS } from '../components/utils/constants';
import {
  parseSharepicForEditing,
  loadGalleryEditData as loadGalleryEditDataService,
  loadEditSessionData as loadEditSessionDataService,
  parseAIGeneratedData,
} from '../features/image-studio/services/editingSessionService';
import {
  FONT_SIZES,
  type ColorScheme,
  type VeranstaltungFieldFontSizes,
  type SloganAlternative,
  type SelectedImageData,
  type ImageLimitData,
  type FormDataUpdate,
  type ImageModificationData,
  type ImageStudioState,
  type ImageStudioStore,
} from '../features/image-studio/types/storeTypes';
import {
  IMAGE_STUDIO_CATEGORIES,
  IMAGE_STUDIO_TYPES,
  KI_SUBCATEGORIES,
  FORM_STEPS,
  getTypeConfig,
} from '../features/image-studio/utils/typeConfig';

import type {
  GalleryEditData,
  OriginalSharepicData,
} from '../features/image-studio/services/editingSessionService';


// Initial state
const initialState = {
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
  headline: '',
  subtext: '',
  label: '',

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
    address: 42,
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
  selectedImageSize: null,

  // Cross-component editing state
  editingSource: null,
  originalSharepicData: null,
  isEditSession: false,
  hasOriginalImage: false,

  // Gallery edit mode state
  galleryEditMode: false,
  editShareToken: null,
  editTitle: null,
  templateCreator: null,

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
  transparentImage: null,

  // Rate limiting (for KI types)
  imageLimitData: null,

  // Step wizard animation state
  navigationDirection: 'forward',
  isAnimating: false,
  previousStep: null,

  // Slogan alternative image caching
  cachedSloganImages: {},
  currentAlternativeIndex: -1,

  // Flow title (dynamic header)
  flowTitle: null,
  flowSubtitle: null,

  // AI generation state
  aiGeneratedContent: false,

  // AI Editor history (undo/redo)
  aiEditorHistory: [],
  aiEditorHistoryIndex: -1,
  aiEditorSessionId: null,
  aiEditorMode: 'create' as const,
};

const useImageStudioStore = create<ImageStudioStore>((set, get) => {
  return {
    ...initialState,

    // Category and type selection
    setCategory: (category: string | null, subcategory: string | null = null) => {
      set({
        category,
        subcategory,
        type: null,
        currentStep: FORM_STEPS.TYPE_SELECT,
        error: null,
        aiGeneratedContent: false,
      });
    },

    setSubcategory: (subcategory: string | null) => {
      set({
        subcategory,
        type: null,
        currentStep: FORM_STEPS.TYPE_SELECT,
        error: null,
      });
    },

    setType: (type: string | null) => {
      const config = getTypeConfig(type || '');
      const firstStep = config?.steps?.[0] || FORM_STEPS.INPUT;
      set({
        type,
        currentStep: firstStep,
        error: null,
        precisionMode: config?.alwaysPrecision || false,
        aiGeneratedContent: false,
      });

      // Track usage for "last used" feature (fire-and-forget)
      if (type) {
        apiClient
          .post('/recent-values', {
            fieldType: 'image_studio_type',
            fieldValue: type,
            formName: 'image-studio',
          })
          .catch(() => {});
      }
    },

    // Form data updates
    updateFormData: (data: FormDataUpdate) => {
      set((state) => {
        const safeData = { ...data };

        if ('balkenOffset' in safeData && !Array.isArray(safeData.balkenOffset)) {
          delete safeData.balkenOffset;
        }

        return {
          ...state,
          ...safeData,
          loading: safeData.loading !== undefined ? safeData.loading : state.loading,
          generatedImageSrc:
            safeData.generatedImageSrc !== undefined
              ? safeData.generatedImageSrc
              : state.generatedImageSrc,
          selectedImage: safeData.selectedImage || state.selectedImage,
        };
      });
    },

    handleChange: (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
    ) => {
      const { name, value } = e.target;
      set((state) => ({ ...state, [name]: value }));
    },

    // Step navigation
    setCurrentStep: (step: string) => {
      set({ currentStep: step });
    },

    goBack: () => {
      const { currentStep, type, category, subcategory } = get();
      const config = type ? getTypeConfig(type) : null;

      set({ navigationDirection: 'back', previousStep: currentStep });

      if (currentStep === FORM_STEPS.TYPE_SELECT) {
        if (subcategory) {
          set({ subcategory: null, type: null, aiGeneratedContent: false });
          return;
        }
        set({
          currentStep: FORM_STEPS.CATEGORY_SELECT,
          category: null,
          subcategory: null,
          type: null,
          aiGeneratedContent: false,
        });
        return;
      }

      if (config?.steps) {
        const currentIndex = config.steps.indexOf(currentStep);
        if (currentIndex > 0) {
          set({ currentStep: config.steps[currentIndex - 1] });
          return;
        }
      }

      set({ currentStep: FORM_STEPS.TYPE_SELECT, type: null, aiGeneratedContent: false });
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
    setNavigationDirection: (direction: 'forward' | 'back') =>
      set({ navigationDirection: direction }),
    setIsAnimating: (isAnimating: boolean) => set({ isAnimating }),

    // Loading states
    setLoading: (loading: boolean) => set({ loading }),
    setLoadingUnsplashImages: (loading: boolean) => set({ isLoadingUnsplashImages: loading }),

    // Error handling
    setError: (error: string | null) => set({ error }),
    setUnsplashError: (error: string | null) => set({ unsplashError: error }),

    // File handling
    setFile: (file: File | Blob | null) => set({ file }),
    setUploadedImage: (image: File | Blob | null) => set({ uploadedImage: image }),

    // Image handling
    setSelectedImage: (image: SelectedImageData | null) => set({ selectedImage: image }),
    setGeneratedImage: (src: string | null) => set({ generatedImageSrc: src }),
    setUnsplashImages: (images: unknown[]) => {
      set({
        unsplashImages: images,
        isLoadingUnsplashImages: false,
      });
    },
    setTransparentImage: (image: string | null) => set({ transparentImage: image }),

    // UI state
    setSearchBarActive: (isActive: boolean) => set({ isSearchBarActive: isActive }),
    setAdvancedEditing: (isOpen: boolean) => set({ isAdvancedEditingOpen: isOpen }),
    toggleAdvancedEditing: () => {
      const { isAdvancedEditingOpen } = get();
      set({ isAdvancedEditingOpen: !isAdvancedEditingOpen });
    },
    setSubmitting: (isSubmitting: boolean, step: string | null = null) =>
      set({
        isSubmitting,
        currentSubmittingStep: step,
      }),

    // Rate limit data (for KI types)
    setImageLimitData: (data: ImageLimitData | null) => set({ imageLimitData: data }),

    // Imagine-specific state
    setPrecisionMode: (mode: boolean) => set({ precisionMode: mode }),
    setPrecisionInstruction: (instruction: string) => set({ precisionInstruction: instruction }),
    setSelectedInfrastructure: (infrastructure: string[]) =>
      set({ selectedInfrastructure: infrastructure }),
    setVariant: (variant: string | null) => set({ variant }),
    setImagineTitle: (title: string) => set({ imagineTitle: title }),
    setPurePrompt: (prompt: string) => set({ purePrompt: prompt }),
    setSharepicPrompt: (prompt: string) => set({ sharepicPrompt: prompt }),

    // Veranstaltung per-field font size controls (px-based)
    updateFieldFontSize: (fieldName: keyof VeranstaltungFieldFontSizes, value: number) => {
      const baseFontSizes: VeranstaltungFieldFontSizes = {
        eventTitle: 94,
        beschreibung: 62,
        weekday: 57,
        date: 55,
        time: 55,
        locationName: 42,
        address: 42,
      };
      const base = baseFontSizes[fieldName] || 60;
      const minPx = Math.round(base * 0.7);
      const maxPx = Math.round(base * 1.3);
      set((state) => ({
        veranstaltungFieldFontSizes: {
          ...state.veranstaltungFieldFontSizes,
          [fieldName]: Math.max(minPx, Math.min(maxPx, value)),
        },
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
          address: 42,
        },
      });
    },

    // Reset functionality
    resetUnsplashState: () =>
      set({
        unsplashImages: [],
        isLoadingUnsplashImages: false,
        unsplashError: null,
        selectedImage: null,
      }),

    resetToTypeSelect: () => {
      const { category } = get();
      set({
        ...(initialState as unknown as Partial<ImageStudioStore>),
        category,
        currentStep: FORM_STEPS.TYPE_SELECT,
      });
    },

    resetToCategorySelect: () => {
      set({
        ...(initialState as unknown as Partial<ImageStudioStore>),
        currentStep: FORM_STEPS.CATEGORY_SELECT,
      });
    },

    resetStore: () => set(initialState as unknown as Partial<ImageStudioStore>),

    // Advanced editing controls
    updateBalkenGruppenOffset: (newOffset: number[]) =>
      set({ balkenGruppenOffset: newOffset as [number, number] }),
    updateSunflowerOffset: (newOffset: number[]) =>
      set({ sunflowerOffset: newOffset as [number, number] }),
    updateCredit: (credit: string) => set({ credit }),

    // Slogan handling
    setSloganAlternatives: (alternatives: SloganAlternative[]) =>
      set({ sloganAlternatives: alternatives }),
    setAlternatives: (alternatives: SloganAlternative[]) =>
      set({ sloganAlternatives: alternatives }),
    selectSlogan: (slogan: SloganAlternative) =>
      set({
        line1: slogan.line1 || '',
        line2: slogan.line2 || '',
        line3: slogan.line3 || '',
        line4: slogan.line4 || '',
        line5: slogan.line5 || '',
      }),
    handleSloganSelect: (selected: SloganAlternative) => {
      const { type } = get();
      const config = getTypeConfig(type || '');

      if (config?.legacyType === 'Zitat' || config?.legacyType === 'Zitat_Pure') {
        get().updateFormData({ quote: selected.quote });
      } else if (config?.legacyType === 'Info') {
        get().updateFormData({
          header: selected.header,
          subheader: selected.subheader,
          body: selected.body,
        });
      } else if (config?.legacyType === 'Veranstaltung') {
        get().updateFormData({
          eventTitle: selected.eventTitle,
          beschreibung: selected.beschreibung,
          weekday: selected.weekday,
          date: selected.date,
          time: selected.time,
          locationName: selected.locationName,
          address: selected.address,
        });
      } else {
        get().selectSlogan(selected);
      }
    },

    // Slogan image caching for alternative switching
    cacheSloganImage: (alternativeIndex: number, imageSrc: string | null) => {
      if (!imageSrc) return;
      const { cachedSloganImages } = get();
      set({ cachedSloganImages: { ...cachedSloganImages, [alternativeIndex]: imageSrc } });
    },
    getCachedSloganImage: (alternativeIndex: number) => {
      const { cachedSloganImages } = get();
      return cachedSloganImages[alternativeIndex] || null;
    },
    clearSloganImageCache: () => set({ cachedSloganImages: {}, currentAlternativeIndex: -1 }),
    setCurrentAlternativeIndex: (index: number) => set({ currentAlternativeIndex: index }),

    // Unsplash integration
    handleUnsplashSearch: (query: string) => {
      if (!query) return;
      const searchUrl = `https://unsplash.com/de/s/fotos/${encodeURIComponent(query)}?license=free`;
      window.open(searchUrl, '_blank');
    },

    // Image modification state updates
    updateImageModification: (modificationData: ImageModificationData) => {
      set((state) => ({
        ...state,
        colorScheme: modificationData.colorScheme || state.colorScheme,
        fontSize: modificationData.fontSize || state.fontSize,
        balkenOffset: Array.isArray(modificationData.balkenOffset)
          ? modificationData.balkenOffset
          : Array.isArray(state.balkenOffset)
            ? state.balkenOffset
            : [50, -100, 50],
      }));
    },

    // Load data for editing
    loadSharepicForEditing: (
      sharepicData: OriginalSharepicData,
      source: string = 'presseSocial'
    ) => {
      const formData = parseSharepicForEditing(sharepicData, source);
      set(formData as Partial<ImageStudioState>);
    },

    clearEditingState: () => {
      set({
        editingSource: null,
        originalSharepicData: null,
        galleryEditMode: false,
        editShareToken: null,
        editTitle: null,
        templateCreator: null,
      });
    },

    // Load data from gallery for editing
    loadGalleryEditData: async (editData: GalleryEditData) => {
      const formData = await loadGalleryEditDataService(editData);
      set(formData as Partial<ImageStudioState>);
      return formData;
    },

    // Load data from editSession (from PresseSocialGenerator)
    loadEditSessionData: async (editSessionId: string) => {
      const formData = await loadEditSessionDataService(editSessionId);
      if (formData) {
        set(formData as Partial<ImageStudioState>);
      }
      return formData;
    },

    // Clear gallery edit state
    clearGalleryEditState: () => {
      set({
        galleryEditMode: false,
        editShareToken: null,
        editTitle: null,
        templateCreator: null,
      });
    },

    // Flow title and subtitle (dynamic header per step)
    setFlowTitle: (title: string | null) => set({ flowTitle: title }),
    setFlowSubtitle: (subtitle: string | null) => set({ flowSubtitle: subtitle }),

    // Load data from AI-generated prompt (from ImageStudio chat input)
    loadFromAIGeneration: (
      sharepicType: string,
      generatedData: Record<string, string>,
      selectedImage?: { filename: string; path: string; alt_text: string; category?: string } | null
    ) => {
      const formData = parseAIGeneratedData(sharepicType, generatedData, selectedImage);
      set(formData as Partial<ImageStudioState>);
    },

    // Helper to check if current type uses FLUX API
    isKiType: () => {
      const { type } = get();
      const config = getTypeConfig(type || '');
      return config?.usesFluxApi || false;
    },

    // Helper to check if current type has rate limit
    hasRateLimit: () => {
      const { type } = get();
      const config = getTypeConfig(type || '');
      return config?.hasRateLimit || false;
    },

    // AI Editor undo/redo actions
    commitAiGeneration: (image: string, prompt: string) => {
      const {
        aiEditorHistory,
        aiEditorHistoryIndex,
        aiEditorSessionId,
        selectedImageSize,
        variant,
        purePrompt,
      } = get();

      // Generate session ID if not exists
      const sessionId = aiEditorSessionId || `ai-editor-${Date.now()}`;

      // Linear history: truncate future entries when committing new generation
      const historyBeforeCurrent = aiEditorHistory.slice(0, aiEditorHistoryIndex + 1);

      // Create new history entry
      const newEntry = {
        id: `gen-${Date.now()}`,
        prompt: prompt || purePrompt,
        generatedImage: image,
        imageSize: selectedImageSize,
        variant,
        timestamp: Date.now(),
        shareToken: undefined,
      };

      // Max 10 entries to conserve memory
      const newHistory = [...historyBeforeCurrent, newEntry].slice(-10);
      const newIndex = newHistory.length - 1;

      set({
        aiEditorHistory: newHistory,
        aiEditorHistoryIndex: newIndex,
        aiEditorSessionId: sessionId,
        generatedImageSrc: image,
      });
    },

    undoAiGeneration: () => {
      const { aiEditorHistory, aiEditorHistoryIndex } = get();

      if (aiEditorHistoryIndex > 0) {
        const newIndex = aiEditorHistoryIndex - 1;
        const entry = aiEditorHistory[newIndex];

        set({
          aiEditorHistoryIndex: newIndex,
          generatedImageSrc: entry.generatedImage,
          purePrompt: entry.prompt,
          selectedImageSize: entry.imageSize,
          variant: entry.variant,
        });
      }
    },

    redoAiGeneration: () => {
      const { aiEditorHistory, aiEditorHistoryIndex } = get();

      if (aiEditorHistoryIndex < aiEditorHistory.length - 1) {
        const newIndex = aiEditorHistoryIndex + 1;
        const entry = aiEditorHistory[newIndex];

        set({
          aiEditorHistoryIndex: newIndex,
          generatedImageSrc: entry.generatedImage,
          purePrompt: entry.prompt,
          selectedImageSize: entry.imageSize,
          variant: entry.variant,
        });
      }
    },

    canUndoAi: () => {
      const { aiEditorHistoryIndex } = get();
      return aiEditorHistoryIndex > 0;
    },

    canRedoAi: () => {
      const { aiEditorHistory, aiEditorHistoryIndex } = get();
      return aiEditorHistoryIndex < aiEditorHistory.length - 1;
    },

    setAiEditorMode: (mode: 'create' | 'edit') => {
      set({ aiEditorMode: mode });
    },

    loadHistoryEntry: (index: number) => {
      const { aiEditorHistory } = get();

      if (index >= 0 && index < aiEditorHistory.length) {
        const entry = aiEditorHistory[index];

        set({
          aiEditorHistoryIndex: index,
          generatedImageSrc: entry.generatedImage,
          purePrompt: entry.prompt,
          selectedImageSize: entry.imageSize,
          variant: entry.variant,
        });
      }
    },

    // Constants access
    IMAGE_STUDIO_CATEGORIES,
    IMAGE_STUDIO_TYPES,
    KI_SUBCATEGORIES,
    FORM_STEPS,
    FONT_SIZES,
    DEFAULT_COLORS,
  } as unknown as ImageStudioStore;
});

export default useImageStudioStore;

// Export types for use in components
export type {
  VeranstaltungFieldFontSizes,
  SelectedImageData,
  SloganAlternative,
  ColorScheme,
  ImageStudioStore,
};
