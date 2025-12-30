/**
 * Image Studio Store
 * Mobile Zustand store for image-studio state management
 * Navigation is handled by expo-router stack navigation
 */

import { create } from 'zustand';
import type {
  ImageStudioTemplateType,
  NormalizedTextResult,
  FormFieldValue,
  ImageStudioFormData,
  DreizeilenModificationParams,
  ZitatModificationParams,
  VeranstaltungModificationParams,
  ModificationParams,
} from '@gruenerator/shared/image-studio';
import {
  getDefaultModificationParams,
  typeSupportsModifications,
  cloneModificationParams,
} from '@gruenerator/shared/image-studio';

// Re-export shared types for convenience
export type { FormFieldValue as ImageStudioFieldValue, ImageStudioFormData } from '@gruenerator/shared/image-studio';

interface ImageStudioState {
  /** Selected template type */
  type: ImageStudioTemplateType | null;
  /** Form data (thema, name, etc.) */
  formData: ImageStudioFormData;
  /** Uploaded image URI (local file path) */
  uploadedImageUri: string | null;
  /** Uploaded image as base64 (for API) */
  uploadedImageBase64: string | null;
  /** Generated text result */
  generatedText: NormalizedTextResult | null;
  /** Generated image as base64 */
  generatedImage: string | null;
  /** Currently selected alternative index */
  selectedAlternativeIndex: number;
  /** Loading state */
  loading: boolean;
  /** Text generation loading state */
  textLoading: boolean;
  /** Canvas generation loading state */
  canvasLoading: boolean;
  /** Error message */
  error: string | null;

  // Modification state
  /** Modification parameters (type-specific) */
  modifications: ModificationParams | null;
  /** Whether advanced mode is enabled */
  isAdvancedMode: boolean;
  /** Loading state for modification regeneration */
  modificationLoading: boolean;
}

interface ImageStudioActions {
  /** Set the selected type */
  setType: (type: ImageStudioTemplateType) => void;
  /** Update a form field */
  updateField: (name: string, value: FormFieldValue) => void;
  /** Update multiple form fields */
  updateFields: (fields: ImageStudioFormData) => void;
  /** Set uploaded image */
  setUploadedImage: (uri: string, base64: string) => void;
  /** Clear uploaded image */
  clearUploadedImage: () => void;
  /** Set generated text result */
  setGeneratedText: (result: NormalizedTextResult) => void;
  /** Select an alternative */
  selectAlternative: (index: number) => void;
  /** Apply selected alternative to form data */
  applyAlternative: () => void;
  /** Set generated image */
  setGeneratedImage: (imageBase64: string) => void;
  /** Set loading state */
  setLoading: (loading: boolean) => void;
  /** Set text loading state */
  setTextLoading: (loading: boolean) => void;
  /** Set canvas loading state */
  setCanvasLoading: (loading: boolean) => void;
  /** Set error */
  setError: (error: string | null) => void;
  /** Reset to initial state */
  reset: () => void;

  // Modification actions
  /** Initialize modifications with defaults for current type */
  initModifications: () => void;
  /** Update a single modification parameter */
  updateModification: <K extends keyof DreizeilenModificationParams>(
    key: K,
    value: DreizeilenModificationParams[K]
  ) => void;
  /** Update multiple modification parameters */
  updateModifications: (updates: Partial<ModificationParams>) => void;
  /** Reset modifications to defaults */
  resetModifications: () => void;
  /** Toggle advanced mode */
  toggleAdvancedMode: () => void;
  /** Set modification loading state */
  setModificationLoading: (loading: boolean) => void;
}

type ImageStudioStore = ImageStudioState & ImageStudioActions;

const initialState: ImageStudioState = {
  type: null,
  formData: {},
  uploadedImageUri: null,
  uploadedImageBase64: null,
  generatedText: null,
  generatedImage: null,
  selectedAlternativeIndex: 0,
  loading: false,
  textLoading: false,
  canvasLoading: false,
  error: null,
  // Modification state
  modifications: null,
  isAdvancedMode: false,
  modificationLoading: false,
};

