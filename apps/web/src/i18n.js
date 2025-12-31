import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import translations
import deDECommon from './locales/de-DE/common.json';
import deATCommon from './locales/de-AT/common.json';

// Translation resources
const resources = {
  'de-DE': {
    translation: deDECommon
  },
  'de-AT': {
    translation: deATCommon
  }
};

// Validate locale to prevent RangeError with invalid language tags
const validateLocale = (locale) => {
  if (!locale) return false;
  try {
    new Intl.Locale(locale);
    return true;
  } catch {
    return false;
  }
};

// Get safe initial locale
const getSafeLocale = () => {
  const stored = localStorage.getItem('gruenerator_locale');
  if (stored && resources[stored]) return stored;

  // Check navigator languages for valid match
  const navLangs = navigator.languages || [navigator.language];
  for (const lang of navLangs) {
    if (validateLocale(lang)) {
      // Check for exact match first
      if (resources[lang]) return lang;
      // Check for base language match (e.g., 'de' -> 'de-DE')
      const base = lang.split('-')[0];
      if (base === 'de') return 'de-DE';
    }
  }
  return 'de-DE';
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    lng: getSafeLocale(), // safe default language
    fallbackLng: 'de-DE',

    // Language detection configuration - skip navigator to avoid invalid locales
    detection: {
      order: ['localStorage'],
      caches: ['localStorage'],
      lookupLocalStorage: 'gruenerator_locale'
    },

    interpolation: {
      escapeValue: false // React already safeguards from XSS
    },

    // React i18next options
    react: {
      useSuspense: false
    }
  });

// Custom function to set locale and persist
export const setLocale = (locale) => {
  if (resources[locale]) {
    i18n.changeLanguage(locale);
    localStorage.setItem('gruenerator_locale', locale);
    return true;
  }
  return false;
};

// Get current locale
export const getCurrentLocale = () => {
  return i18n.language || 'de-DE';
};

// Check if locale is Austrian
export const isAustrianLocale = () => {
  return getCurrentLocale() === 'de-AT';
};

export default i18n;