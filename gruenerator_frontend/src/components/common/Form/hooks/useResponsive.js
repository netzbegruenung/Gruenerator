import { useState, useEffect, useCallback } from 'react';

/**
 * Hook für responsive Design-Anpassungen
 * @param {number} mobileBreakpoint - Breakpoint für mobile Ansicht in Pixeln
 * @returns {Object} Responsive-Zustand und Funktionen
 */
const useResponsive = (mobileBreakpoint = 768) => {
  const [isMobileView, setIsMobileView] = useState(window.innerWidth <= mobileBreakpoint);
  
  // Funktion zum Aktualisieren des mobilen Zustands
  const updateMobileState = useCallback(() => {
    setIsMobileView(window.innerWidth <= mobileBreakpoint);
  }, [mobileBreakpoint]);

  // Event-Listener für Fenstergrößenänderungen
  useEffect(() => {
    const handleResize = () => {
      updateMobileState();
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [updateMobileState]);

  /**
   * Berechnet den Anzeigetitel basierend auf dem Gerätezustand
   * @param {string} title - Standardtitel
   * @param {boolean} isEditing - Bearbeitungsmodus aktiv
   * @param {any} generatedContent - Generierter Inhalt
   * @returns {string} Anzeigetitel
   */
  const getDisplayTitle = useCallback((title, isEditing, generatedContent) => {
    if (isMobileView && isEditing) return "Grünerator Editor";
    if (!generatedContent) return title;
    const helpDisplay = generatedContent?.props?.['data-display-title'];
    return helpDisplay || title;
  }, [isMobileView]);

  return {
    isMobileView,
    updateMobileState,
    getDisplayTitle
  };
};

export default useResponsive; 