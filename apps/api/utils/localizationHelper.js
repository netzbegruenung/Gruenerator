/**
 * Localization Helper for Backend Prompt System
 * Handles locale-specific text replacements, primarily for party names
 */

// Party name mappings based on locale
const PARTY_NAMES = {
  'de-DE': 'Bündnis 90/Die Grünen',
  'de-AT': 'Die Grünen – Die Grüne Alternative'
};

// All available localized text mappings
const LOCALE_MAPPINGS = {
  'de-DE': {
    partyName: PARTY_NAMES['de-DE'],
    partyNameGenitive: 'von Bündnis 90/Die Grünen',
    partyNameShort: 'Die Grünen'
  },
  'de-AT': {
    partyName: PARTY_NAMES['de-AT'],
    partyNameGenitive: 'von Die Grünen – Die Grüne Alternative',
    partyNameShort: 'Die Grünen'
  }
};

/**
 * Get localized text for a specific key and locale
 * @param {string} key - The localization key (e.g., 'partyName')
 * @param {string} locale - User locale ('de-DE' or 'de-AT')
 * @returns {string} Localized text
 */
function getLocalizedText(key, locale = 'de-DE') {
  const mappings = LOCALE_MAPPINGS[locale] || LOCALE_MAPPINGS['de-DE'];
  return mappings[key] || mappings.partyName || PARTY_NAMES['de-DE'];
}

/**
 * Replace placeholders in text with localized values
 * @param {string} text - Text containing placeholders like {{partyName}}
 * @param {string} locale - User locale ('de-DE' or 'de-AT')
 * @returns {string} Text with placeholders replaced
 */
function localizePlaceholders(text, locale = 'de-DE') {
  if (!text || typeof text !== 'string') {
    return text;
  }

  const mappings = LOCALE_MAPPINGS[locale] || LOCALE_MAPPINGS['de-DE'];
  let localizedText = text;

  // Replace all placeholders with localized values
  Object.keys(mappings).forEach(key => {
    const placeholder = `{{${key}}}`;
    const value = mappings[key];
    localizedText = localizedText.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
  });

  return localizedText;
}

/**
 * Localize an entire prompt object
 * @param {Object} promptObj - Prompt object with potentially localized fields
 * @param {string} locale - User locale ('de-DE' or 'de-AT')
 * @returns {Object} Localized prompt object
 */
function localizePromptObject(promptObj, locale = 'de-DE') {
  if (!promptObj || typeof promptObj !== 'object') {
    return promptObj;
  }

  const localized = { ...promptObj };

  // Recursively localize string values
  function localizeValue(value) {
    if (typeof value === 'string') {
      return localizePlaceholders(value, locale);
    } else if (Array.isArray(value)) {
      return value.map(localizeValue);
    } else if (value && typeof value === 'object') {
      const localizedObj = {};
      Object.keys(value).forEach(key => {
        localizedObj[key] = localizeValue(value[key]);
      });
      return localizedObj;
    }
    return value;
  }

  // Localize all fields
  Object.keys(localized).forEach(key => {
    localized[key] = localizeValue(localized[key]);
  });

  return localized;
}

/**
 * Get party name for a specific locale
 * @param {string} locale - User locale ('de-DE' or 'de-AT')
 * @returns {string} Party name
 */
function getPartyName(locale = 'de-DE') {
  return getLocalizedText('partyName', locale);
}

/**
 * Extract locale from request object
 * @param {Object} req - Express request object
 * @returns {string} User locale, defaults to 'de-DE'
 */
function extractLocaleFromRequest(req) {
  return req?.user?.locale || 'de-DE';
}

export { PARTY_NAMES, LOCALE_MAPPINGS, getLocalizedText, localizePlaceholders, localizePromptObject, getPartyName, extractLocaleFromRequest };