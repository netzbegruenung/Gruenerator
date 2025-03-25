import React from 'react';
import PropTypes from 'prop-types';
import ActionButtons from '../../ActionButtons';
import SubmitButton from '../../SubmitButton';
import { HiCog } from "react-icons/hi";
import { BUTTON_LABELS, ARIA_LABELS } from '../constants';
import ContentRenderer from './ContentRenderer';
import ErrorDisplay from './ErrorDisplay';

/**
 * Komponente für den Anzeigebereich des Formulars
 * @param {Object} props - Komponenten-Props
 * @param {string} props.title - Titel des Formulars
 * @param {string} props.error - Fehlertext
 * @param {string} props.value - Aktueller Wert
 * @param {any} props.generatedContent - Generierter Inhalt
 * @param {boolean} props.isEditing - Bearbeitungsmodus aktiv
 * @param {boolean} props.allowEditing - Bearbeitung erlaubt
 * @param {boolean} props.hideEditButton - Edit-Button ausblenden
 * @param {boolean} props.usePlatformContainers - Plattform-Container verwenden
 * @param {Object} props.helpContent - Hilfe-Inhalt
 * @param {string} props.generatedPost - Generierter Post
 * @param {Function} props.onGeneratePost - Funktion zum Generieren eines Posts
 * @param {Function} props.handleToggleEditMode - Funktion zum Umschalten des Bearbeitungsmodus
 * @param {Function} props.getExportableContent - Funktion zum Abrufen des exportierbaren Inhalts
 * @param {Function} props.onToggleFocusMode - Funktion zum Umschalten des Fokus-Modus
 * @param {boolean} props.isFocusMode - Gibt an, ob der Fokus-Modus aktiv ist
 * @returns {JSX.Element} Display-Sektion
 */
const DisplaySection = ({
  title,
  error,
  value,
  generatedContent,
  isEditing,
  allowEditing,
  hideEditButton,
  usePlatformContainers,
  helpContent,
  generatedPost,
  onGeneratePost,
  handleToggleEditMode,
  getExportableContent,
  onToggleFocusMode,
  isFocusMode
}) => {
  const [generatePostLoading, setGeneratePostLoading] = React.useState(false);

  const handleGeneratePost = React.useCallback(async () => {
    if (!onGeneratePost) return;
    
    setGeneratePostLoading(true);
    try {
      await onGeneratePost();
    } catch (error) {
      // Fehlerbehandlung ohne Logger
    } finally {
      setGeneratePostLoading(false);
    }
  }, [onGeneratePost]);

  const exportableContent = React.useMemo(() => {
    return getExportableContent(generatedContent, value);
  }, [getExportableContent, generatedContent, value]);

  return (
    <div className="display-container" id="display-section-container">
      <div className="display-header">
        <h3>{title}</h3>
          <ActionButtons 
          content={value}
            onEdit={handleToggleEditMode}
            isEditing={isEditing}
            allowEditing={allowEditing}
            hideEditButton={hideEditButton}
            showExport={true}
          onToggleFocusMode={onToggleFocusMode}
          isFocusMode={isFocusMode}
          />
      </div>
      <div className="display-content" style={{ fontSize: '16px' }}>
        <ErrorDisplay error={error} />
        <ContentRenderer
          value={value}
          generatedContent={generatedContent}
          isEditing={isEditing}
          usePlatformContainers={usePlatformContainers}
          helpContent={helpContent}
        />
      </div>
      {generatedPost && (
        <div className="generated-post-container">
          <p>{generatedPost}</p>
          <div className="button-container">
            <SubmitButton
              onClick={handleGeneratePost}
              loading={generatePostLoading}
              text={BUTTON_LABELS.REGENERATE_TEXT}
              icon={<HiCog />}
              className="generate-post-button"
              ariaLabel={ARIA_LABELS.REGENERATE_TEXT}
            />
          </div>
        </div>
      )}
    </div>
  );
};

DisplaySection.propTypes = {
  title: PropTypes.string.isRequired,
  error: PropTypes.string,
  value: PropTypes.string,
  generatedContent: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.shape({
      content: PropTypes.string
    })
  ]),
  isEditing: PropTypes.bool.isRequired,
  allowEditing: PropTypes.bool,
  hideEditButton: PropTypes.bool,
  usePlatformContainers: PropTypes.bool,
  helpContent: PropTypes.shape({
    content: PropTypes.string,
    tips: PropTypes.arrayOf(PropTypes.string)
  }),
  generatedPost: PropTypes.string,
  onGeneratePost: PropTypes.func,
  handleToggleEditMode: PropTypes.func.isRequired,
  getExportableContent: PropTypes.func.isRequired,
  onToggleFocusMode: PropTypes.func.isRequired,
  isFocusMode: PropTypes.bool
};

DisplaySection.defaultProps = {
  allowEditing: true,
  hideEditButton: false,
  usePlatformContainers: false
};

export default DisplaySection; 