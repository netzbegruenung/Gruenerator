import { useState, useRef } from 'react';

/**
 * Hook für die Verwaltung des Formularzustands
 * @param {Object} initialState - Initialer Zustand des Formulars
 * @param {boolean} disableAutoCollapse - Deaktiviert das automatische Einklappen des Formulars
 * @returns {Object} Formularzustand und Funktionen
 */
export const useFormState = (initialState = {}, disableAutoCollapse = false) => {
  const [formData, setFormData] = useState(initialState);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [formErrors, setFormErrors] = useState({});
  const [isFormVisible, setIsFormVisible] = useState(true);
  const [isMultiPlatform, setIsMultiPlatform] = useState(false);
  const [contentChanged, setContentChanged] = useState(false);
  const userToggledForm = useRef(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prevState => ({
      ...prevState,
      [name]: value
    }));
  };

  const toggleForm = () => {
    userToggledForm.current = true; // Markiere, dass der Benutzer den Toggle-Button verwendet hat
    setIsFormVisible(prev => !prev);
  };

  // Funktion zur Prüfung auf Multi-Plattform-Inhalte
  const checkMultiPlatform = (value, usePlatformContainers) => {
    if (value && usePlatformContainers) {
      const platformCount = (value.match(/(TWITTER|FACEBOOK|INSTAGRAM|LINKEDIN|ACTIONIDEAS|INSTAGRAM REEL|PRESSEMITTEILUNG|SUCHANFRAGE|SUCHERGEBNIS):/g) || []).length;
      setIsMultiPlatform(platformCount >= 2);
      
      // Auto-Collapse nur beim ersten Erkennen mehrerer Plattformen
      // und nicht nach einem expliziten Einblenden durch den Benutzer
      if (platformCount >= 2 && isFormVisible && !disableAutoCollapse && !userToggledForm.current) {
        setIsFormVisible(false);
      }
    }
  };

  // Funktion zum Markieren von Inhaltsänderungen
  const markContentChanged = (hasContent) => {
    if (hasContent) {
      setContentChanged(true);
    }
  };

  // Funktion zum Zurücksetzen von Inhaltsänderungen
  const resetContentChanged = () => {
    setContentChanged(false);
  };

  return {
    formData,
    setFormData,
    loading,
    setLoading,
    success,
    setSuccess,
    error,
    setError,
    formErrors,
    setFormErrors,
    handleChange,
    isFormVisible,
    setIsFormVisible,
    isMultiPlatform,
    setIsMultiPlatform,
    toggleForm,
    contentChanged,
    setContentChanged,
    checkMultiPlatform,
    markContentChanged,
    resetContentChanged
  };
};

export default useFormState; 