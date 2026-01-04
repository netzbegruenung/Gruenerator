// Main page component
export { default as ImageStudioPage } from './ImageStudioPage';

// Hooks
export { useImageGeneration } from './hooks/useImageGeneration';
export { useStepFlow } from './hooks/useStepFlow';
export { useEditPanel } from './hooks/useEditPanel';
export { useLightbox } from './hooks/useLightbox';
export { useImageHelpers } from './hooks/useImageHelpers';
export { useTemplateResultActions } from './hooks/useTemplateResultActions';
export { useTemplateResultAutoSave } from './hooks/useTemplateResultAutoSave';

// Type configuration
export {
  IMAGE_STUDIO_CATEGORIES,
  IMAGE_STUDIO_TYPES,
  FORM_STEPS,
  TYPE_CONFIG,
  CATEGORY_CONFIG,
  getTypeConfig,
  getCategoryConfig,
  getTypesForCategory,
  getLegacyType,
  getTypeFromLegacy,
  getTemplateFieldConfig,
  URL_TYPE_MAP
} from './utils/typeConfig';

// Forms
export { EditInstructionForm, GreenEditForm, UniversalEditForm } from './forms';

// Canvas components
export * from './canvas-editor';

// Gallery
export { default as ImageGallery } from './gallery/ImageGallery';
