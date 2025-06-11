import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * Hook zur Verwaltung der Sichtbarkeit des Formulars.
 * @param {boolean} hasContent - Gibt an, ob Inhalt vorhanden ist (generiert oder gestreamt).
 * @param {boolean} disableAutoCollapse - Deaktiviert das automatische Ausblenden.
 * @returns {object} - Enthält den Sichtbarkeitsstatus und die Toggle-Funktion.
 */
export const useFormVisibility = (hasContent, disableAutoCollapse = false) => {
  const [isFormVisible, setIsFormVisible] = useState(true);
  const autoCollapsed = useRef(false);

  // Effekt, um das Formular automatisch auszublenden, wenn Inhalt generiert wird.
  useEffect(() => {
    if (hasContent && isFormVisible && !autoCollapsed.current && !disableAutoCollapse) {
      setIsFormVisible(false);
      autoCollapsed.current = true; // Stellt sicher, dass es nur einmal automatisch passiert.
    }
  }, [hasContent, isFormVisible, disableAutoCollapse]);

  // Manuelles Umschalten der Sichtbarkeit.
  const toggleFormVisibility = useCallback(() => {
    setIsFormVisible(prev => !prev);
  }, []);

  return {
    isFormVisible,
    toggleFormVisibility,
  };
}; 