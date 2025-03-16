import React from 'react';
import PropTypes from 'prop-types';
import Editor from '../../editor/Editor';
import PlatformContainer from '../../PlatformContainer';
import HelpDisplay from '../../HelpDisplay';
import { isReactElement, hasPlatformHeaders } from '../utils/contentUtils';

/**
 * Komponente zur Darstellung verschiedener Inhaltstypen
 * @param {Object} props - Komponenten-Props
 * @param {string} props.value - Aktueller Wert
 * @param {any} props.generatedContent - Generierter Inhalt
 * @param {boolean} props.isEditing - Bearbeitungsmodus aktiv
 * @param {boolean} props.usePlatformContainers - Plattform-Container verwenden
 * @param {Object} props.helpContent - Hilfe-Inhalt
 * @returns {JSX.Element} Gerenderte Inhalte
 */
const ContentRenderer = ({
  value,
  generatedContent,
  isEditing,
  usePlatformContainers,
  helpContent
}) => {
  // Wenn kein Content vorhanden ist, zeige den HelpDisplay
  if (!value && !generatedContent) {
    return helpContent ? (
      <HelpDisplay
        content={helpContent.content}
        tips={helpContent.tips}
      />
    ) : null;
  }

  // Im Edit-Modus immer den Editor anzeigen
  if (isEditing) {
    return (
      <div className="generated-content-wrapper">
        <Editor value={value || ''} />
      </div>
    );
  }

  // Wenn generatedContent ein React-Element ist, direkt anzeigen
  if (isReactElement(generatedContent)) {
    return generatedContent;
  }

  // Platform Container nur anzeigen wenn aktiviert
  if (usePlatformContainers) {
    // Prüfe value ODER generatedContent auf Plattform-Header
    const contentToCheck = value || generatedContent || '';
    const hasPlatforms = hasPlatformHeaders(contentToCheck);
    const hasMultiplePlatforms = contentToCheck.includes('---PLATFORM_BREAK---');
    
    if (hasPlatforms) {
      // Verwende generatedContent als Fallback, wenn value leer ist
      let displayContent = value || generatedContent;
      
      // Wenn wir mehrere Plattformen haben, stelle sicher, dass alle korrekt angezeigt werden
      if (hasMultiplePlatforms) {
        // Stelle sicher, dass wir den aktuellsten Inhalt verwenden
        if (generatedContent && generatedContent.length > displayContent.length) {
          displayContent = generatedContent;
        }
      }
      
      return (
        <div className="generated-content-wrapper">
          <PlatformContainer content={displayContent} key={Date.now()} />
        </div>
      );
    }
  }

  // Standard Editor anzeigen
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
  usePlatformContainers: PropTypes.bool,
  helpContent: PropTypes.shape({
    content: PropTypes.string,
    tips: PropTypes.arrayOf(PropTypes.string)
  })
};

ContentRenderer.defaultProps = {
  usePlatformContainers: false
};

export default ContentRenderer; 