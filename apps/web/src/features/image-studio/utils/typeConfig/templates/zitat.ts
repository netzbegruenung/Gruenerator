/**
 * Zitat (Quote with Image) type configuration
 */
import { PiQuotes } from 'react-icons/pi';

import { IMAGE_STUDIO_CATEGORIES, IMAGE_STUDIO_TYPES, FORM_STEPS } from '../constants';

import type { TemplateTypeConfig, TemplateFieldConfig } from '../types';

export const zitatTypeConfig: TemplateTypeConfig = {
  id: IMAGE_STUDIO_TYPES.ZITAT,
  category: IMAGE_STUDIO_CATEGORIES.TEMPLATES,
  label: 'Zitat mit Bild',
  description: 'Zitat mit Hintergrundbild',
  icon: PiQuotes,
  previewImage: '/imagine/previews/zitat-preview.png',
  requiresImage: true,
  hasTextGeneration: true,
  hasTextCanvasEdit: true,
  usesFluxApi: false,
  hasRateLimit: false,
  inputBeforeImage: true,
  parallelPreload: true,
  endpoints: {
    text: '/zitat_claude',
    canvas: '/zitat_canvas',
  },
  formComponent: 'ZitatForm',
  steps: [FORM_STEPS.INPUT, FORM_STEPS.IMAGE_UPLOAD, FORM_STEPS.CANVAS_EDIT, FORM_STEPS.RESULT],
  legacyType: 'Zitat',
};

interface ZitatResult {
  quote?: string;
}

interface ZitatAlternative {
  quote?: string;
}

export const zitatFieldConfig: TemplateFieldConfig = {
  inputFields: [
    {
      name: 'thema',
      type: 'textarea',
      label: 'Thema & Details',
      subtitle: 'Beschreibe das Thema, zu dem ein Zitat erstellt werden soll',
      placeholder: 'Beschreibe dein Thema, z.B. Klimaschutz mit Fokus auf erneuerbare Energien...',
      required: true,
      minLength: 3,
    },
  ],
  previewFields: [
    { name: 'quote', type: 'textarea', label: 'Zitat' },
    { name: 'name', type: 'text', label: 'Zitiert wird', placeholder: 'Name der Person' },
  ],
  resultFields: ['quote'],
  responseMapping: (result: ZitatResult) => ({
    quote: result.quote || '',
  }),
  alternativesMapping: (alt: ZitatAlternative) => ({
    quote: alt.quote || '',
  }),
  showImageUpload: true,
  showColorControls: false,
  showFontSizeControl: true,
  showAdvancedEditing: false,
  showCredit: false,
  showAlternatives: true,
  showEditPanel: true,
  showAutoSave: true,
  showSocialGeneration: true,
  alternativesButtonText: 'Andere Zitate',
};
