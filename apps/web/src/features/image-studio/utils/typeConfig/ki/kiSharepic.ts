/**
 * KI Sharepic type configuration
 */
import { HiPhotograph } from 'react-icons/hi';
import { IMAGE_STUDIO_CATEGORIES, IMAGE_STUDIO_TYPES, KI_SUBCATEGORIES, FORM_STEPS } from '../constants';
import { createVariants } from '../variants';
import type { KiTypeConfig, TemplateFieldConfig } from '../types';

export const kiSharepicTypeConfig: KiTypeConfig = {
  id: IMAGE_STUDIO_TYPES.KI_SHAREPIC,
  category: IMAGE_STUDIO_CATEGORIES.KI,
  subcategory: KI_SUBCATEGORIES.CREATE,
  label: 'KI-Sharepic',
  description: 'KI-Bild mit Titel-Overlay',
  icon: HiPhotograph,
  previewImage: '/imagine/variants-pure/editorial.png',
  hidden: true,
  requiresImage: false,
  hasTextGeneration: false,
  usesFluxApi: true,
  hasRateLimit: true,
  endpoints: {
    generate: '/imagine/create'
  },
  formComponent: 'KiSharepicForm',
  steps: [FORM_STEPS.INPUT, FORM_STEPS.IMAGE_SIZE_SELECT, FORM_STEPS.RESULT],
  variants: createVariants('sharepic'),
  validation: {
    sharepicPrompt: { required: true, minLength: 5, message: 'Bitte beschreibe dein Bild (min. 5 Zeichen)' }
  }
};

export const kiSharepicFieldConfig: TemplateFieldConfig = {
  inputFields: [
    {
      name: 'sharepicPrompt',
      type: 'textarea',
      label: 'Bildbeschreibung',
      subtitle: 'Was soll auf dem Bild zu sehen sein? Beschreibe Objekte, Farben, Atmosphäre und Stil.',
      placeholder: 'Beschreibe das Bild...',
      required: true,
      minLength: 5,
      maxLength: 500,
      rows: 1
    },
    {
      name: 'imagineTitle',
      type: 'text',
      label: 'Titel',
      subtitle: 'Ein aussagekräftiger Titel, der über dem Bild eingeblendet wird (optional)',
      placeholder: 'Titel für das Sharepic...',
      required: false
    }
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
  showSocialGeneration: true
};
