/**
 * Zitat Pure (Text-only Quote) type configuration
 */
import { PiQuotes } from 'react-icons/pi';

import { IMAGE_STUDIO_CATEGORIES, IMAGE_STUDIO_TYPES, FORM_STEPS } from '../constants';

import type { TemplateTypeConfig, TemplateFieldConfig } from '../types';

export const zitatPureTypeConfig: TemplateTypeConfig = {
  id: IMAGE_STUDIO_TYPES.ZITAT_PURE,
  category: IMAGE_STUDIO_CATEGORIES.TEMPLATES,
  label: 'Zitat (Text)',
  description: 'Reines Text-Zitat ohne Bild',
  icon: PiQuotes,
  previewImage: '/imagine-assets/previews/zitat-pure-preview.png',
  requiresImage: false,
  hasTextGeneration: true,
  hasTextCanvasEdit: true,
  usesFluxApi: false,
  hasRateLimit: false,
  endpoints: {
    text: '/zitat_pure_claude',
    canvas: '/zitat_pure_canvas',
  },
  formComponent: 'ZitatPureForm',
  steps: [FORM_STEPS.INPUT, FORM_STEPS.CANVAS_EDIT, FORM_STEPS.RESULT],
  legacyType: 'Zitat_Pure',
};

interface ZitatPureResult {
  quote?: string;
}

interface ZitatPureAlternative {
  quote?: string;
}

export const zitatPureFieldConfig: TemplateFieldConfig = {
  inputFields: [
    {
      name: 'thema',
      type: 'textarea',
      label: 'Thema & Details',
      subtitle: 'Beschreibe das Thema, zu dem ein Text-Zitat erstellt werden soll',
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
  responseMapping: (result: ZitatPureResult) => ({
    quote: result.quote || '',
  }),
  alternativesMapping: (alt: ZitatPureAlternative) => ({
    quote: alt.quote || '',
  }),
  showImageUpload: false,
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
