/**
 * Universal Edit KI type configuration
 */
import { HiPencil } from 'react-icons/hi';
import { IMAGE_STUDIO_CATEGORIES, IMAGE_STUDIO_TYPES, KI_SUBCATEGORIES, FORM_STEPS } from '../constants';
import type { KiTypeConfig, TemplateFieldConfig } from '../types';

export const universalEditTypeConfig: KiTypeConfig = {
  id: IMAGE_STUDIO_TYPES.UNIVERSAL_EDIT,
  category: IMAGE_STUDIO_CATEGORIES.KI,
  subcategory: KI_SUBCATEGORIES.EDIT,
  label: 'Bild bearbeiten',
  description: 'Bearbeite dein Bild frei mit KI',
  icon: HiPencil,
  previewImage: '/imagine/variants/editorial.png',
  requiresImage: true,
  hasTextGeneration: false,
  usesFluxApi: true,
  hasRateLimit: true,
  hasAiEditor: true,
  hasPrecisionMode: true,
  alwaysPrecision: true,
  endpoints: {
    generate: '/flux/green-edit/prompt'
  },
  formComponent: 'EditInstructionForm',
  steps: [FORM_STEPS.IMAGE_UPLOAD, FORM_STEPS.INPUT, FORM_STEPS.RESULT],
  formProps: {
    label: 'Bearbeitungsanweisungen',
    placeholder: 'Beschreibe detailliert, wie das Bild bearbeitet werden soll. Z.B. "Ersetze den Himmel durch einen Sonnenuntergang" oder "Füge Nebel im Hintergrund hinzu"...',
    helpText: 'Erkläre genau, was geändert werden soll - je präziser, desto besser.',
    rows: 2
  },
  validation: {
    uploadedImage: { required: true, message: 'Bitte lade ein Bild hoch' },
    precisionInstruction: { required: true, minLength: 15, message: 'Bitte gib eine Bearbeitungsanweisung ein (min. 15 Zeichen)' }
  }
};

export const universalEditFieldConfig: TemplateFieldConfig = {
  inputFields: [
    {
      name: 'precisionInstruction',
      type: 'textarea',
      label: 'Bearbeitungsanweisungen',
      subtitle: 'Sag der KI genau, was am Bild geändert werden soll (z.B. Himmel ändern, Objekte hinzufügen)',
      placeholder: 'Beschreibe detailliert, wie das Bild bearbeitet werden soll. Z.B. "Ersetze den Himmel durch einen Sonnenuntergang" oder "Füge Nebel im Hintergrund hinzu"...',
      helpText: 'Erkläre genau, was geändert werden soll - je präziser, desto besser.',
      required: true,
      minLength: 15,
      rows: 2
    }
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
  showSocialGeneration: true
};
