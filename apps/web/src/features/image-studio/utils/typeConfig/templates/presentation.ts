/**
 * Presentation type configuration
 * PowerPoint-style slide editor with Grundlagendesign 2025 theme
 */
import { PiPresentationChartFill } from 'react-icons/pi';

import { IMAGE_STUDIO_CATEGORIES, IMAGE_STUDIO_TYPES, FORM_STEPS } from '../constants';

import type { TemplateTypeConfig, TemplateFieldConfig } from '../types';

export const presentationTypeConfig: TemplateTypeConfig = {
  id: IMAGE_STUDIO_TYPES.PRESENTATION,
  category: IMAGE_STUDIO_CATEGORIES.TEMPLATES,
  label: 'Präsentation',
  description: 'PowerPoint-Folien im Grundlagendesign 2025',
  icon: PiPresentationChartFill,
  previewImage: '/imagine/previews/pres-title-preview.webp',
  previewImageFallback: '/imagine/previews/pres-title-preview.png',
  requiresImage: false,
  hasTextGeneration: true,
  hasTextCanvasEdit: true,
  usesFluxApi: false,
  hasRateLimit: false,
  endpoints: {
    text: '/presentation_claude',
    canvas: '/presentation_canvas',
  },
  formComponent: 'PresentationForm',
  steps: [FORM_STEPS.INPUT, FORM_STEPS.CANVAS_EDIT, FORM_STEPS.RESULT],
  legacyType: 'Presentation',
};

interface PresentationResult {
  title?: string;
  subtitle?: string;
  bodyText?: string;
}

interface PresentationAlternative {
  title?: string;
  subtitle?: string;
}

export const presentationFieldConfig: TemplateFieldConfig = {
  inputFields: [
    {
      name: 'thema',
      type: 'textarea',
      label: 'Thema & Details',
      subtitle: 'Beschreibe das Thema für deine Präsentation',
      placeholder: 'Beschreibe dein Thema, z.B. Klimaschutz in unserer Gemeinde...',
      required: true,
      minLength: 3,
    },
  ],
  previewFields: [
    { name: 'title', type: 'text', label: 'Titel' },
    { name: 'subtitle', type: 'text', label: 'Untertitel' },
    { name: 'bodyText', type: 'textarea', label: 'Inhalt' },
  ],
  resultFields: ['title', 'subtitle', 'bodyText'],
  responseMapping: (result: PresentationResult) => ({
    title: result.title || '',
    subtitle: result.subtitle || '',
    bodyText: result.bodyText || '',
  }),
  alternativesMapping: (alt: PresentationAlternative) => ({
    title: alt.title || '',
    subtitle: alt.subtitle || '',
  }),
  showImageUpload: false,
  showColorControls: false,
  showFontSizeControl: true,
  showAdvancedEditing: false,
  showCredit: false,
  showAlternatives: true,
  showEditPanel: true,
  showAutoSave: true,
  showSocialGeneration: false,
  alternativesButtonText: 'Andere Varianten',
};
