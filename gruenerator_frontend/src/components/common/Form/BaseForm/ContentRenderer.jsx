import React from 'react';
import PropTypes from 'prop-types';
import Editor from '../../editor/Editor';
import HelpDisplay from '../../HelpDisplay';
import { isReactElement } from '../utils/contentUtils';

/**
 * Komponente zur Darstellung verschiedener Inhaltstypen
 * @param {Object} props - Komponenten-Props
 * @param {string} props.value - Aktueller Wert
 * @param {any} props.generatedContent - Generierter Inhalt
 * @param {boolean} props.isEditing - Bearbeitungsmodus aktiv
 * @param {Object} props.helpContent - Hilfe-Inhalt
 * @returns {JSX.Element} Gerenderte Inhalte
 */
const ContentRenderer = ({
  value,
  generatedContent,
  isEditing,
  helpContent
}) => {
  console.log('[ContentRenderer] Rendering with:', { 
    valueLength: value?.length, 
    hasGeneratedContent: !!generatedContent, 
    isEditing
  });

  // Wenn kein Content vorhanden ist, zeige den HelpDisplay
  if (!value && !generatedContent) {
    console.log('[ContentRenderer] No content available, showing HelpDisplay');
    return helpContent ? (
      <HelpDisplay
        content={helpContent.content}
        tips={helpContent.tips}
      />
    ) : null;
  }

  // Wenn generatedContent ein React-Element ist, direkt anzeigen
  if (isReactElement(generatedContent)) {
    console.log('[ContentRenderer] Showing React element directly');
    return generatedContent;
  }

  // Standard Editor anzeigen (read-only wenn nicht im Bearbeitungsmodus)
  console.log('[ContentRenderer] Showing Editor with value length:', value?.length);
  return (
    <div className="generated-content-wrapper">
      <Editor value={value || ''} />
    </div>
  );
};

ContentRenderer.propTypes = {
  value: PropTypes.string,
  generatedContent: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.object,
    PropTypes.element
  ]),
  isEditing: PropTypes.bool.isRequired,
  helpContent: PropTypes.shape({
    content: PropTypes.string,
    tips: PropTypes.arrayOf(PropTypes.string)
  })
};

export default ContentRenderer; 