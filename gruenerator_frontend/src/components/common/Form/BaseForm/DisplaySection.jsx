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
import { useBetaFeatures } from '../../../../hooks/useBetaFeatures';
import useGeneratedTextStore from '../../../../stores/core/generatedTextStore';
import { useCollabPreload } from '../../../hooks/useCollabPreload';
import { useSaveToLibrary } from '../../../../hooks/useSaveToLibrary';
import { useFormStateSelector } from '../FormStateProvider';

/**
 * Komponente für den Anzeigebereich des Formulars
 * @param {Object} props - Komponenten-Props
 * @param {string} props.title - Titel des Formulars
 * @param {string} props.error - Fehlertext
 * @param {string} props.value - Aktueller Wert (aus BaseForm, potenziell für Editor)
 * @param {any} props.generatedContent - Generierter Inhalt (aus BaseForm)

 * @param {Object} props.helpContent - Hilfe-Inhalt
 * @param {string} props.generatedPost - Generierter Post
 * @param {Function} props.onGeneratePost - Funktion zum Generieren eines Posts
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
  useMarkdown = null,

  helpContent,
  generatedPost,
  onGeneratePost,
  getExportableContent,
  displayActions = null,
  onSave,
  saveLoading: propSaveLoading = false,
  componentName = 'default',
  onErrorDismiss
}, ref) => {
  const { user } = useLazyAuth(); // Keep for other auth functionality
  const { getBetaFeatureState } = useBetaFeatures();
  const storeGeneratedText = useGeneratedTextStore(state => state.getGeneratedText(componentName));
  const storeGeneratedTextMetadata = useGeneratedTextStore(state => state.getGeneratedTextMetadata(componentName));
  const streamingContent = useGeneratedTextStore(state => state.streamingContent);
  const isStreaming = useGeneratedTextStore(state => state.isStreaming);
  const isLoading = useGeneratedTextStore(state => state.isLoading);
  const [generatePostLoading, setGeneratePostLoading] = React.useState(false);
  const [collabLoading, setCollabLoading] = React.useState(false);
  const { saveToLibrary, isLoading: saveToLibraryLoading, error: saveToLibraryError, success: saveToLibrarySuccess } = useSaveToLibrary();
  
  // Store selectors for potential future use
  const storeSaveLoading = useFormStateSelector(state => state.saveLoading);
  
  // Use store state with prop fallback
  const saveLoading = storeSaveLoading || propSaveLoading;

  // Check if user has access to collab feature
  const hasCollabAccess = getBetaFeatureState('collab');

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
  // Priority: store content -> props fallback (no edit mode)
  let activeContent;
  if (storeGeneratedText) {
    activeContent = storeGeneratedText;
  } else {
    activeContent = generatedContent || value || '';
  }

  // Check if activeContent is mixed content (has both social and sharepic)
  const isMixedContent = activeContent && typeof activeContent === 'object' && 
    (activeContent.sharepic || activeContent.social);

  // For collab and export, use the social content string if it's mixed content
  const collabContent = isMixedContent 
    ? (activeContent.social?.content || activeContent.content || '')
    : activeContent;

  // Preload collab components but don't auto-create documents
  const preloadedDocId = useCollabPreload(collabContent, hasCollabAccess, true, user, title, 'text', false);

  const currentExportableContent = React.useMemo(() => {
    // For export, use the social content string if it's mixed content
    return isMixedContent 
      ? (activeContent.social?.content || activeContent.content || '')
      : activeContent;
  }, [activeContent, isMixedContent]);


  const handleOpenCollabEditor = async () => {
    if (!currentExportableContent) {
      return;
    }

    // Always create document on-demand when user clicks collab button
    setCollabLoading(true);
    const documentId = uuidv4();

    try {
      const response = await apiClient.post('/collab-editor/init-doc', { 
        documentId: documentId, 
        content: currentExportableContent,
        userId: user?.id || null,
        title: storeGeneratedTextMetadata?.title || title || 'Unbenanntes Dokument',
        documentType: 'text'
      });

      window.open(`/editor/collab/${documentId}`, '_blank');
    } catch (error) {
    } finally {
      setCollabLoading(false);
    }
  };

  const handleSaveToLibrary = React.useCallback(async () => {
    try {
      // Priority: metadata title > prop title > fallback
      const titleToUse = storeGeneratedTextMetadata?.title || title || 'Unbenannter Text';
      
      await saveToLibrary(currentExportableContent, titleToUse, storeGeneratedTextMetadata?.contentType || 'universal');
    } catch (error) {
      // Error handling is managed by the hook
    }
  }, [currentExportableContent, title, storeGeneratedTextMetadata, saveToLibrary]);

  return (
    <div className="display-container" id="display-section-container" ref={ref}>
      <div className="display-header">
          <ActionButtons 
            content={activeContent}
            isEditing={false}
            showExport={true}
            showDownload={true}
            showCollab={hasCollabAccess}
            showRegenerate={true}
            showSave={!!onSave}
            showSaveToLibrary={true}
            onCollab={handleOpenCollabEditor}
            onRegenerate={onGeneratePost}
            onSave={onSave}
            onSaveToLibrary={handleSaveToLibrary}
            collabLoading={collabLoading}
            regenerateLoading={generatePostLoading || isStreaming}
            saveLoading={saveLoading}
            saveToLibraryLoading={saveToLibraryLoading}
            exportableContent={currentExportableContent}
            generatedPost={generatedPost}
            generatedContent={activeContent}
            title={storeGeneratedTextMetadata?.title || title}
          />
      </div>
      {helpContent && (
        <div className="help-section">
          <HelpDisplay 
            content={helpContent.content}
            tips={helpContent.tips}
            hasGeneratedContent={!!activeContent}
          />
        </div>
      )}
      <div className="display-content">
        <ErrorDisplay error={error} onDismiss={onErrorDismiss} />
        <ContentRenderer
          value={activeContent}
          generatedContent={storeGeneratedText || generatedContent || activeContent}
          useMarkdown={useMarkdown}
          componentName={componentName}
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
  useMarkdown: PropTypes.bool,

  helpContent: PropTypes.shape({
    content: PropTypes.string,
    tips: PropTypes.arrayOf(PropTypes.string)
  }),
  generatedPost: PropTypes.string,
  onGeneratePost: PropTypes.func,
  getExportableContent: PropTypes.func.isRequired,
  displayActions: PropTypes.node,
  onSave: PropTypes.func,
  saveLoading: PropTypes.bool,
  componentName: PropTypes.string,
  onErrorDismiss: PropTypes.func
};

DisplaySection.defaultProps = {
  displayActions: null
};

DisplaySection.displayName = 'DisplaySection';

export default React.memo(DisplaySection); 