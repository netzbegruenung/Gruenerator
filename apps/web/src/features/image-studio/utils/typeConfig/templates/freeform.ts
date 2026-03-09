/**
 * Freeform (Freies Design) type configuration
 */
import { PiPaintBrushBold } from 'react-icons/pi';

import { IMAGE_STUDIO_CATEGORIES, IMAGE_STUDIO_TYPES, FORM_STEPS } from '../constants';

import type { TemplateTypeConfig, TemplateFieldConfig } from '../types';

export const freeformTypeConfig: TemplateTypeConfig = {
  id: IMAGE_STUDIO_TYPES.FREEFORM,
  category: IMAGE_STUDIO_CATEGORIES.TEMPLATES,
  label: 'Freies Design',
  description: 'Leere Leinwand zum freien Gestalten',
  icon: PiPaintBrushBold,
  previewImage: '/imagine/previews/freeform-preview.webp',
  requiresImage: false,
  hasTextGeneration: false,
  usesFluxApi: false,
  hasRateLimit: false,
  endpoints: {},
  steps: [FORM_STEPS.CANVAS_EDIT],
  legacyType: 'Freeform',
};

export const freeformFieldConfig: TemplateFieldConfig = {
  inputFields: [],
  previewFields: [],
  resultFields: [],
  showImageUpload: false,
  showColorControls: false,
  showFontSizeControl: false,
  showAdvancedEditing: false,
  showCredit: false,
  showAlternatives: false,
  showEditPanel: false,
  showAutoSave: true,
  showSocialGeneration: false,
  skipSloganStep: true,
};
