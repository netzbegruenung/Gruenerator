/**
 * Dreizeilen (Standard-Sharepic) type configuration
 */
import { PiTextT } from 'react-icons/pi';

import { IMAGE_STUDIO_CATEGORIES, IMAGE_STUDIO_TYPES, FORM_STEPS } from '../constants';

import type { TemplateTypeConfig, TemplateFieldConfig } from '../types';

export const dreizeilenTypeConfig: TemplateTypeConfig = {
  id: IMAGE_STUDIO_TYPES.DREIZEILEN,
  category: IMAGE_STUDIO_CATEGORIES.TEMPLATES,
  label: 'Standard-Sharepic',
  description: 'Drei Textzeilen mit Hintergrundbild',
  icon: PiTextT,
  previewImage: '/imagine/previews/dreizeilen-preview.webp',
  previewImageFallback: '/imagine/previews/dreizeilen-preview.png',
  requiresImage: true,
  hasTextGeneration: true,
  usesFluxApi: false,
  hasRateLimit: false,
  inputBeforeImage: true,
  parallelPreload: true,
  endpoints: {
    text: '/dreizeilen_claude',
    canvas: '/dreizeilen_canvas',
  },
  formComponent: 'DreizeilenForm',
  steps: [FORM_STEPS.INPUT, FORM_STEPS.PREVIEW, FORM_STEPS.RESULT],
  legacyType: 'Dreizeilen',
};

interface DreizeilenSlogan {
  line1?: string;
  line2?: string;
  line3?: string;
}

interface DreizeilenResult {
  mainSlogan?: DreizeilenSlogan;
  searchTerms?: string[];
}

interface DreizeilenAlternative {
  line1?: string;
  line2?: string;
  line3?: string;
}

export const dreizeilenFieldConfig: TemplateFieldConfig = {
  inputFields: [
    {
      name: 'thema',
      type: 'textarea',
      label: 'Thema & Details',
      subtitle: 'Beschreibe dein Thema für die Texterstellung durch KI',
      placeholder: 'Beschreibe dein Thema, z.B. Klimaschutz mit Fokus auf erneuerbare Energien...',
      required: true,
      minLength: 3,
    },
  ],
  previewFields: [
    { name: 'line1', type: 'text', label: 'Zeile 1' },
    { name: 'line2', type: 'text', label: 'Zeile 2' },
    { name: 'line3', type: 'text', label: 'Zeile 3' },
  ],
  resultFields: ['line1', 'line2', 'line3'],
  responseMapping: (result: DreizeilenResult) => ({
    line1: result.mainSlogan?.line1 || '',
    line2: result.mainSlogan?.line2 || '',
    line3: result.mainSlogan?.line3 || '',
    searchTerms: result.searchTerms || [],
  }),
  alternativesMapping: (alt: DreizeilenAlternative, index?: number) => ({
    id: `alt-${index ?? Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    line1: alt.line1 || '',
    line2: alt.line2 || '',
    line3: alt.line3 || '',
  }),
  showImageUpload: true,
  showColorControls: true,
  showFontSizeControl: true,
  showAdvancedEditing: true,
  showCredit: true,
  showAlternatives: true,
  showEditPanel: true,
  showAutoSave: true,
  showSocialGeneration: true,
  alternativesButtonText: 'Anderer Slogan',
};
