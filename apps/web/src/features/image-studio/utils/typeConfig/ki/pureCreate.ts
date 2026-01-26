/**
 * Pure Create KI type configuration
 */
import { HiSparkles } from 'react-icons/hi';

import {
  IMAGE_STUDIO_CATEGORIES,
  IMAGE_STUDIO_TYPES,
  KI_SUBCATEGORIES,
  FORM_STEPS,
} from '../constants';
import { createVariants } from '../variants';

import type { KiTypeConfig, TemplateFieldConfig } from '../types';

export const pureCreateTypeConfig: KiTypeConfig = {
  id: IMAGE_STUDIO_TYPES.PURE_CREATE,
  category: IMAGE_STUDIO_CATEGORIES.KI,
  subcategory: KI_SUBCATEGORIES.CREATE,
  label: 'Bild erstellen',
  description: 'Erstelle ein neues Bild aus Text',
  icon: HiSparkles,
  previewImage: '/imagine/variants-pure/soft-illustration.png',
  requiresImage: false,
  hasTextGeneration: false,
  usesFluxApi: true,
  hasRateLimit: true,
  endpoints: {
    generate: '/imagine/pure',
  },
  formComponent: 'PureCreateForm',
  steps: [FORM_STEPS.INPUT, FORM_STEPS.RESULT],
  variants: createVariants('pure'),
  validation: {
    purePrompt: {
      required: true,
      minLength: 5,
      message: 'Bitte beschreibe dein Bild (min. 5 Zeichen)',
    },
  },
};

export const pureCreateFieldConfig: TemplateFieldConfig = {
  inputFields: [
    {
      name: 'purePrompt',
      type: 'textarea',
      label: 'Bildbeschreibung',
      subtitle:
        'Beschreibe dein Wunschbild so detailliert wie möglich. Umso präziser, umso besser das Ergebnis!',
      placeholder: 'Schreibe hier...',
      required: true,
      minLength: 5,
      maxLength: 500,
      rows: 1,
    },
  ],
  previewFields: [],
  resultFields: [],
  afterLastInputTrigger: undefined,
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
