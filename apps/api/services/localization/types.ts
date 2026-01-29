/**
 * Localization Service Types
 */

/**
 * Supported locales
 */
export type Locale = 'de-DE' | 'de-AT';

/**
 * Localization keys for text replacement
 */
export type LocalizationKey = 'partyName' | 'partyNameGenitive' | 'partyNameShort';

/**
 * Locale mappings structure
 */
export interface LocaleMappings {
  [locale: string]: {
    partyName: string;
    partyNameGenitive: string;
    partyNameShort: string;
  };
}

/**
 * Express request with user locale
 */
export interface RequestWithLocale {
  user?: {
    locale?: Locale;
    [key: string]: any;
  };
  headers?: {
    'x-user-locale'?: string;
    'accept-language'?: string;
    [key: string]: string | string[] | undefined;
  };
  [key: string]: any;
}
