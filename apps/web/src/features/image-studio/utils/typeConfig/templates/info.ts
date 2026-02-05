/**
 * Info-Sharepic type configuration
 */
import { PiInfo } from 'react-icons/pi';

import { IMAGE_STUDIO_CATEGORIES, IMAGE_STUDIO_TYPES, FORM_STEPS } from '../constants';

import type { TemplateTypeConfig, TemplateFieldConfig } from '../types';

export const infoTypeConfig: TemplateTypeConfig = {
  id: IMAGE_STUDIO_TYPES.INFO,
  category: IMAGE_STUDIO_CATEGORIES.TEMPLATES,
  label: 'Info-Sharepic',
  description: 'Strukturierte Info mit Header und Body',
  icon: PiInfo,
  previewImage: '/imagine/previews/info-preview.webp',
  previewImageFallback: '/imagine/previews/info-preview.png',
  requiresImage: false,
  hasTextGeneration: true,
  hasTextCanvasEdit: true,
  usesFluxApi: false,
  hasRateLimit: false,
  endpoints: {
    text: '/info_claude',
    canvas: '/info_canvas',
  },
  formComponent: 'InfoForm',
  steps: [FORM_STEPS.INPUT, FORM_STEPS.CANVAS_EDIT, FORM_STEPS.RESULT],
  legacyType: 'Info',
};

interface InfoResult {
  header?: string;
  subheader?: string;
  body?: string;
  searchTerms?: string[];
}

interface InfoAlternative {
  header?: string;
  subheader?: string;
  body?: string;
}

export const infoFieldConfig: TemplateFieldConfig = {
  inputFields: [
    {
      name: 'thema',
      type: 'textarea',
      label: 'Thema & Details',
      subtitle: 'Beschreibe dein Info-Thema für eine strukturierte Darstellung',
      placeholder: 'Beschreibe dein Thema, z.B. Klimaschutz mit Fokus auf erneuerbare Energien...',
      required: true,
      minLength: 3,
    },
  ],
  previewFields: [
    { name: 'header', type: 'text', label: 'Header' },
    { name: 'subheader', type: 'text', label: 'Subheader' },
    { name: 'body', type: 'textarea', label: 'Body' },
  ],
  resultFields: ['header', 'subheader', 'body'],
  responseMapping: (result: InfoResult) => ({
    header: result.header || '',
    subheader: result.subheader || '',
    body: result.body || '',
    searchTerms: result.searchTerms || [],
  }),
  alternativesMapping: (alt: InfoAlternative) => ({
    header: alt.header || '',
    subheader: alt.subheader || '',
    body: alt.body || '',
  }),
  showImageUpload: false,
  showColorControls: false,
  showFontSizeControl: false,
  showAdvancedEditing: false,
  showCredit: false,
  showAlternatives: true,
  showEditPanel: true,
  showAutoSave: true,
  showSocialGeneration: true,
  alternativesButtonText: 'Andere Varianten',
};
