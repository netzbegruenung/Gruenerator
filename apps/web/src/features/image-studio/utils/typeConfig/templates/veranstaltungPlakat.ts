/**
 * Veranstaltung Plakat type configuration
 *
 * Same form / data shape as the sharepic Veranstaltung — only difference is
 * the plakat-tuned canvas config under the hood. We share the field config
 * with the sharepic so future tweaks to inputs/preview/result fields stay
 * in sync.
 */
import { PiCalendar } from 'react-icons/pi';

import { IMAGE_STUDIO_CATEGORIES, IMAGE_STUDIO_TYPES, FORM_STEPS } from '../constants';

import { veranstaltungFieldConfig } from './veranstaltung';

import type { TemplateTypeConfig, TemplateFieldConfig } from '../types';

export const veranstaltungPlakatTypeConfig: TemplateTypeConfig = {
  id: IMAGE_STUDIO_TYPES.VERANSTALTUNG_PLAKAT,
  category: IMAGE_STUDIO_CATEGORIES.TEMPLATES,
  label: 'Veranstaltung',
  description: 'Event-Plakat mit Datum, Ort und Beschreibung',
  icon: PiCalendar,
  previewImage: '/imagine/previews/veranstaltung-preview.webp',
  previewImageFallback: '/imagine/previews/veranstaltung-preview.png',
  requiresImage: true,
  hasTextGeneration: true,
  hasTextCanvasEdit: true,
  usesFluxApi: false,
  hasRateLimit: false,
  endpoints: {
    text: '/veranstaltung_claude',
    canvas: '/veranstaltung_canvas',
  },
  steps: [FORM_STEPS.INPUT, FORM_STEPS.IMAGE_UPLOAD, FORM_STEPS.CANVAS_EDIT, FORM_STEPS.RESULT],
  legacyType: 'Veranstaltung',
  primaryFormatGroup: 'plakat',
  supportedFormatGroups: ['plakat'],
};

export const veranstaltungPlakatFieldConfig: TemplateFieldConfig = veranstaltungFieldConfig;
