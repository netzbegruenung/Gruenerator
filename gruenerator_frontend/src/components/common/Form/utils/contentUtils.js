import React from 'react';

/**
 * Extrahiert den exportierbaren Inhalt aus verschiedenen Inhaltsformaten
 * @param {string|Object} generatedContent - Generierter Inhalt
 * @param {string} value - Aktueller Wert
 * @returns {string} Exportierbarer Inhalt
 */
export const getExportableContent = (generatedContent, value) => {
  if (generatedContent) {
    return typeof generatedContent === 'string' ? generatedContent : generatedContent?.content || '';
  }
  return value || '';
};

/**
 * Generiert CSS-Klassennamen für den Basis-Container
 * @param {Object} params - Parameter für die Klassennamen
 * @returns {string} Generierte Klassennamen
 */
export const getBaseContainerClasses = ({
  isEditing,
  title,
  generatedContent,
  isMultiPlatform,
  isFormVisible
}) => {
  const classes = [
    'base-container',
    isEditing ? 'editing-mode' : '',
    title === "Grünerator Antragscheck" ? 'antragsversteher-base' : '',
    generatedContent && (
      typeof generatedContent === 'string' ? generatedContent.length > 0 : generatedContent?.content?.length > 0
    ) ? 'has-generated-content' : '',
    isMultiPlatform ? 'multi-platform' : '',
    !isFormVisible ? 'form-hidden' : ''
  ];

  return classes.filter(Boolean).join(' ');
};

/**
 * Prüft, ob der Inhalt ein React-Element ist
 * @param {any} content - Zu prüfender Inhalt
 * @returns {boolean} True, wenn der Inhalt ein React-Element ist
 */
export const isReactElement = (content) => {
  return React.isValidElement(content);
}; 