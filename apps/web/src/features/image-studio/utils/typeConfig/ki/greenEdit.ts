/**
 * Green Edit KI type configuration
 */
import { HiPhotograph } from 'react-icons/hi';

import {
  IMAGE_STUDIO_CATEGORIES,
  IMAGE_STUDIO_TYPES,
  KI_SUBCATEGORIES,
  FORM_STEPS,
} from '../constants';

import type { KiTypeConfig, TemplateFieldConfig } from '../types';

export const greenEditTypeConfig: KiTypeConfig = {
  id: IMAGE_STUDIO_TYPES.GREEN_EDIT,
  category: IMAGE_STUDIO_CATEGORIES.KI,
  subcategory: KI_SUBCATEGORIES.EDIT,
  label: 'Grün verwandeln',
  description: 'Verwandle dein Bild in eine grüne Vision',
  icon: HiPhotograph,
  previewImage: '/imagine-assets/green-street-example.png',
  requiresImage: true,
  hasTextGeneration: false,
  usesFluxApi: true,
  hasRateLimit: true,
  hasAiEditor: true,
  hasPrecisionMode: true,
  alwaysPrecision: true,
  endpoints: {
    generate: '/flux/green-edit/prompt',
  },
  formComponent: 'EditInstructionForm',
  steps: [FORM_STEPS.IMAGE_UPLOAD, FORM_STEPS.INPUT, FORM_STEPS.RESULT],
  formProps: {
    label: 'Was soll grüner werden?',
    placeholder:
      'Beschreibe detailliert, welche grüne Infrastruktur hinzugefügt werden soll. Z.B. Bäume, Fahrradwege, Solarpanels, Grünflächen...',
    helpText: 'Je detaillierter deine Beschreibung, desto besser das Ergebnis.',
    rows: 2,
  },
  validation: {
    uploadedImage: { required: true, message: 'Bitte lade ein Bild hoch' },
    precisionInstruction: {
      required: true,
      minLength: 15,
      message: 'Bitte gib eine detaillierte Anweisung ein (min. 15 Zeichen)',
    },
  },
};

export const greenEditFieldConfig: TemplateFieldConfig = {
  inputFields: [
    {
      name: 'precisionInstruction',
      type: 'textarea',
      label: 'Was soll grüner werden?',
      subtitle:
        'Beschreibe, welche grünen Elemente hinzugefügt werden sollen (z.B. Bäume, Fahrradwege, Grünflächen)',
      placeholder:
        'Beschreibe detailliert, welche grüne Infrastruktur hinzugefügt werden soll. Z.B. Bäume, Fahrradwege, Solarpanels, Grünflächen...',
      helpText: 'Je detaillierter deine Beschreibung, desto besser das Ergebnis.',
      required: true,
      minLength: 15,
      rows: 2,
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
