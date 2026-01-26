/**
 * Edit Sheet Configuration
 * Type-specific field configurations for the template editing bottom sheet
 */

import type { ImageStudioTemplateType } from '@gruenerator/shared/image-studio';

export interface EditFieldConfig {
  key: string;
  label: string;
  multiline?: boolean;
  maxLength?: number;
  placeholder?: string;
}

export interface EditSheetConfig {
  textFields: EditFieldConfig[];
  showFontSize: boolean;
  fontSizeType?: 'standard' | 'zitat' | 'grouped';
  showColorScheme: boolean;
  showAdvanced: boolean;
  showCredit?: boolean;
}

export const EDIT_SHEET_CONFIGS: Record<ImageStudioTemplateType, EditSheetConfig> = {
  dreizeilen: {
    textFields: [
      { key: 'line1', label: 'Zeile 1', maxLength: 35 },
      { key: 'line2', label: 'Zeile 2', maxLength: 35 },
      { key: 'line3', label: 'Zeile 3', maxLength: 35 },
    ],
    showFontSize: true,
    fontSizeType: 'standard',
    showColorScheme: true,
    showAdvanced: true,
    showCredit: true,
  },
  zitat: {
    textFields: [{ key: 'quote', label: 'Zitat', multiline: true, maxLength: 300 }],
    showFontSize: true,
    fontSizeType: 'zitat',
    showColorScheme: false,
    showAdvanced: false,
  },
  'zitat-pure': {
    textFields: [{ key: 'quote', label: 'Zitat', multiline: true, maxLength: 300 }],
    showFontSize: true,
    fontSizeType: 'zitat',
    showColorScheme: false,
    showAdvanced: false,
  },
  info: {
    textFields: [
      { key: 'header', label: 'Header', maxLength: 65 },
      { key: 'subheader', label: 'Subheader', maxLength: 125 },
      { key: 'body', label: 'Body', multiline: true, maxLength: 255 },
    ],
    showFontSize: false,
    showColorScheme: false,
    showAdvanced: false,
  },
  veranstaltung: {
    textFields: [
      { key: 'eventTitle', label: 'Titel', maxLength: 100 },
      { key: 'beschreibung', label: 'Beschreibung', multiline: true, maxLength: 200 },
      { key: 'weekday', label: 'Wochentag', placeholder: 'z.B. Mittwoch', maxLength: 20 },
      { key: 'date', label: 'Datum', placeholder: 'z.B. 25. Januar', maxLength: 20 },
      { key: 'time', label: 'Uhrzeit', placeholder: 'z.B. 19:00 Uhr', maxLength: 20 },
      { key: 'locationName', label: 'Ort', maxLength: 50 },
      { key: 'address', label: 'Adresse', maxLength: 100 },
    ],
    showFontSize: false,
    showColorScheme: false,
    showAdvanced: false,
  },
  profilbild: {
    textFields: [],
    showFontSize: false,
    showColorScheme: false,
    showAdvanced: false,
  },
};

export function getEditSheetConfig(type: ImageStudioTemplateType): EditSheetConfig {
  return EDIT_SHEET_CONFIGS[type];
}

export function getTextFields(type: ImageStudioTemplateType): EditFieldConfig[] {
  return EDIT_SHEET_CONFIGS[type]?.textFields || [];
}

export function supportsEditing(type: ImageStudioTemplateType | null): boolean {
  return type !== null && type in EDIT_SHEET_CONFIGS;
}

/**
 * Edit Category Types
 * Used for the two-tier editing UI (bar + modal)
 */
export type EditCategory =
  | 'text'
  | 'fontSize'
  | 'colorScheme'
  | 'balkenOffset'
  | 'balkenGruppe'
  | 'sonnenblume'
  | 'credit';

export interface CategoryConfig {
  id: EditCategory;
  label: string;
  icon: string;
}

const CATEGORY_CONFIGS: Record<EditCategory, Omit<CategoryConfig, 'id'>> = {
  text: { label: 'Text', icon: 'text-outline' },
  fontSize: { label: 'Größe', icon: 'resize-outline' },
  colorScheme: { label: 'Farbe', icon: 'color-palette-outline' },
  balkenOffset: { label: 'Balken', icon: 'remove-outline' },
  balkenGruppe: { label: 'Gruppe', icon: 'apps-outline' },
  sonnenblume: { label: 'Blume', icon: 'flower-outline' },
  credit: { label: 'Credit', icon: 'at-outline' },
};

export function getAvailableCategories(type: ImageStudioTemplateType): CategoryConfig[] {
  const config = getEditSheetConfig(type);
  const categories: CategoryConfig[] = [];

  if (config.textFields.length > 0) {
    categories.push({ id: 'text', ...CATEGORY_CONFIGS.text });
  }
  if (config.showFontSize) {
    categories.push({ id: 'fontSize', ...CATEGORY_CONFIGS.fontSize });
  }
  if (config.showColorScheme) {
    categories.push({ id: 'colorScheme', ...CATEGORY_CONFIGS.colorScheme });
  }
  if (config.showAdvanced) {
    categories.push({ id: 'balkenOffset', ...CATEGORY_CONFIGS.balkenOffset });
    categories.push({ id: 'balkenGruppe', ...CATEGORY_CONFIGS.balkenGruppe });
    categories.push({ id: 'sonnenblume', ...CATEGORY_CONFIGS.sonnenblume });
  }
  if (config.showCredit) {
    categories.push({ id: 'credit', ...CATEGORY_CONFIGS.credit });
  }

  return categories;
}
