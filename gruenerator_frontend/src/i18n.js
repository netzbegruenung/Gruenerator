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

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    lng: 'de-DE', // default language
    fallbackLng: 'de-DE',

    // Language detection configuration
    detection: {
      order: ['localStorage', 'navigator'],
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