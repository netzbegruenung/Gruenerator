/**
 * Österreich (de-AT) template type configurations.
 *
 * Volle KI-Strecke wie bei den deutschen Sujets: Thema eingeben → Text
 * generieren → Leinwand öffnen. Die Texte kommen aus den österreichischen
 * Prompts, nicht aus den deutschen — die AT-Sujets setzen anders (der
 * Dreizeiler auf ~15 Zeichen pro Zeile statt 35, das Info-Sujet auf
 * Introline/Satz/Akzent statt Header/Subheader/Body). Deshalb hängen sie an
 * eigenen Vertragsrouten (`…/text/dreizeilen_at`, `…/text/info_at`) und nicht
 * an den deutschen mit einem Locale-Schalter.
 *
 * `freeform-at` bleibt bewusst ohne Textgenerierung: eine leere Leinwand ist
 * sein ganzer Zweck.
 *
 * Audience-gated auf de-AT, die Auswahl zeigt sie also nur Nutzer*innen in
 * Österreich.
 */
import { PiChatCircle, PiInfo, PiQuotes, PiSquaresFour, PiTextT } from 'react-icons/pi';

import { IMAGE_STUDIO_CATEGORIES, IMAGE_STUDIO_TYPES, FORM_STEPS } from '../constants';

import type { TemplateTypeConfig, TemplateFieldConfig } from '../types';

const baseAt = {
  category: IMAGE_STUDIO_CATEGORIES.TEMPLATES,
  audience: 'de-AT' as const,
  requiresImage: false,
  hasTextGeneration: true,
  hasTextCanvasEdit: true,
  usesFluxApi: false,
  hasRateLimit: false,
  steps: [FORM_STEPS.INPUT, FORM_STEPS.CANVAS_EDIT, FORM_STEPS.RESULT],
};

/** Ein Eingabefeld genügt allen AT-Sujets — der Prompt zieht den Rest daraus. */
const themaInput = (subtitle: string) => [
  {
    name: 'thema',
    type: 'textarea' as const,
    label: 'Thema & Details',
    subtitle,
    placeholder: 'Beschreibe dein Thema, z.B. Klimaschutz mit Fokus auf erneuerbare Energien...',
    required: true,
    minLength: 3,
  },
];

const baseAtFieldFlags = {
  showColorControls: false,
  showAdvancedEditing: false,
  showCredit: false,
  showEditPanel: true,
  showAutoSave: true,
  showSocialGeneration: true,
};

export const zitatAtTypeConfig: TemplateTypeConfig = {
  ...baseAt,
  id: IMAGE_STUDIO_TYPES.ZITAT_AT,
  label: 'Zitat',
  description: 'Zitat auf Foto oder Farbfläche',
  icon: PiQuotes,
  previewImage: '/imagine/previews/zitat-at-preview.webp',
  endpoints: { canvas: '/zitat_at_canvas' },
  legacyType: 'ZitatAt',
  // Dieses Sujet ist das einzige AT-Template, dessen Leinwand ein Bild
  // VERLANGT (`zitat-at` → `imageSrc`, required). Ohne den Upload-Schritt
  // scheiterte das Anlegen der Leinwand, statt vorher danach zu fragen.
  requiresImage: true,
  inputBeforeImage: true,
  parallelPreload: true,
  steps: [FORM_STEPS.INPUT, FORM_STEPS.IMAGE_UPLOAD, FORM_STEPS.CANVAS_EDIT, FORM_STEPS.RESULT],
};

export const zitatPureAtTypeConfig: TemplateTypeConfig = {
  ...baseAt,
  id: IMAGE_STUDIO_TYPES.ZITAT_PURE_AT,
  label: 'Zitat Pur',
  description: 'Zitat auf Farbfläche oder Foto',
  icon: PiChatCircle,
  previewImage: '/imagine/previews/zitat-pure-at-preview.webp',
  endpoints: { canvas: '/zitat_pure_at_canvas' },
  legacyType: 'ZitatPureAt',
};

export const dreizeilenOverlayAtTypeConfig: TemplateTypeConfig = {
  ...baseAt,
  id: IMAGE_STUDIO_TYPES.DREIZEILEN_OVERLAY_AT,
  label: '3 Zeilen',
  description: 'Dreizeilige Headline auf Farbfläche über einem Foto',
  icon: PiTextT,
  previewImage: '/imagine/previews/dreizeilen-overlay-at-preview.webp',
  endpoints: { canvas: '/dreizeilen_overlay_at_canvas' },
  legacyType: 'DreizeilenOverlayAt',
};