export const useImageStudioStore = create<ImageStudioStore>()((set, get) => ({
  ...initialState,

  setType: (type: ImageStudioTemplateType) => {
    set({ type });
  },

  updateField: (name: string, value: FormFieldValue) => {
    set((state) => ({
      formData: { ...state.formData, [name]: value },
    }));
  },

  updateFields: (fields: ImageStudioFormData) => {
    set((state) => ({
      formData: { ...state.formData, ...fields },
    }));
  },

  setUploadedImage: (uri: string, base64: string) => {
    set({
      uploadedImageUri: uri,
      uploadedImageBase64: base64,
    });
  },

  clearUploadedImage: () => {
    set({
      uploadedImageUri: null,
      uploadedImageBase64: null,
    });
  },

  setGeneratedText: (result: NormalizedTextResult) => {
    set({
      generatedText: result,
      selectedAlternativeIndex: 0,
      // Auto-apply main result to form data
      formData: { ...get().formData, ...result.fields },
    });
  },

  selectAlternative: (index: number) => {
    set({ selectedAlternativeIndex: index });
  },

  applyAlternative: () => {
    const { generatedText, selectedAlternativeIndex, formData } = get();

    if (generatedText && selectedAlternativeIndex > 0) {
      const alternative = generatedText.alternatives[selectedAlternativeIndex - 1];
      if (alternative) {
        set({
          formData: { ...formData, ...alternative },
        });
      }
    } else if (generatedText && selectedAlternativeIndex === 0) {
      // Revert to main result
      set({
        formData: { ...formData, ...generatedText.fields },
      });
    }
  },

  setGeneratedImage: (imageBase64: string) => {
    set({ generatedImage: imageBase64 });
  },

  setLoading: (loading: boolean) => {
    set({ loading });
  },

  setTextLoading: (loading: boolean) => {
    set({ textLoading: loading });
  },

  setCanvasLoading: (loading: boolean) => {
    set({ canvasLoading: loading });
  },

  setError: (error: string | null) => {
    set({ error });
  },

  reset: () => {
    set(initialState);
  },

  // Modification actions
  initModifications: () => {
    const { type } = get();
    if (!type || !typeSupportsModifications(type)) {
      set({ modifications: null });
      return;
    }

    const defaults = getDefaultModificationParams(type);
    set({ modifications: defaults });
  },

  updateModification: (key, value) => {
    const { modifications } = get();
    if (!modifications) return;

    // Deep clone to avoid mutation
    const cloned = cloneModificationParams(modifications);
    (cloned as unknown as Record<string, unknown>)[key] = value;
    set({ modifications: cloned });
  },

  updateModifications: (updates) => {
    const { modifications } = get();
    if (!modifications) return;

    const cloned = cloneModificationParams(modifications);
    Object.assign(cloned, updates);
    set({ modifications: cloned });
  },

  resetModifications: () => {
    const { type } = get();
    if (!type || !typeSupportsModifications(type)) {
      set({ modifications: null });
      return;
    }

    const defaults = getDefaultModificationParams(type);
    set({ modifications: defaults });
  },

  toggleAdvancedMode: () => {
    set((state) => ({ isAdvancedMode: !state.isAdvancedMode }));
  },

  setModificationLoading: (loading: boolean) => {
    set({ modificationLoading: loading });
  },
}));

/**
 * Selector for computed loading state (text or canvas loading)
 */
export const selectIsGenerating = (state: ImageStudioStore) =>
  state.textLoading || state.canvasLoading;

/**
 * Selector for checking if result is ready
 */
export const selectHasResult = (state: ImageStudioStore) =>
  state.generatedImage !== null;

/**
 * Selector for checking if text generation is complete
 */
export const selectHasGeneratedText = (state: ImageStudioStore) =>
  state.generatedText !== null;

/**
 * Selector for getting the current form data with all fields
 */
export const selectCompleteFormData = (state: ImageStudioStore) => ({
  ...state.formData,
  uploadedImage: state.uploadedImageBase64,
});

/**
 * Selector for whether floating badges should be visible
 * Badges are hidden when actively creating an image (type is selected)
 */
export const selectShouldShowBadges = (state: ImageStudioStore) =>
  state.type === null;

/**
 * Selector for whether modifications are available for current type
 */
export const selectSupportsModifications = (state: ImageStudioStore) =>
  state.type !== null && typeSupportsModifications(state.type);

/**
 * Selector for modification loading (includes canvas regeneration)
 */
export const selectIsModificationLoading = (state: ImageStudioStore) =>
  state.modificationLoading || state.canvasLoading;

/**
 * Selector for getting current modifications with type safety
 */
export const selectDreizeilenModifications = (state: ImageStudioStore) =>
  state.type === 'dreizeilen' ? state.modifications as DreizeilenModificationParams | null : null;
