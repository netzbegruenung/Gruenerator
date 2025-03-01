import React from 'react';
import PropTypes from 'prop-types';
import Editor from '../../Editor';
import PlatformContainer from '../../PlatformContainer';
import HelpDisplay from '../../HelpDisplay';
import { isReactElement, hasPlatformHeaders } from '../utils/contentUtils';
import logger from '../../../../utils/logger';

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
  logger.info('ContentRenderer', 'Rendere Content', { 
    valueLength: value?.length || 0, 
    generatedContentType: typeof generatedContent,
    generatedContentLength: typeof generatedContent === 'string' ? generatedContent?.length || 0 : 'nicht-string',
    isEditing,
    usePlatformContainers
  });
  
  // Detailliertere Debug-Logs
  logger.debug('ContentRenderer', 'generatedContent Typ', typeof generatedContent);
  logger.debug('ContentRenderer', 'generatedContent Wert', 
    typeof generatedContent === 'string' ? 
    { length: generatedContent?.length || 0, preview: generatedContent?.substring(0, 50) } : 
    generatedContent);
  logger.debug('ContentRenderer', 'value Typ', typeof value);
  logger.debug('ContentRenderer', 'value Wert', 
    typeof value === 'string' ? 
    { length: value?.length || 0, preview: value?.substring(0, 50) } : 
    value);
  
  // Wenn kein Content vorhanden ist, zeige den HelpDisplay
  if (!value && !generatedContent) {
    logger.debug('ContentRenderer', 'Zeige HelpDisplay');
    return helpContent ? (
      <HelpDisplay
        content={helpContent.content}
        tips={helpContent.tips}
      />
    ) : null;
  }

  // Im Edit-Modus immer den Editor anzeigen
  if (isEditing) {
    logger.debug('ContentRenderer', 'Editor-Modus');
    return (
      <div className="generated-content-wrapper">
        <Editor value={value || ''} />
      </div>
    );
  }

  // Wenn generatedContent ein React-Element ist, direkt anzeigen
  if (isReactElement(generatedContent)) {
    logger.debug('ContentRenderer', 'Zeige React Element');
    return generatedContent;
  }

  // Platform Container nur anzeigen wenn aktiviert
  if (usePlatformContainers) {
    logger.debug('ContentRenderer', 'Prüfe Platform Container');
    // Prüfe value ODER generatedContent auf Plattform-Header
    const contentToCheck = value || generatedContent || '';
    const hasPlatforms = hasPlatformHeaders(contentToCheck);
    const hasMultiplePlatforms = contentToCheck.includes('---PLATFORM_BREAK---');
    
    logger.info('ContentRenderer', 'Content Check', { 
      hasPlatforms, 
      hasMultiplePlatforms, 
      hasSuchergebnis: contentToCheck.includes('SUCHERGEBNIS:'),
      hasAntrag: contentToCheck.includes('ANTRAG:'),
      contentLength: contentToCheck.length
    });

    if (hasPlatforms) {
      logger.debug('ContentRenderer', 'Zeige Platform Container');
      // Verwende generatedContent als Fallback, wenn value leer ist
      let displayContent = value || generatedContent;
      
      // Wenn wir mehrere Plattformen haben, stelle sicher, dass alle korrekt angezeigt werden
      if (hasMultiplePlatforms) {
        logger.debug('ContentRenderer', 'Inhalt enthält multiple Plattformen', {
          displayContentLength: displayContent?.length || 0
        });
        
        // Stelle sicher, dass wir den aktuellsten Inhalt verwenden
        if (generatedContent && generatedContent.length > displayContent.length) {
          logger.debug('ContentRenderer', 'Verwende generatedContent', {
            generatedContentLength: generatedContent.length
          });
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
  logger.debug('ContentRenderer', 'Standard Editor', {
    valueLength: (value || '').length
  });
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