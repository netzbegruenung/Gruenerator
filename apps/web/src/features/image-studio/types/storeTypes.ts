import type { IconType } from 'react-icons';
import type { OriginalSharepicData, GalleryEditData } from '../services/editingSessionService';
import {
  IMAGE_STUDIO_CATEGORIES,
  IMAGE_STUDIO_TYPES,
  KI_SUBCATEGORIES,
  FORM_STEPS
} from '../utils/typeConfig';
import { DEFAULT_COLORS } from '../../../components/utils/constants';
import type { ColorScheme } from './shared';

// Font size constants
export const FONT_SIZES = {
  S: 75,
  M: 85,
  L: 105
} as const;

// Type for font size keys
export type FontSizeKey = keyof typeof FONT_SIZES;

// Veranstaltung field font sizes
export interface VeranstaltungFieldFontSizes {
  eventTitle: number;
  beschreibung: number;
  weekday: number;
  date: number;
  time: number;
  locationName: number;
  address: number;
}

// Slogan alternative interface
export interface SloganAlternative {
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

// Selected image (Unsplash format)
export interface SelectedImageData {
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
  [key: string]: unknown;
}

// Image limit data (rate limiting)
export interface ImageLimitData {
  remaining: number;
  limit: number;
  resetTime?: number;
  [key: string]: unknown;
}

// AI Editor generation history entry
export interface GenerationHistoryEntry {
  id: string;
  prompt: string;
  generatedImage: string; // base64
  imageSize: {
    width: number;
    height: number;
    label: string;
    aspectRatio: string;
    platform: string;
    icon?: IconType;
    color?: string;
  } | null;
  variant: string | null;
  timestamp: number;
  shareToken?: string;
}

// Form data update partial
export interface FormDataUpdate {
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
  [key: string]: unknown;
}

// Image modification data
export interface ImageModificationData {
  colorScheme?: ColorScheme;
  fontSize?: number;
  balkenOffset?: number[];
  [key: string]: unknown;
}

// Store state interface
export interface ImageStudioState {
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
  headline: string;
  subtext: string;

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
  selectedImageSize: {
    width: number;
    height: number;
    label: string;
    aspectRatio: string;
    platform: string;
    icon?: IconType;
    color?: string;
  } | null;

  // Cross-component editing state
  editingSource: string | null;
  originalSharepicData: OriginalSharepicData | null;
  isEditSession: boolean;
  hasOriginalImage: boolean;

  // Gallery edit mode state
  galleryEditMode: boolean;
  editShareToken: string | null;
  editTitle: string | null;
  templateCreator: string | null;

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
  unsplashImages: unknown[];
  transparentImage: string | null;

  // Rate limiting (for KI types)
  imageLimitData: ImageLimitData | null;

  // Step wizard animation state
  navigationDirection: 'forward' | 'back';
  isAnimating: boolean;
  previousStep: string | null;

  // Slogan alternative image caching
  cachedSloganImages: Record<number, string>;
  currentAlternativeIndex: number;

  // Flow title (dynamic header)
  flowTitle: string | null;
  flowSubtitle: string | null;

  // AI generation state (from chat prompt)
  aiGeneratedContent: boolean;

  // AI Editor history (undo/redo)
  aiEditorHistory: GenerationHistoryEntry[];
  aiEditorHistoryIndex: number;
  aiEditorSessionId: string | null;
  aiEditorMode: 'create' | 'edit';
}

// Store actions interface
export interface ImageStudioActions {
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
  setUnsplashImages: (images: unknown[]) => void;
  setTransparentImage: (image: string | null) => void;

  // UI state
  setSearchBarActive: (isActive: boolean) => void;
  setAdvancedEditing: (isOpen: boolean) => void;
  toggleAdvancedEditing: () => void;
  setSubmitting: (isSubmitting: boolean, step?: string | null) => void;

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

  // Image modification state updates
  updateImageModification: (modificationData: ImageModificationData) => void;

  // Load data for editing
  loadSharepicForEditing: (sharepicData: OriginalSharepicData, source?: string) => void;
  clearEditingState: () => void;
  loadGalleryEditData: (editData: GalleryEditData) => Promise<Record<string, unknown>>;
  loadEditSessionData: (editSessionId: string) => Promise<Record<string, unknown> | null>;
  clearGalleryEditState: () => void;

  // Flow title and subtitle
  setFlowTitle: (title: string | null) => void;
  setFlowSubtitle: (subtitle: string | null) => void;

  // Helper methods
  isKiType: () => boolean;
  hasRateLimit: () => boolean;

  // AI prompt generation (from chat input)
  loadFromAIGeneration: (sharepicType: string, generatedData: Record<string, string>, selectedImage?: { filename: string; path: string; alt_text: string; category?: string } | null) => void;

  // AI Editor undo/redo
  commitAiGeneration: (image: string, prompt: string) => void;
  undoAiGeneration: () => void;
  redoAiGeneration: () => void;
  canUndoAi: () => boolean;
  canRedoAi: () => boolean;
  setAiEditorMode: (mode: 'create' | 'edit') => void;
  loadHistoryEntry: (index: number) => void;
}

// Constants exposed on store
export interface ImageStudioConstants {
  IMAGE_STUDIO_CATEGORIES: typeof IMAGE_STUDIO_CATEGORIES;
  IMAGE_STUDIO_TYPES: typeof IMAGE_STUDIO_TYPES;
  KI_SUBCATEGORIES: typeof KI_SUBCATEGORIES;
  FORM_STEPS: typeof FORM_STEPS;
  FONT_SIZES: typeof FONT_SIZES;
  DEFAULT_COLORS: typeof DEFAULT_COLORS;
}

// Combined store type
export type ImageStudioStore = ImageStudioState & ImageStudioActions & ImageStudioConstants;

// Default values for veranstaltung field font sizes
export const DEFAULT_VERANSTALTUNG_FIELD_FONT_SIZES: VeranstaltungFieldFontSizes = {
  eventTitle: 85,
  beschreibung: 50,
  weekday: 50,
  date: 65,
  time: 50,
  locationName: 50,
  address: 40
};

// Re-export ColorScheme from shared module
export type { ColorScheme } from './shared';
