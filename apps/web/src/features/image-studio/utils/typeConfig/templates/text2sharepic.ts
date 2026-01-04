/**
 * Text2Sharepic type configuration
 */
import { PiMagicWand } from 'react-icons/pi';
import { IMAGE_STUDIO_CATEGORIES, IMAGE_STUDIO_TYPES, FORM_STEPS } from '../constants';
import type { TemplateTypeConfig, TemplateFieldConfig } from '../types';

export const text2sharepicTypeConfig: TemplateTypeConfig = {
  id: IMAGE_STUDIO_TYPES.TEXT2SHAREPIC,
  category: IMAGE_STUDIO_CATEGORIES.TEMPLATES,
  label: 'Text zu Sharepic',
  description: 'KI generiert Sharepic aus Beschreibung',
  icon: PiMagicWand,
  requiresImage: false,
  hasTextGeneration: false,
  usesFluxApi: false,
  hasRateLimit: false,
  isBeta: true,
  endpoints: {
    generate: '/sharepic/text2sharepic/generate-ai'
  },
  formComponent: 'Text2SharepicForm',
  steps: [FORM_STEPS.INPUT, FORM_STEPS.RESULT],
  legacyType: 'Text2Sharepic'
};

export const text2sharepicFieldConfig: TemplateFieldConfig = {
  inputFields: [],
  previewFields: [],
  resultFields: [],
  showImageUpload: false,
  showColorControls: false,
  showFontSizeControl: false,
  showAdvancedEditing: false,
  showCredit: false,
  showAlternatives: false,
  showEditPanel: false,
  showAutoSave: false,
  showSocialGeneration: true
};
