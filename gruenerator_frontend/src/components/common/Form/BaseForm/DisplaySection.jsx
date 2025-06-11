import React, { forwardRef } from 'react';
import PropTypes from 'prop-types';
import { v4 as uuidv4 } from 'uuid';
import ActionButtons from '../../ActionButtons';
import SubmitButton from '../../SubmitButton';
import { HiCog, HiOutlineUsers } from "react-icons/hi";
import { BUTTON_LABELS, ARIA_LABELS } from '../constants';
import ContentRenderer from './ContentRenderer';
import ErrorDisplay from './ErrorDisplay';
import HelpDisplay from '../../HelpDisplay';
import apiClient from '../../../utils/apiClient';
import { useLazyAuth } from '../../../../hooks/useAuth';
import useGeneratedTextStore from '../../../../stores/generatedTextStore';
import { useCollabPreload } from '../../../hooks/useCollabPreload';

/**
 * Komponente für den Anzeigebereich des Formulars
 * @param {Object} props - Komponenten-Props
 * @param {string} props.title - Titel des Formulars
 * @param {string} props.error - Fehlertext
 * @param {string} props.value - Aktueller Wert (aus BaseForm, potenziell für Editor)
 * @param {any} props.generatedContent - Generierter Inhalt (aus BaseForm)
 * @param {boolean} props.isEditing - Bearbeitungsmodus aktiv
 * @param {boolean} props.allowEditing - Bearbeitung erlaubt
 * @param {boolean} props.hideEditButton - Edit-Button ausblenden
 * @param {boolean} props.usePlatformContainers - Plattform-Container verwenden
 * @param {Object} props.helpContent - Hilfe-Inhalt
 * @param {string} props.generatedPost - Generierter Post
 * @param {Function} props.onGeneratePost - Funktion zum Generieren eines Posts
 * @param {Function} props.handleToggleEditMode - Funktion zum Umschalten des Bearbeitungsmodus
 * @param {Function} props.getExportableContent - Funktion zum Abrufen des exportierbaren Inhalts (wird hier ggf. modifiziert)
 * @param {React.ReactNode} [props.displayActions=null] - Zusätzliche Aktionen, die unter dem Inhalt angezeigt werden sollen
 * @param {Function} props.onSave - Funktion zum Speichern des Inhalts
 * @param {boolean} props.saveLoading - Gibt an, ob der Speichervorgang läuft
 * @returns {JSX.Element} Display-Sektion
 */
const DisplaySection = forwardRef(({
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
  displayActions = null,
  onSave,
  saveLoading = false
}, ref) => {
  const { betaFeatures } = useLazyAuth();
  const storeGeneratedText = useGeneratedTextStore(state => state.generatedText);
  const streamingContent = useGeneratedTextStore(state => state.streamingContent);
  const isStreaming = useGeneratedTextStore(state => state.isStreaming);
  const isLoading = useGeneratedTextStore(state => state.isLoading);
  const [generatePostLoading, setGeneratePostLoading] = React.useState(false);
  const [collabLoading, setCollabLoading] = React.useState(false);

  // Check if user has access to collab feature
  const hasCollabAccess = betaFeatures?.collab === true;

  const handleGeneratePost = React.useCallback(async () => {
    if (!onGeneratePost) return;
    
    setGeneratePostLoading(true);
    try {
      await onGeneratePost();
    } catch (error) {
    } finally {
      setGeneratePostLoading(false);
    }
  }, [onGeneratePost]);

  // Determine the content to display and use for actions
  // Priority: store content -> editing value -> props fallback
  let activeContent;
  if (storeGeneratedText) {
    activeContent = storeGeneratedText;
  } else if (isEditing && value) {
    activeContent = value;
  } else {
    activeContent = generatedContent || value || '';
  }

  // Preload collab document
  const preloadedDocId = useCollabPreload(activeContent, hasCollabAccess, true);

  const currentExportableContent = React.useMemo(() => {
    return activeContent;
  }, [activeContent]);

  // Debug logging
  React.useEffect(() => {
    console.log('[DisplaySection] Content update:', {
      storeGeneratedTextLength: storeGeneratedText?.length,
      activeContentLength: activeContent?.length,
    });
  }, [storeGeneratedText, activeContent]);

  const handleOpenCollabEditor = async () => {
    if (!currentExportableContent) {
      console.warn("Kein Inhalt zum kollaborativen Bearbeiten vorhanden.");
      return;
    }
    // If a document was preloaded, use its ID.
    if (preloadedDocId) {
      console.log(`[DisplaySection] Opening preloaded collaborative document: ${preloadedDocId}`);
      window.open(`/editor/collab/${preloadedDocId}`, '_blank');
      return; // Early exit
    }

    // Fallback if preloading hasn't happened or failed
    setCollabLoading(true);
    const documentId = uuidv4();
    console.log("[DisplaySection] No preloaded doc found. Generated Document ID:", documentId);
    console.log("[DisplaySection] Content to send:", currentExportableContent.substring(0,100) + "...");

    try {
      const response = await apiClient.post('/collab-editor/init-doc', { 
        documentId: documentId, 
        content: currentExportableContent 
      });

      console.log("[DisplaySection] Kollaboratives Dokument erfolgreich initialisiert über apiClient.");
      window.open(`/editor/collab/${documentId}`, '_blank');
    } catch (error) {
      console.error("[DisplaySection] Fehler beim Initialisieren des kollaborativen Dokuments (via apiClient):", error.message || error);
    } finally {
      setCollabLoading(false);
    }
  };

  return (
    <div className="display-container" id="display-section-container" ref={ref}>
      <div className="display-header">
          <ActionButtons 
            content={activeContent}
            onEdit={handleToggleEditMode}
            isEditing={isEditing}
            allowEditing={allowEditing}
            hideEditButton={hideEditButton}
            showExport={true}
            showCollab={hasCollabAccess}
            showRegenerate={true}
            showSave={!!onSave}
            onCollab={handleOpenCollabEditor}
            onRegenerate={onGeneratePost}
            onSave={onSave}
            collabLoading={collabLoading}
            regenerateLoading={generatePostLoading || isStreaming}
            saveLoading={saveLoading}
            exportableContent={currentExportableContent}
            generatedPost={generatedPost}
            generatedContent={activeContent}
          />
      </div>
      {helpContent && (
        <div className="help-section">
          <HelpDisplay 
            content={helpContent.content}
            tips={helpContent.tips}
          />
        </div>
      )}
      <div className="display-content" style={{ fontSize: '16px' }}>
        <ErrorDisplay error={error} />
        <ContentRenderer
          value={isEditing ? value : activeContent}
          generatedContent={activeContent}
          isEditing={isEditing}
          usePlatformContainers={usePlatformContainers}
          helpContent={helpContent}
        />
      </div>
      {/* Render additional display actions if provided */}
      {displayActions && (
        <div className="display-action-section">
          {displayActions}
        </div>
      )}
    </div>
  );
});

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
  displayActions: PropTypes.node,
  onSave: PropTypes.func,
  saveLoading: PropTypes.bool
};

DisplaySection.defaultProps = {
  allowEditing: true,
  hideEditButton: false,
  usePlatformContainers: false,
  displayActions: null
};

DisplaySection.displayName = 'DisplaySection';

export default React.memo(DisplaySection); 