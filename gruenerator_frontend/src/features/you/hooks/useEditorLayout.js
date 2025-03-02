import { useState, useEffect } from 'react';

/**
 * Custom Hook zur Berechnung und Verwaltung des Editor-Layouts,
 * insbesondere für mobile Geräte im Bearbeitungsmodus.
 * 
 * @param {boolean} isMobile - Gibt an, ob das Gerät ein mobiles Gerät ist
 * @param {boolean} isEditing - Gibt an, ob sich der Benutzer im Bearbeitungsmodus befindet
 * @returns {Object} Objekt mit Layout-Informationen und Styling-Funktionen
 */
const useEditorLayout = (isMobile, isEditing) => {
  const [safeAreaTop, setSafeAreaTop] = useState(0);
  
  // Berechne den sicheren Bereich am oberen Rand
  useEffect(() => {
    if (isMobile && isEditing) {
      // Initialer Wert für den oberen Abstand
      let topOffset = 0; // Mindestabstand
      
      // Prüfe, ob wir auf iOS sind und hole den Safe Area Inset
      const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      if (iOS) {
        // Versuche, den Safe Area Inset für iOS-Geräte zu bekommen
        const safeAreaInset = parseInt(
          getComputedStyle(document.documentElement).getPropertyValue('--safe-area-inset-top') || '0'
        );
        topOffset += safeAreaInset;
      }
      
      // Setze den berechneten Wert
      setSafeAreaTop(topOffset);
      
      // Aktualisiere die CSS-Variable
      document.documentElement.style.setProperty('--editor-top-offset', `${topOffset}px`);
    }
  }, [isMobile, isEditing]);

  // Berechne die Styles für den Editor-Container
  const getEditorContainerStyle = () => {
    if (isMobile && isEditing) {
      return {
        height: `calc(100vh - ${safeAreaTop}px)`
      };
    }
    return {};
  };

  // Berechne die Styles für den Hauptcontainer
  const getMainContainerStyle = () => {
    if (isMobile && isEditing) {
      return { marginTop: 0 };
    }
    return {};
  };

  // Scrolle zum Anfang des Editors, wenn er geöffnet wird
  useEffect(() => {
    if (isMobile && isEditing) {
      window.scrollTo(0, 0);
    }
  }, [isMobile, isEditing]);

  return {
    safeAreaTop,
    getEditorContainerStyle,
    getMainContainerStyle
  };
};

export default useEditorLayout; 