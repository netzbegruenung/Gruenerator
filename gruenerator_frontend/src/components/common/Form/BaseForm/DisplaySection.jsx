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
  onErrorDismiss,
  onEditModeToggle,
  isEditModeActive = false,
  showEditModeToggle = true,
  onRequestEdit,
  showUndoControls = true,
  showRedoControls = true,
  renderActions = null,
  showResetButton = false,
  onReset,
  renderEmptyState = null,
}, ref) => {
  const { user } = useLazyAuth(); // Keep for other auth functionality
  const { getBetaFeatureState } = useBetaFeatures();
  const storeGeneratedText = useGeneratedTextStore(state => state.generatedTexts[componentName] || '');
  const storeGeneratedTextMetadata = useGeneratedTextStore(state => state.getGeneratedTextMetadata(componentName));
  const streamingContent = useGeneratedTextStore(state => state.streamingContent);
  const isStreaming = useGeneratedTextStore(state => state.isStreaming);
  const isLoading = useGeneratedTextStore(state => state.isLoading);
  const [generatePostLoading, setGeneratePostLoading] = React.useState(false);
  const { saveToLibrary, isLoading: saveToLibraryLoading, error: saveToLibraryError, success: saveToLibrarySuccess } = useSaveToLibrary();
  
  // Store selectors for potential future use
  const storeSaveLoading = useFormStateSelector(state => state.saveLoading);
  
  // Use store state with prop fallback
  const saveLoading = storeSaveLoading || propSaveLoading;

  // Determine the content to display and use for actions
  // Priority: store content -> props fallback (no edit mode)
  const activeContent = React.useMemo(() => {
    if (storeGeneratedText) {
      return storeGeneratedText;
    } else {
      return generatedContent || value || '';
    }
  }, [storeGeneratedText, generatedContent, value]);

  const hasRenderableContent = React.useMemo(() => {
    if (!activeContent) return false;
    if (typeof activeContent === 'string') {
      return activeContent.trim().length > 0;
    }
    if (typeof activeContent === 'object') {
      if (activeContent.sharepic) return true;
      if (typeof activeContent.content === 'string' && activeContent.content.trim().length > 0) return true;
      if (typeof activeContent.text === 'string' && activeContent.text.trim().length > 0) return true;
      if (activeContent.social?.content && typeof activeContent.social.content === 'string' && activeContent.social.content.trim().length > 0) return true;
    }
    return false;
  }, [activeContent]);

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

  // Check if activeContent is mixed content (has both social and sharepic)
  const isMixedContent = activeContent && typeof activeContent === 'object' && 
    (activeContent.sharepic || activeContent.social);


  const currentExportableContent = React.useMemo(() => {
    // For export, use the social content string if it's mixed content
    return isMixedContent 
      ? (activeContent.social?.content || activeContent.content || '')
      : activeContent;
  }, [activeContent, isMixedContent]);



  const handleSaveToLibrary = React.useCallback(async () => {
    try {
      // Priority: metadata title > prop title > fallback
      const titleToUse = storeGeneratedTextMetadata?.title || title || 'Unbenannter Text';
      
      await saveToLibrary(currentExportableContent, titleToUse, storeGeneratedTextMetadata?.contentType || 'universal');
    } catch (error) {
      // Error handling is managed by the hook
    }
  }, [currentExportableContent, title, storeGeneratedTextMetadata, saveToLibrary]);


  const actionButtons = (
    <ActionButtons 
      content={activeContent}
      isEditing={false}
      showExport={true}
      showDownload={true}
      showRegenerate={true}
      showSave={!!onSave}
      showSaveToLibrary={true}
      showEditMode={showEditModeToggle}
      showUndo={showUndoControls}
      showRedo={showRedoControls}
      onRegenerate={onGeneratePost}
      onSave={onSave}
      onSaveToLibrary={handleSaveToLibrary}
      onEditModeToggle={onEditModeToggle}
      isEditModeActive={isEditModeActive}
      regenerateLoading={generatePostLoading || isStreaming}
      saveLoading={saveLoading}
      saveToLibraryLoading={saveToLibraryLoading}
      exportableContent={currentExportableContent}
      generatedPost={generatedPost}
      generatedContent={activeContent}
      title={storeGeneratedTextMetadata?.title || title}
      componentName={componentName}
      onRequestEdit={onRequestEdit}
      showReset={showResetButton}
      onReset={onReset}
    />
  );

  const actionsNode = hasRenderableContent
    ? (renderActions
        ? renderActions(actionButtons)
        : (
            <div className="display-header">
              {actionButtons}
            </div>
          ))
    : null;

  return (
    <div className="display-container" id="display-section-container" ref={ref}>
      {actionsNode}
      {!hasRenderableContent && helpContent && (
        <div className="help-section">
          <HelpDisplay
            content={helpContent.content}
            tips={helpContent.tips}
            hasGeneratedContent={!!activeContent}
          />
        </div>
      )}
      <div className="display-content">
        {hasRenderableContent ? (
          <>
            <ErrorDisplay error={error} onDismiss={onErrorDismiss} />
            <ContentRenderer
              value={activeContent}
              generatedContent={storeGeneratedText || generatedContent || activeContent}
              useMarkdown={useMarkdown}
              componentName={componentName}
              helpContent={helpContent}
            />
          </>
        ) : (
          renderEmptyState ? renderEmptyState() : null
        )}
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
  onErrorDismiss: PropTypes.func,
  onEditModeToggle: PropTypes.func,
  isEditModeActive: PropTypes.bool,
  showEditModeToggle: PropTypes.bool,
  onRequestEdit: PropTypes.func,
  showUndoControls: PropTypes.bool,
  showRedoControls: PropTypes.bool,
  renderActions: PropTypes.func,
  showResetButton: PropTypes.bool,
  onReset: PropTypes.func,
  renderEmptyState: PropTypes.func,
};

DisplaySection.defaultProps = {
  displayActions: null,
  onRequestEdit: null,
  showUndoControls: true,
  showRedoControls: true,
  renderActions: null,
  showResetButton: false,
  onReset: undefined,
  renderEmptyState: null
};

DisplaySection.displayName = 'DisplaySection';

export default React.memo(DisplaySection); 
