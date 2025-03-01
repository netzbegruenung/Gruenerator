import { useState, useCallback } from 'react';

// Liste der unterstützten Plattform-Header
const PLATFORM_HEADERS = [
  'TWITTER:',
  'FACEBOOK:',
  'INSTAGRAM:',
  'LINKEDIN:',
  'AKTIONSIDEEN:',
  'INSTAGRAM REEL:',
  'PRESSEMITTEILUNG:',
  'SUCHANFRAGE:',
  'SUCHERGEBNIS:',
  'ANTRAG:'
];

/**
 * Hook zur Erkennung von Plattform-Inhalten
 * @returns {Object} Plattform-Erkennungsfunktionen
 */
const usePlatformDetection = () => {
  const [detectedPlatforms, setDetectedPlatforms] = useState([]);
  const [hasMultiplePlatforms, setHasMultiplePlatforms] = useState(false);

  /**
   * Prüft, ob der Inhalt Plattform-Header enthält
   * @param {string} content - Zu prüfender Inhalt
   * @returns {boolean} True, wenn Plattform-Header gefunden wurden
   */
  const hasPlatformHeaders = useCallback((content) => {
    if (!content) return false;
    
    return PLATFORM_HEADERS.some(header => content.includes(header));
  }, []);

  /**
   * Prüft, ob der Inhalt mehrere Plattformen enthält
   * @param {string} content - Zu prüfender Inhalt
   * @returns {boolean} True, wenn mehrere Plattformen gefunden wurden
   */
  const checkMultiplePlatforms = useCallback((content) => {
    if (!content) {
      setHasMultiplePlatforms(false);
      setDetectedPlatforms([]);
      return false;
    }

    // Prüfe auf explizite Plattform-Breaks
    const hasBreaks = content.includes('---PLATFORM_BREAK---');
    
    // Zähle die Plattform-Header
    const foundPlatforms = [];
    PLATFORM_HEADERS.forEach(header => {
      if (content.includes(header)) {
        foundPlatforms.push(header.replace(':', ''));
      }
    });
    
    setDetectedPlatforms(foundPlatforms);
    const multiple = foundPlatforms.length >= 2 || hasBreaks;
    setHasMultiplePlatforms(multiple);
    
    return multiple;
  }, []);

  /**
   * Wählt den besten Inhalt aus, wenn mehrere Versionen vorhanden sind
   * @param {string} value - Aktueller Wert
   * @param {string} generatedContent - Neu generierter Inhalt
   * @returns {string} Der beste Inhalt zur Anzeige
   */
  const getBestContent = useCallback((value, generatedContent) => {
    if (!value && !generatedContent) return '';
    
    // Wenn wir mehrere Plattformen haben, verwende den längeren Inhalt
    if (hasMultiplePlatforms && generatedContent && value) {
      return generatedContent.length > value.length ? generatedContent : value;
    }
    
    // Fallback auf den vorhandenen Wert oder generierten Inhalt
    return value || generatedContent || '';
  }, [hasMultiplePlatforms]);

  return {
    detectedPlatforms,
    hasMultiplePlatforms,
    hasPlatformHeaders,
    checkMultiplePlatforms,
    getBestContent
  };
};

export default usePlatformDetection; 