export const infoAtTypeConfig: TemplateTypeConfig = {
  ...baseAt,
  id: IMAGE_STUDIO_TYPES.INFO_AT,
  label: 'Info',
  description: 'Introline, Infotext und gelbe Schlusszeile auf Farbfläche oder Foto',
  icon: PiInfo,
  previewImage: '/imagine/previews/info-at-preview.webp',
  endpoints: { canvas: '/info_at_canvas' },
  legacyType: 'InfoAt',
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
  hasTextGeneration: false,
  steps: [FORM_STEPS.CANVAS_EDIT, FORM_STEPS.RESULT],
};

interface QuoteResult {
  quote?: string;
}

interface SloganAtResult {
  mainSlogan?: { line1?: string; line2?: string; line3?: string; subline?: string };
  searchTerms?: string[];
}

interface InfoAtResult {
  introline?: string;
  text?: string;
  accent?: string;
  searchTerms?: string[];
}

const quoteAtFieldConfig: TemplateFieldConfig = {
  ...baseAtFieldFlags,
  inputFields: themaInput('Beschreibe das Thema, zu dem ein Zitat erstellt werden soll'),
  previewFields: [
    { name: 'quote', type: 'textarea', label: 'Zitat' },
    { name: 'name', type: 'text', label: 'Zitiert wird', placeholder: 'Name der Person' },
  ],
  resultFields: ['quote'],
  responseMapping: (result: QuoteResult) => ({
    quote: result.quote || '',
  }),
  showImageUpload: true,
  showFontSizeControl: true,
};

export const zitatAtFieldConfig = quoteAtFieldConfig;
export const zitatPureAtFieldConfig: TemplateFieldConfig = {
  ...quoteAtFieldConfig,
  showImageUpload: false,
};

export const dreizeilenOverlayAtFieldConfig: TemplateFieldConfig = {
  ...baseAtFieldFlags,
  inputFields: themaInput('Beschreibe dein Thema für die Texterstellung durch KI'),
  previewFields: [
    { name: 'line1', type: 'text', label: 'Zeile 1' },
    { name: 'accent', type: 'text', label: 'Zeile 2 (gelb)' },
    { name: 'line3', type: 'text', label: 'Zeile 3' },
    { name: 'subline', type: 'text', label: 'Subline' },
  ],
  resultFields: ['line1', 'accent', 'line3', 'subline'],
  // Die Mittelzeile heisst auf der AT-Leinwand `accent`, weil sie gelb und
  // kursiv gesetzt wird — dieselbe Umbenennung nimmt der Chat-Pfad in
  // `buildVariantInitialProps` vor.
  responseMapping: (result: SloganAtResult) => ({
    line1: result.mainSlogan?.line1 || '',
    accent: result.mainSlogan?.line2 || '',
    line3: result.mainSlogan?.line3 || '',
    subline: result.mainSlogan?.subline || '',
    searchTerms: result.searchTerms || [],
  }),
  showImageUpload: true,
  showFontSizeControl: true,
};

export const infoAtFieldConfig: TemplateFieldConfig = {
  ...baseAtFieldFlags,
  inputFields: themaInput('Beschreibe dein Info-Thema für eine strukturierte Darstellung'),
  previewFields: [
    { name: 'introline', type: 'text', label: 'Introline' },
    { name: 'text', type: 'textarea', label: 'Infotext' },
    { name: 'accent', type: 'text', label: 'Schlusszeile (gelb)' },
  ],
  resultFields: ['introline', 'text', 'accent'],
  responseMapping: (result: InfoAtResult) => ({
    introline: result.introline || '',
    text: result.text || '',
    accent: result.accent || '',
    searchTerms: result.searchTerms || [],
  }),
  showImageUpload: false,
  showFontSizeControl: false,
};

export const freeformAtFieldConfig: TemplateFieldConfig = {
  ...baseAtFieldFlags,
  inputFields: [],
  previewFields: [],
  resultFields: [],
  responseMapping: () => ({}),
  showImageUpload: false,
  showFontSizeControl: false,
};
