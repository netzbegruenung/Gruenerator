import { useState, useCallback } from 'react';

/**
 * Hook zur Verwaltung der Sichtbarkeit des Formulars.
 * @param {boolean} hasContent - Wird für Kompatibilität beibehalten, aber nicht mehr verwendet.
 * @param {boolean} disableAutoCollapse - Wird für Kompatibilität beibehalten, aber nicht mehr verwendet.
 * @returns {object} - Enthält den Sichtbarkeitsstatus und die Toggle-Funktion.
 */
export const useFormVisibility = (hasContent, disableAutoCollapse = false) => {
  const [isFormVisible, setIsFormVisible] = useState(true);

  // Form stays visible by default now - 50/50 layout when content is generated
  // No auto-collapse behavior - form remains visible for side-by-side layout
  // Parameters kept for backward compatibility but no longer used

  // Manuelles Umschalten der Sichtbarkeit.
  const toggleFormVisibility = useCallback(() => {
    setIsFormVisible(prev => !prev);
  }, []);

  return {
    isFormVisible,
    toggleFormVisibility,
  };
}; 