/**
 * Österreich (de-AT) template type configurations.
 *
 * Editor-first: selecting an AT template opens the canvas editor directly
 * (steps: CANVAS_EDIT → RESULT) with the Austrian CI config. Audience-gated to
 * de-AT so the studio picker only shows these to Austrian users.
 */
import { PiChatCircle, PiInfo, PiQuotes, PiSquaresFour, PiTextT } from 'react-icons/pi';

import { IMAGE_STUDIO_CATEGORIES, IMAGE_STUDIO_TYPES, FORM_STEPS } from '../constants';

import type { TemplateTypeConfig, TemplateFieldConfig } from '../types';

const baseAt = {
  category: IMAGE_STUDIO_CATEGORIES.TEMPLATES,
  audience: 'de-AT' as const,
  requiresImage: false,
  hasTextGeneration: false,
  hasTextCanvasEdit: true,
  usesFluxApi: false,
  hasRateLimit: false,
  steps: [FORM_STEPS.CANVAS_EDIT, FORM_STEPS.RESULT],
};

export const infoAtTypeConfig: TemplateTypeConfig = {
  ...baseAt,
  id: IMAGE_STUDIO_TYPES.INFO_AT,
  label: 'Info',
  description: 'Headline mit Betonung und Logo',
  icon: PiInfo,
  previewImage: '/imagine/previews/info-at-preview.webp',
  endpoints: { canvas: '/info_at_canvas' },
  legacyType: 'InfoAt',
};

export const zitatAtTypeConfig: TemplateTypeConfig = {
  ...baseAt,
  id: IMAGE_STUDIO_TYPES.ZITAT_AT,
  label: 'Zitat',
  description: 'Zitat mit Hintergrundbild',
  icon: PiQuotes,
  previewImage: '/imagine/previews/zitat-at-preview.webp',
  endpoints: { canvas: '/zitat_at_canvas' },
  legacyType: 'ZitatAt',
};

export const zitatPureAtTypeConfig: TemplateTypeConfig = {
  ...baseAt,
  id: IMAGE_STUDIO_TYPES.ZITAT_PURE_AT,
  label: 'Zitat Pur',
  description: 'Zitat auf dunkelgrüner Fläche',
  icon: PiChatCircle,
  previewImage: '/imagine/previews/zitat-pure-at-preview.webp',
  endpoints: { canvas: '/zitat_pure_at_canvas' },
  legacyType: 'ZitatPureAt',
};

export const dreizeilenAtTypeConfig: TemplateTypeConfig = {
  ...baseAt,
  id: IMAGE_STUDIO_TYPES.DREIZEILEN_AT,
  label: '3 Zeilen',
  description: 'Dreizeilige Headline mit Betonung',
  icon: PiTextT,
  previewImage: '/imagine/previews/dreizeilen-at-preview.webp',
  endpoints: { canvas: '/dreizeilen_at_canvas' },
  legacyType: 'DreizeilenAt',
};

export const freeformAtTypeConfig: TemplateTypeConfig = {
  ...baseAt,
  id: IMAGE_STUDIO_TYPES.FREEFORM_AT,
  label: 'Freies Design',
  description: 'Leere Leinwand mit österreichischem CI',
  icon: PiSquaresFour,
  previewImage: '/imagine/previews/freeform-preview.webp',
  endpoints: {},
  legacyType: 'FreeformAt',
};

const emptyFieldConfig: TemplateFieldConfig = {
  inputFields: [],
  previewFields: [],
  resultFields: [],
  responseMapping: () => ({}),
  showImageUpload: false,
  showColorControls: false,
  showFontSizeControl: false,
  showAdvancedEditing: false,
  showCredit: false,
  showEditPanel: true,
  showAutoSave: true,
  showSocialGeneration: true,
};

export const infoAtFieldConfig = emptyFieldConfig;
export const zitatAtFieldConfig = emptyFieldConfig;
export const zitatPureAtFieldConfig = emptyFieldConfig;
export const dreizeilenAtFieldConfig = emptyFieldConfig;
export const freeformAtFieldConfig = emptyFieldConfig;
