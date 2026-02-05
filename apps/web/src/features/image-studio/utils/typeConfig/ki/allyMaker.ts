/**
 * Ally Maker KI type configuration
 */
import { HiHeart } from 'react-icons/hi';

import {
  IMAGE_STUDIO_CATEGORIES,
  IMAGE_STUDIO_TYPES,
  KI_SUBCATEGORIES,
  FORM_STEPS,
} from '../constants';

import type { KiTypeConfig, TemplateFieldConfig } from '../types';

export const allyMakerTypeConfig: KiTypeConfig = {
  id: IMAGE_STUDIO_TYPES.ALLY_MAKER,
  category: IMAGE_STUDIO_CATEGORIES.KI,
  subcategory: KI_SUBCATEGORIES.EDIT,
  label: 'Ally Maker',
  description: 'Füge Regenbogen-Tattoos hinzu',
  icon: HiHeart,
  previewImage: '/imagine/variants/realistic-photo.webp',
  previewImageFallback: '/imagine/variants/realistic-photo.png',
  hidden: true,
  requiresImage: true,
  hasTextGeneration: false,
  usesFluxApi: true,
  hasRateLimit: true,
  hasPrecisionMode: true,
  endpoints: {
    generate: '/flux/green-edit/prompt',
  },
  formComponent: 'AllyMakerForm',
  steps: [FORM_STEPS.IMAGE_UPLOAD, FORM_STEPS.INPUT, FORM_STEPS.RESULT],
  placementOptions: [
    { value: 'Wange', label: 'Wange' },
    { value: 'Handgelenk', label: 'Handgelenk' },
    { value: 'Schlafe', label: 'Schläfe' },
    { value: 'Schulter', label: 'Schulter' },
  ],
};

export const allyMakerFieldConfig: TemplateFieldConfig = {
  inputFields: [
    {
      name: 'allyPlacement',
      type: 'select',
      label: 'Wo soll das Tattoo erscheinen?',
      subtitle:
        'Wähle die Position aus, wo das Regenbogen-Tattoo auf der Person platziert werden soll',
      placeholder: 'Wähle eine Position...',
      required: true,
      options: [
        { value: 'Wange', label: 'Wange' },
        { value: 'Handgelenk', label: 'Handgelenk' },
        { value: 'Schlafe', label: 'Schläfe' },
        { value: 'Schulter', label: 'Schulter' },
      ],
    },
  ],
  previewFields: [],
  resultFields: [],
  afterLastInputTrigger: 'generateImage',
  showImageUpload: false,
  showColorControls: false,
  showFontSizeControl: false,
  showAdvancedEditing: false,
  showCredit: false,
  showAlternatives: false,
  showEditPanel: false,
  showAutoSave: true,
  showSocialGeneration: true,
};
