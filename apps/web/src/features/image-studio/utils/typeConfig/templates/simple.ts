/**
 * Simple (Text auf Bild) type configuration
 */
import { PiTextT } from 'react-icons/pi';

import { IMAGE_STUDIO_CATEGORIES, IMAGE_STUDIO_TYPES, FORM_STEPS } from '../constants';

import type { TemplateTypeConfig, TemplateFieldConfig } from '../types';

export const simpleTypeConfig: TemplateTypeConfig = {
  id: IMAGE_STUDIO_TYPES.SIMPLE,
  category: IMAGE_STUDIO_CATEGORIES.TEMPLATES,
  label: 'Text auf Bild',
  description: 'Einfaches Sharepic mit Headline und Subtext',
  icon: PiTextT,
  previewImage: '/imagine/previews/simple-preview.png',
  requiresImage: true,
  hasTextGeneration: true,
  hasTextCanvasEdit: true,
  inputBeforeImage: true,
  parallelPreload: true,
  usesFluxApi: false,
  hasRateLimit: false,
  endpoints: {
    text: '/simple_claude',
    canvas: '/simple_canvas',
  },
  formComponent: 'SimpleForm',
  steps: [FORM_STEPS.INPUT, FORM_STEPS.IMAGE_UPLOAD, FORM_STEPS.CANVAS_EDIT, FORM_STEPS.RESULT],
  legacyType: 'Simple',
};

interface SimpleResult {
  headline?: string;
  subtext?: string;
}

interface SimpleAlternative {
  headline?: string;
  subtext?: string;
}

export const simpleFieldConfig: TemplateFieldConfig = {
  inputFields: [
    {
      name: 'thema',
      type: 'textarea',
      label: 'Thema & Details',
      subtitle: 'Beschreibe dein Thema für Headline und Subtext',
      placeholder: 'Beschreibe dein Thema, z.B. Mitgliederwerbung, Klimaschutz-Aktion...',
      required: true,
      minLength: 3,
    },
  ],
  previewFields: [
    { name: 'headline', type: 'text', label: 'Headline' },
    { name: 'subtext', type: 'text', label: 'Subtext' },
  ],
  resultFields: ['headline', 'subtext'],
  responseMapping: (result: SimpleResult) => ({
    headline: result.headline || '',
    subtext: result.subtext || '',
  }),
  alternativesMapping: (alt: SimpleAlternative, index?: number) => ({
    id: `alt-${index ?? Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    headline: alt.headline || '',
    subtext: alt.subtext || '',
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
  alternativesButtonText: 'Andere Headline',
};
