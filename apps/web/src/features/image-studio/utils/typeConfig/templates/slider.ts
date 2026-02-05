/**
 * Slider type configuration
 * Social media slider post with pill badge, headline, subtext, and arrow
 */
import { PiSlideshowFill } from 'react-icons/pi';

import { IMAGE_STUDIO_CATEGORIES, IMAGE_STUDIO_TYPES, FORM_STEPS } from '../constants';

import type { TemplateTypeConfig, TemplateFieldConfig } from '../types';

export const sliderTypeConfig: TemplateTypeConfig = {
  id: IMAGE_STUDIO_TYPES.SLIDER,
  category: IMAGE_STUDIO_CATEGORIES.TEMPLATES,
  label: 'Slider',
  description: 'Slider-Post mit Pill-Badge und Pfeil',
  icon: PiSlideshowFill,
  previewImage: '/imagine/previews/slider-preview.webp',
  previewImageFallback: '/imagine/previews/slider-preview.png',
  requiresImage: false,
  hasTextGeneration: true,
  hasTextCanvasEdit: true,
  usesFluxApi: false,
  hasRateLimit: false,
  endpoints: {
    text: '/slider_claude',
    canvas: '/slider_canvas',
  },
  formComponent: 'SliderForm',
  steps: [FORM_STEPS.INPUT, FORM_STEPS.CANVAS_EDIT, FORM_STEPS.RESULT],
  legacyType: 'Slider',
};

interface SliderResult {
  label?: string;
  headline?: string;
  subtext?: string;
}

interface SliderAlternative {
  label?: string;
  headline?: string;
  subtext?: string;
}

export const sliderFieldConfig: TemplateFieldConfig = {
  inputFields: [
    {
      name: 'thema',
      type: 'textarea',
      label: 'Thema & Details',
      subtitle: 'Beschreibe das Thema für deinen Slider-Post',
      placeholder: 'Beschreibe dein Thema, z.B. 5 Fakten über erneuerbare Energien...',
      required: true,
      minLength: 3,
    },
  ],
  previewFields: [
    { name: 'label', type: 'text', label: 'Pill-Label', placeholder: 'z.B. Wusstest du?' },
    { name: 'headline', type: 'textarea', label: 'Überschrift' },
    { name: 'subtext', type: 'textarea', label: 'Untertext' },
  ],
  resultFields: ['label', 'headline', 'subtext'],
  responseMapping: (result: SliderResult) => ({
    label: result.label || 'Wusstest du?',
    headline: result.headline || '',
    subtext: result.subtext || '',
  }),
  alternativesMapping: (alt: SliderAlternative) => ({
    label: alt.label || 'Wusstest du?',
    headline: alt.headline || '',
    subtext: alt.subtext || '',
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
  alternativesButtonText: 'Andere Varianten',
};
