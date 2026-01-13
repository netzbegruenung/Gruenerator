import { useState, useEffect, useCallback, ReactNode } from 'react';

/**
 * Hook für responsive Design-Anpassungen
 * @param {number} mobileBreakpoint - Breakpoint für mobile Ansicht in Pixeln
 * @returns {Object} Responsive-Zustand und Funktionen
 */
const useResponsive = (mobileBreakpoint = 768) => {
    const [isMobileView, setIsMobileView] = useState(typeof window !== 'undefined' ? window.innerWidth <= mobileBreakpoint : false);

    // Funktion zum Aktualisieren des mobilen Zustands
    const updateMobileState = useCallback(() => {
        setIsMobileView(window.innerWidth <= mobileBreakpoint);
    }, [mobileBreakpoint]);

    // Event-Listener für Fenstergrößenänderungen mit Debouncing
    useEffect(() => {
        let timeoutId: ReturnType<typeof setTimeout>;
        const handleResize = () => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                updateMobileState();
            }, 150);
        };

        window.addEventListener('resize', handleResize);
        return () => {
            clearTimeout(timeoutId);
            window.removeEventListener('resize', handleResize);
        };
    }, [updateMobileState]);

    /**
     * Berechnet den Anzeigetitel basierend auf dem Gerätezustand
     * @param {string} title - Standardtitel
     * @param {boolean} isEditing - Bearbeitungsmodus aktiv
     * @param {unknown} generatedContent - Generierter Inhalt
     * @returns {string} Anzeigetitel
     */
    const getDisplayTitle = useCallback((title: string, isEditing: boolean, generatedContent: unknown) => {
        if (isMobileView && isEditing) return "Grünerator Editor";
        if (!generatedContent) return title;
        const helpDisplay = (generatedContent as { props?: Record<string, unknown> })?.props?.['data-display-title'];
        return helpDisplay || title;
    }, [isMobileView]);

    return {
        isMobileView,
        updateMobileState,
        getDisplayTitle
    };
};

export default useResponsive;
