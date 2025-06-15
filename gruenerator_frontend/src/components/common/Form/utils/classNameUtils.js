/**
 * Generiert CSS-Klassennamen für den Basis-Container
 * @param {Object} params - Parameter für die Klassennamen
 * @returns {string} Generierte Klassennamen
 */
export const getBaseContainerClasses = ({
  title,
  generatedContent,
  isFormVisible
}) => {
  const classes = [
    'base-container',
    title === "Grünerator Antragscheck" ? 'antragsversteher-base' : '',
    generatedContent && (
      typeof generatedContent === 'string' ? generatedContent.length > 0 : generatedContent?.content?.length > 0
    ) ? 'has-generated-content' : ''
  ];

  return classes.filter(Boolean).join(' ');
};

/**
 * Generiert CSS-Klassennamen für den Formular-Container
 * @param {boolean} isFormVisible - Ist das Formular sichtbar
 * @returns {string} Generierte Klassennamen
 */
export const getFormContainerClasses = (isFormVisible) => {
  return `form-container ${isFormVisible ? 'visible' : ''}`;
};

/**
 * Generiert CSS-Klassennamen für den Formular-Inhalt
 * @param {boolean} hasFormErrors - Hat das Formular Fehler
 * @returns {string} Generierte Klassennamen
 */
export const getFormContentClasses = (hasFormErrors) => {
  return `form-content ${hasFormErrors ? 'has-errors' : ''}`;
};

/**
 * Generiert CSS-Klassennamen für den Button-Container
 * @param {boolean} showBackButton - Soll der Zurück-Button angezeigt werden
 * @returns {string} Generierte Klassennamen
 */
export const getButtonContainerClasses = (showBackButton) => {
  return `button-container ${showBackButton ? 'form-buttons' : ''}`;
};

/**
 * Generiert CSS-Klassennamen für den Submit-Button
 * @param {boolean} showBackButton - Soll der Zurück-Button angezeigt werden
 * @returns {string} Generierte Klassennamen
 */
export const getSubmitButtonClasses = (showBackButton) => {
  return `submit-button form-button ${showBackButton ? 'with-back-button' : ''}`;
}; 