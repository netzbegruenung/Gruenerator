import { useState, useEffect } from 'react';
import { toggleHeaderFooter } from '../../../utils/uiHelpers';

/**
 * Hook für die Verwaltung des Fokus-Modus
 * @returns {Object} Fokus-Modus Funktionen und State
 */
const useFocusMode = () => {
    const [isFocusMode, setIsFocusMode] = useState(false);

    const handleToggleFocusMode = () => {
        setIsFocusMode(!isFocusMode);
    };
    
    // Verwende die ausgelagerte Funktion
    useEffect(() => {
        toggleHeaderFooter(isFocusMode);
        
        // Cleanup-Funktion
        return () => {
            toggleHeaderFooter(false);
        };
    }, [isFocusMode]);

    return {
        isFocusMode,
        handleToggleFocusMode
    };
};

export default useFocusMode; 