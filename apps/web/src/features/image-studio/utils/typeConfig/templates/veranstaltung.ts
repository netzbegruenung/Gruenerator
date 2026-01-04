/**
 * Veranstaltung (Event) type configuration
 */
import { PiCalendar } from 'react-icons/pi';
import { IMAGE_STUDIO_CATEGORIES, IMAGE_STUDIO_TYPES, FORM_STEPS } from '../constants';
import type { TemplateTypeConfig, TemplateFieldConfig } from '../types';

export const veranstaltungTypeConfig: TemplateTypeConfig = {
  id: IMAGE_STUDIO_TYPES.VERANSTALTUNG,
  category: IMAGE_STUDIO_CATEGORIES.TEMPLATES,
  label: 'Veranstaltung',
  description: 'Event-Ankündigung mit Datum, Ort und Beschreibung',
  icon: PiCalendar,
  previewImage: '/imagine/previews/veranstaltung-preview.png',
  requiresImage: true,
  hasTextGeneration: true,
  usesFluxApi: false,
  hasRateLimit: false,
  endpoints: {
    text: '/veranstaltung_claude',
    canvas: '/veranstaltung_canvas'
  },
  steps: [FORM_STEPS.INPUT, FORM_STEPS.IMAGE_UPLOAD, FORM_STEPS.CANVAS_EDIT, FORM_STEPS.RESULT],
  legacyType: 'Veranstaltung'
};

interface VeranstaltungEvent {
  eventTitle?: string;
  beschreibung?: string;
  weekday?: string;
  date?: string;
  time?: string;
  locationName?: string;
  address?: string;
}

interface VeranstaltungResult {
  mainEvent?: VeranstaltungEvent;
  eventTitle?: string;
  beschreibung?: string;
  weekday?: string;
  date?: string;
  time?: string;
  locationName?: string;
  address?: string;
}

interface VeranstaltungAlternative {
  eventTitle?: string;
  beschreibung?: string;
  weekday?: string;
  date?: string;
  time?: string;
  locationName?: string;
  address?: string;
}

export const veranstaltungFieldConfig: TemplateFieldConfig = {
  inputFields: [
    {
      name: 'thema',
      type: 'textarea',
      label: 'Event-Beschreibung',
      subtitle: 'Beschreibe die Veranstaltung - Thema, Datum, Uhrzeit, Ort',
      placeholder: 'z.B. Klimaschutz-Diskussion am 15. Januar 2025 um 19 Uhr im Rathaus Musterstadt, Hauptstraße 1',
      required: true,
      rows: 3
    }
  ],
  previewFields: [
    { name: 'eventTitle', type: 'text', label: 'Event-Titel', placeholder: 'z.B. DISKUSSION' },
    { name: 'beschreibung', type: 'textarea', label: 'Beschreibung', placeholder: 'z.B. Gemeinsam für mehr Klimaschutz in unserer Stadt!', rows: 2 },
    { name: 'weekday', type: 'text', label: 'Wochentag (im Kreis)', placeholder: 'z.B. MI' },
    { name: 'date', type: 'text', label: 'Datum (im Kreis)', placeholder: 'z.B. 15.01.' },
    { name: 'time', type: 'text', label: 'Uhrzeit (im Kreis)', placeholder: 'z.B. 19 UHR' },
    { name: 'locationName', type: 'text', label: 'Veranstaltungsort', placeholder: 'z.B. Rathaus Musterstadt' },
    { name: 'address', type: 'text', label: 'Adresse', placeholder: 'z.B. Hauptstraße 1, 12345 Musterstadt' }
  ],
  showPreviewLabels: true,
  resultFields: ['eventTitle', 'beschreibung', 'weekday', 'date', 'time', 'locationName', 'address'],
  responseMapping: (result: VeranstaltungResult) => ({
    eventTitle: result.mainEvent?.eventTitle || result.eventTitle || '',
    beschreibung: result.mainEvent?.beschreibung || result.beschreibung || '',
    weekday: result.mainEvent?.weekday || result.weekday || '',
    date: result.mainEvent?.date || result.date || '',
    time: result.mainEvent?.time || result.time || '',
    locationName: result.mainEvent?.locationName || result.locationName || '',
    address: result.mainEvent?.address || result.address || ''
  }),
  alternativesMapping: (alt: VeranstaltungAlternative) => ({
    eventTitle: alt.eventTitle || '',
    beschreibung: alt.beschreibung || '',
    weekday: alt.weekday || '',
    date: alt.date || '',
    time: alt.time || '',
    locationName: alt.locationName || '',
    address: alt.address || ''
  }),
  showImageUpload: true,
  showColorControls: false,
  showFontSizeControl: true,
  showGroupedFontSizeControl: true,
  showAdvancedEditing: false,
  showCredit: false,
  showAlternatives: true,
  showEditPanel: true,
  showAutoSave: true,
  showSocialGeneration: true,
  skipSloganStep: true
};
