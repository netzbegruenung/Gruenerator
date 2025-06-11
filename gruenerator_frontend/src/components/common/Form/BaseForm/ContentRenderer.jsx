import React from 'react';
import PropTypes from 'prop-types';
import { isReactElement } from '../utils/contentUtils';

/**
 * Komponente zur Darstellung verschiedener Inhaltstypen
 * @param {Object} props - Komponenten-Props
 * @param {string} props.value - Aktueller Wert
 * @param {any} props.generatedContent - Generierter Inhalt
 * @param {boolean} props.isEditing - Bearbeitungsmodus aktiv
 * @param {boolean} props.usePlatformContainers - Plattform-Container verwenden
 * @param {Object} props.helpContent - Hilfe-Inhalt (nicht mehr verwendet)
 * @returns {JSX.Element} Gerenderte Inhalte
 */
const ContentRenderer = ({
  value,
  generatedContent,
  isEditing,
  usePlatformContainers,
  helpContent
}) => {
  const contentToRender = value || generatedContent || '';
  
  // Wenn kein Content vorhanden ist, zeige nichts an (HelpDisplay wird in DisplaySection gehandhabt)
  if (!contentToRender) {
    return null;
  }

  // Wenn generatedContent ein React-Element ist, direkt anzeigen
  if (isReactElement(generatedContent)) {
    return generatedContent;
  }

  // Einfache HTML-Darstellung
  return (
    <div className="generated-content-wrapper">
      <div 
        className="content-display" 
        style={{ whiteSpace: 'pre-wrap' }}
        dangerouslySetInnerHTML={{ __html: contentToRender }}
      />
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
  usePlatformContainers: PropTypes.bool,
  helpContent: PropTypes.shape({
    content: PropTypes.string,
    tips: PropTypes.arrayOf(PropTypes.string)
  })
};

export default ContentRenderer; 