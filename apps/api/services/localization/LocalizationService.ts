/**
 * Localization Service
 * Handles locale-specific text replacements, primarily for party names
 */

import type { Locale, LocalizationKey, LocaleMappings, RequestWithLocale } from './types.js';

// Party name mappings based on locale
export const PARTY_NAMES: Record<Locale, string> = {
  'de-DE': 'Bündnis 90/Die Grünen',
  'de-AT': 'Die Grünen – Die Grüne Alternative',
};

// All available localized text mappings
export const LOCALE_MAPPINGS: LocaleMappings = {
  'de-DE': {
    partyName: PARTY_NAMES['de-DE'],
    partyNameGenitive: 'von Bündnis 90/Die Grünen',
    partyNameShort: 'Die Grünen',
  },
  'de-AT': {
    partyName: PARTY_NAMES['de-AT'],
    partyNameGenitive: 'von Die Grünen – Die Grüne Alternative',
    partyNameShort: 'Die Grünen',
  },
};

export class LocalizationService {
  /**
   * Get localized text for a specific key and locale
   */
  getLocalizedText(key: LocalizationKey, locale: Locale = 'de-DE'): string {
    const mappings = LOCALE_MAPPINGS[locale] || LOCALE_MAPPINGS['de-DE'];
    return mappings[key] || mappings.partyName || PARTY_NAMES['de-DE'];
  }

  /**
   * Replace placeholders in text with localized values
   * Replaces patterns like {{partyName}} with locale-specific values
   */
  localizePlaceholders(text: string, locale: Locale = 'de-DE'): string {
    if (!text || typeof text !== 'string') {
      return text;
    }

    const mappings = LOCALE_MAPPINGS[locale] || LOCALE_MAPPINGS['de-DE'];
    let localizedText = text;

    // Replace all placeholders with localized values
    Object.keys(mappings).forEach((key) => {
      const placeholder = `{{${key}}}`;
      const value = mappings[key as LocalizationKey];
      localizedText = localizedText.replace(
        new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'),
        value
      );
    });

    return localizedText;
  }

  /**
   * Localize an entire prompt object (recursive)
   */
  localizePromptObject<T>(promptObj: T, locale: Locale = 'de-DE'): T {
    if (!promptObj || typeof promptObj !== 'object') {
      return promptObj;
    }

    // Recursive localization helper
    const localizeValue = (value: any): any => {
      if (typeof value === 'string') {
        return this.localizePlaceholders(value, locale);
      } else if (Array.isArray(value)) {
        return value.map(localizeValue);
      } else if (value && typeof value === 'object') {
        const localizedObj: any = {};
        Object.keys(value).forEach((key) => {
          localizedObj[key] = localizeValue(value[key]);
        });
        return localizedObj;
      }
      return value;
    };

    // Localize all fields
    const localized: any = { ...promptObj };
    Object.keys(localized).forEach((key) => {
      localized[key] = localizeValue(localized[key]);
    });

    return localized;
  }

  /**
   * Get party name for a specific locale
   */
  getPartyName(locale: Locale = 'de-DE'): string {
    return this.getLocalizedText('partyName', locale);
  }

  /**
   * Extract locale from request object
   */
  extractLocaleFromRequest(req: RequestWithLocale): Locale {
    // 1. Authenticated user's saved preference (highest priority)
    if (req?.user?.locale) {
      return req.user.locale as Locale;
    }

    // 2. Frontend-sent browser locale header
    const headerLocale = req?.headers?.['x-user-locale'];
    if (headerLocale === 'de-DE' || headerLocale === 'de-AT') {
      return headerLocale;
    }

    // 3. Parse Accept-Language header
    const acceptLang = req?.headers?.['accept-language'];
    if (acceptLang && typeof acceptLang === 'string') {
      if (acceptLang.includes('de-AT')) {
        return 'de-AT';
      }
    }

    // 4. Default
    return 'de-DE';
  }
}

// Export singleton instance
export const localizationService = new LocalizationService();

// Export named functions for backward compatibility
export const getLocalizedText = (key: LocalizationKey, locale: Locale = 'de-DE') =>
  localizationService.getLocalizedText(key, locale);

export const localizePlaceholders = (text: string, locale: Locale = 'de-DE') =>
  localizationService.localizePlaceholders(text, locale);

export const localizePromptObject = <T>(promptObj: T, locale: Locale = 'de-DE') =>
  localizationService.localizePromptObject(promptObj, locale);

export const getPartyName = (locale: Locale = 'de-DE') => localizationService.getPartyName(locale);

export const extractLocaleFromRequest = (req: RequestWithLocale) =>
  localizationService.extractLocaleFromRequest(req);
