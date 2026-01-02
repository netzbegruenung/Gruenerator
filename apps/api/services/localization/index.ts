/**
 * Localization Service
 * Utilities for locale-specific text replacements
 */

// Class exports
export { LocalizationService, localizationService } from './LocalizationService.js';

// Named function exports (backward compatibility)
export {
  getLocalizedText,
  localizePlaceholders,
  localizePromptObject,
  getPartyName,
  extractLocaleFromRequest,
  PARTY_NAMES,
  LOCALE_MAPPINGS
} from './LocalizationService.js';

// Type exports
export type { Locale, LocalizationKey, LocaleMappings, RequestWithLocale } from './types.js';
