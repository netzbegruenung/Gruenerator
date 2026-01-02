/**
 * Subtitle Editor Constants
 * Shared configuration data for subtitle styling and positioning
 */

import type {
  SubtitleStylePreference,
  SubtitleHeightPreference,
  SubtitleStyleOption,
  SubtitleHeightOption,
  SubtitleModificationParams,
} from './subtitle-types.js';

/**
 * Available subtitle style options (Core 4)
 */
export const SUBTITLE_STYLE_OPTIONS: SubtitleStyleOption[] = [
  {
    value: 'shadow',
    label: 'Schatten',
    description: 'Empfohlen',
  },
  {
    value: 'standard',
    label: 'Standard',
    description: 'Schwarzer Hintergrund',
  },
  {
    value: 'clean',
    label: 'Clean',
    description: 'Ohne Effekt',
  },
  {
    value: 'tanne',
    label: 'Tanne',
    description: 'Grüner Hintergrund',
  },
];

/**
 * Available subtitle height/position options
 */
export const SUBTITLE_HEIGHT_OPTIONS: SubtitleHeightOption[] = [
  {
    value: 'tief',
    label: 'Tief',
    bottomPercent: 20,
  },
  {
    value: 'standard',
    label: 'Mittig',
    bottomPercent: 33,
  },
];

/**
 * Default subtitle modification parameters
 */
export const DEFAULT_SUBTITLE_PARAMS: SubtitleModificationParams = {
  stylePreference: 'shadow',
  heightPreference: 'tief',
};

/**
 * Style configurations for rendering subtitle overlay
 * These match the web's LiveSubtitlePreview component
 */
export const SUBTITLE_STYLE_CONFIGS: Record<SubtitleStylePreference, {
  backgroundColor: string;
  textColor: string;
  textShadow: string | null;
  padding: string;
  borderRadius: string;
}> = {
  shadow: {
    backgroundColor: 'transparent',
    textColor: '#ffffff',
    textShadow: '0 2px 8px rgba(0, 0, 0, 0.8), 0 0 4px rgba(0, 0, 0, 0.6)',
    padding: '0',
    borderRadius: '0',
  },
  standard: {
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    textColor: '#ffffff',
    textShadow: '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000',
    padding: '0.2em 0.4em',
    borderRadius: '0.1em',
  },
  clean: {
    backgroundColor: 'transparent',
    textColor: '#ffffff',
    textShadow: null,
    padding: '0',
    borderRadius: '0',
  },
  tanne: {
    backgroundColor: '#005538',
    textColor: '#ffffff',
    textShadow: null,
    padding: '0.2em 0.4em',
    borderRadius: '0.1em',
  },
};

/**
 * Tanne background color variants by locale
 */
export const TANNE_COLORS: Record<string, string> = {
  'de-DE': '#005538',
  'de-AT': '#6baa25',
};

/**
 * Height position percentages from bottom
 */
export const HEIGHT_BOTTOM_PERCENT: Record<SubtitleHeightPreference, number> = {
  tief: 20,
  standard: 33,
};

/**
 * German UI labels for subtitle editor
 */
export const SUBTITLE_EDITOR_LABELS = {
  editButton: 'Bearbeiten',
  saveButton: 'Speichern',
  cancelButton: 'Abbrechen',
  styleLabel: 'Stil',
  positionLabel: 'Position',
  unsavedChangesTitle: 'Ungespeicherte Änderungen',
  unsavedChangesMessage: 'Möchtest du die Änderungen verwerfen?',
  discardButton: 'Verwerfen',
  keepEditingButton: 'Weiter bearbeiten',
  noSubtitles: 'Keine Untertitel vorhanden',
  savingText: 'Speichern...',
  savedText: 'Gespeichert',
  errorSaving: 'Fehler beim Speichern',
};

/**
 * Helper function to get style option by value
 */
export function getStyleOption(value: SubtitleStylePreference): SubtitleStyleOption | undefined {
  return SUBTITLE_STYLE_OPTIONS.find((opt) => opt.value === value);
}

/**
 * Helper function to get height option by value
 */
export function getHeightOption(value: SubtitleHeightPreference): SubtitleHeightOption | undefined {
  return SUBTITLE_HEIGHT_OPTIONS.find((opt) => opt.value === value);
}

/**
 * Helper function to get style config with optional locale override for tanne
 */
export function getStyleConfig(
  style: SubtitleStylePreference,
  locale?: string
): typeof SUBTITLE_STYLE_CONFIGS[SubtitleStylePreference] {
  const config = { ...SUBTITLE_STYLE_CONFIGS[style] };

  if (style === 'tanne' && locale && TANNE_COLORS[locale]) {
    config.backgroundColor = TANNE_COLORS[locale];
  }

  return config;
}
