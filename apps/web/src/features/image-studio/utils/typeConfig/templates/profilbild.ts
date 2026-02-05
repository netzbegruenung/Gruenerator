/**
 * Profilbild (Profile Picture) type configuration
 */
import { PiUser } from 'react-icons/pi';

import { IMAGE_STUDIO_CATEGORIES, IMAGE_STUDIO_TYPES, FORM_STEPS } from '../constants';

import type { TemplateTypeConfig, TemplateFieldConfig } from '../types';

export const profilbildTypeConfig: TemplateTypeConfig = {
  id: IMAGE_STUDIO_TYPES.PROFILBILD,
  category: IMAGE_STUDIO_CATEGORIES.TEMPLATES,
  label: 'Profilbild',
  description: 'Porträt mit grünem Hintergrund',
  icon: PiUser,
  previewImage: '/imagine/previews/profilbild-preview.webp',
  previewImageFallback: '/imagine/previews/profilbild-preview.png',
  requiresImage: true,
  hasTextGeneration: false,
  usesFluxApi: false,
  hasRateLimit: false,
  hasBackgroundRemoval: true,
  inputBeforeImage: false,
  excludeFromTemplates: true,
  endpoints: {
    canvas: '/profilbild_canvas',
    backgroundRemoval: '/background-removal',
  },
  steps: [FORM_STEPS.INPUT, FORM_STEPS.RESULT],
  legacyType: 'Profilbild',
};

export const profilbildFieldConfig: TemplateFieldConfig = {
  inputFields: [],
  previewFields: [],
  resultFields: [],
  afterLastInputTrigger: 'generateProfilbild',
  showImageUpload: true,
  showColorControls: false,
  showFontSizeControl: false,
  showAdvancedEditing: false,
  showCredit: false,
  showAlternatives: false,
  showEditPanel: false,
  showAutoSave: true,
  showSocialGeneration: true,
  minimalLayout: true,
};
