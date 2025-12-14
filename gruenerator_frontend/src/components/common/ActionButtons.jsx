import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { IoCopyOutline, IoCheckmarkOutline } from "react-icons/io5";
import { HiCog, HiPencil, HiSave } from "react-icons/hi";
import '../../assets/styles/components/actions/action-buttons.css';
import { IoArrowUndoOutline, IoArrowRedoOutline } from "react-icons/io5";
import { getIcon } from '../../config/icons';
import { copyFormattedContent } from '../utils/commonFunctions';
import ExportDropdown from './ExportDropdown';
import { useLazyAuth } from '../../hooks/useAuth';
import { useBetaFeatures } from '../../hooks/useBetaFeatures';
import useGeneratedTextStore from '../../stores/core/generatedTextStore';
import { useProfileStore } from '../../stores/profileStore';
import { useSaveToLibrary } from '../../hooks/useSaveToLibrary';
import { hashContent } from '../../utils/contentHash';

const ActionButtons = ({
  onEdit,
  isEditing,
  allowEditing = true,
  hideEditButton = false,
  className = 'display-actions',
  showExport = false,
  showDownload = true,
  showExportDropdown = true,
  showRegenerate = false,
  showSave = false,
  showSaveToLibrary = true,
  showEditMode = false,
  showUndo = true,
  showRedo = true,
  onEditModeToggle,
  onRequestEdit,
  onReset,
  showReset = false,
  isEditModeActive = false,
  onRegenerate,
  onSave,
  onSaveToLibrary,
  onUndo,
  onRedo,
  regenerateLoading = false,
  saveLoading = false,
  saveToLibraryLoading = false,
  exportableContent,
  generatedPost,
  generatedContent,
  title,
  componentName = 'default',
  customExportOptions = [],
  hideDefaultExportOptions = false
}) => {
  const { isAuthenticated } = useLazyAuth();
  const { getBetaFeatureState } = useBetaFeatures();
  const { generatedText } = useGeneratedTextStore();
  const undo = useGeneratedTextStore(state => state.undo);
  const redo = useGeneratedTextStore(state => state.redo);
  const [copyIcon, setCopyIcon] = useState(<IoCopyOutline size={16} />);
  const [saveIcon, setSaveIcon] = useState(<HiSave size={16} />);

  const profile = useProfileStore((s) => s.profile);
  const { saveToLibrary: autoSaveToLibrary } = useSaveToLibrary();
  const exportedContentHashesRef = useRef(new Set());
  
  // Directly compute undo/redo availability from store without local state
  const canUndoState = useGeneratedTextStore(state => {
    const currentHistory = state.history[componentName];
    const currentIndex = state.historyIndex[componentName] ?? 0;
    return !!(currentHistory && currentHistory.length > 1 && currentIndex > 0);
  });
  const canRedoState = useGeneratedTextStore(state => {
    const currentHistory = state.history[componentName];
    const currentIndex = state.historyIndex[componentName] ?? 0;
    return !!(currentHistory && currentHistory.length > 1 && currentIndex < currentHistory.length - 1);
  });

  const hasDatabaseAccess = isAuthenticated && getBetaFeatureState('database');

  // Use generatedContent prop if available, fall back to store's generatedText
  const activeContent = generatedContent || generatedText;


  const handleCopyToClipboard = async () => {
    console.log('[ActionButtons] Copy button clicked');

    // First do the copy
    await copyFormattedContent(
      activeContent,
      () => {
        setCopyIcon(<IoCheckmarkOutline size={16} />);
        setTimeout(() => {
          setCopyIcon(<IoCopyOutline size={16} />);
        }, 2000);
      },
      () => {}
    );

    console.log('[ActionButtons] Auto-save check', {
      enabled: profile?.auto_save_on_export,
      authenticated: isAuthenticated,
      hasContent: !!activeContent
    });

    // Then check if auto-save is enabled
    if (!profile?.auto_save_on_export || !isAuthenticated || !activeContent) {
      return;
    }

    // Extract string content for hashing (handle both object and string content)
    const contentForHash = typeof activeContent === 'string'
      ? activeContent
      : (activeContent.content || activeContent.social?.content || JSON.stringify(activeContent));

    const contentHash = hashContent(contentForHash, title);
    if (exportedContentHashesRef.current.has(contentHash)) {
      console.log('[ActionButtons Auto-save] Skipping duplicate content');
      return;
    }

    try {
      const contentType = generatedText?.contentType || 'universal';
      console.log('[ActionButtons Auto-save] Saving to library', { contentType });

      // Use the same content extraction for saving
      await autoSaveToLibrary(
        contentForHash,
        title || 'Auto-gespeichert: Kopieren',
        contentType
      );

      exportedContentHashesRef.current.add(contentHash);
      console.log('[ActionButtons Auto-save] Successfully saved');
    } catch (error) {
      console.warn('[ActionButtons Auto-save] Failed:', error);
    }
  };

  const isMobileView = window.innerWidth <= 768;

  // Helper function to detect sharepic-only content
  const isSharepicOnlyContent = (content) => {
    if (!content || typeof content !== 'object') return false;
    
    // Check if we have sharepic but no social content
    const hasSharepic = content.sharepic && Object.keys(content.sharepic).length > 0;
    const hasSocialContent = content.social?.content || 
                            (content.content && !content.sharepic);
    
    return hasSharepic && !hasSocialContent;
  };

  // Determine if buttons should be hidden (sharepic-only content)
  const shouldHideButtons = isSharepicOnlyContent(activeContent);

  // Handle regular save with success indicator
  const handleSave = () => {
    if (onSave) {
      onSave();
      // Show checkmark after save attempt
      setTimeout(() => {
        setSaveIcon(<IoCheckmarkOutline size={16} />);
        setTimeout(() => {
          setSaveIcon(<HiSave size={16} />);
        }, 2000);
      }, 500);
    }
  };
  
  const handleUndo = () => {
    if (canUndoState) {
      if (onUndo) {
        onUndo();
      } else {
        undo(componentName);
      }
    }
  };
  
  const handleRedo = () => {
    if (canRedoState) {
      if (onRedo) {
        onRedo();
      } else {
        redo(componentName);
      }
    }
  };
  
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        handleUndo();
      } else if (((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Z') || 
                 ((e.ctrlKey || e.metaKey) && e.key === 'y')) {
        e.preventDefault();
        handleRedo();
      }
    };
    
    if (activeContent && !shouldHideButtons) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [canUndoState, canRedoState, activeContent, shouldHideButtons]);


  // Normal mode render
  return (
    <div className={className}>
      {activeContent && !shouldHideButtons && (
        <>
          <button
            onClick={handleCopyToClipboard}
            className="action-button"
            aria-label="Kopieren"
            {...(!isMobileView && {
              'data-tooltip-id': "action-tooltip",
              'data-tooltip-content': "Kopieren"
            })}
          >
            {copyIcon}
          </button>
          {showUndo && canUndoState && (
            <button
              onClick={handleUndo}
              className="action-button"
              aria-label="Rückgängig (Strg+Z)"
              {...(!isMobileView && {
                'data-tooltip-id': "action-tooltip",
                'data-tooltip-content': "Rückgängig (Strg+Z)"
              })}
            >
              <IoArrowUndoOutline size={16} />
            </button>
          )}
          {showRedo && canRedoState && (
            <button
              onClick={handleRedo}
              className="action-button"
              aria-label="Wiederholen (Strg+Y)"
              {...(!isMobileView && {
                'data-tooltip-id': "action-tooltip",
                'data-tooltip-content': "Wiederholen (Strg+Y)"
              })}
            >
              <IoArrowRedoOutline size={16} />
            </button>
          )}
          {(showExport || showDownload || showExportDropdown) && (
            <ExportDropdown
              content={activeContent}
              title={title}
              onSaveToLibrary={showSaveToLibrary && isAuthenticated ? onSaveToLibrary : null}
              saveToLibraryLoading={saveToLibraryLoading}
              customExportOptions={customExportOptions}
              hideDefaultOptions={hideDefaultExportOptions}
            />
          )}
          {showRegenerate && generatedPost && onRegenerate && (
            <button
              onClick={onRegenerate}
              className="action-button"
              aria-label="Regenerieren"
              disabled={regenerateLoading}
              {...(!isMobileView && {
                'data-tooltip-id': "action-tooltip",
                'data-tooltip-content': "Regenerieren"
              })}
            >
              <HiCog size={16} />
            </button>
          )}
          {showSave && hasDatabaseAccess && generatedContent && onSave && (
            <button
              onClick={handleSave}
              className="action-button"
              aria-label="In Supabase speichern"
              disabled={saveLoading}
              {...(!isMobileView && {
                'data-tooltip-id': "action-tooltip",
                'data-tooltip-content': "In Supabase speichern"
              })}
            >
              {saveIcon}
            </button>
          )}
          {showReset && onReset && (
            <button
              onClick={onReset}
              className="action-button"
              aria-label="Zurücksetzen"
              {...(!isMobileView && {
                'data-tooltip-id': "action-tooltip",
                'data-tooltip-content': "Zurücksetzen"
              })}
            >
              {getIcon('actions', 'refresh')({ size: 16 })}
            </button>
          )}
          {showEditMode && activeContent && (onRequestEdit || onEditModeToggle) && (
            <button
              onClick={() => {
                console.log('[ActionButtons] Edit button clicked', {
                  showEditMode,
                  isEditModeActive,
                  hasOnRequestEdit: !!onRequestEdit,
                  hasOnEditModeToggle: !!onEditModeToggle
                });
                if (onRequestEdit) {
                  onRequestEdit();
                } else if (onEditModeToggle) {
                  onEditModeToggle();
                }
              }}
              className={`action-button ${isEditModeActive ? 'active' : ''} hidden-mobile`}
              aria-label={isEditModeActive ? "Edit Mode schließen" : "Edit Mode umschalten"}
              {...(!isMobileView && {
                'data-tooltip-id': "action-tooltip",
                'data-tooltip-content': isEditModeActive ? "Schließen" : "Edit Mode"
              })}
            >
              {isEditModeActive ? getIcon('actions', 'close')({ size: 16 }) : <HiPencil size={16} />}
            </button>
          )}
        </>
      )}
    </div>
  );
};

ActionButtons.propTypes = {
  isEditing: PropTypes.bool, // Legacy - no longer used
  className: PropTypes.string,
  showExport: PropTypes.bool,
  showDownload: PropTypes.bool,
  showExportDropdown: PropTypes.bool,
  showRegenerate: PropTypes.bool,
  showSave: PropTypes.bool,
  showSaveToLibrary: PropTypes.bool,
  showEditMode: PropTypes.bool,
  showUndo: PropTypes.bool,
  showRedo: PropTypes.bool,
  onEditModeToggle: PropTypes.func,
  onRequestEdit: PropTypes.func,
  onReset: PropTypes.func,
  showReset: PropTypes.bool,
  isEditModeActive: PropTypes.bool,
  onRegenerate: PropTypes.func,
  onSave: PropTypes.func,
  onSaveToLibrary: PropTypes.func,
  onUndo: PropTypes.func,
  onRedo: PropTypes.func,
  regenerateLoading: PropTypes.bool,
  saveLoading: PropTypes.bool,
  saveToLibraryLoading: PropTypes.bool,
  exportableContent: PropTypes.string,
  generatedPost: PropTypes.string,
  generatedContent: PropTypes.any,
  title: PropTypes.string,
  componentName: PropTypes.string,
  customExportOptions: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    subtitle: PropTypes.string,
    icon: PropTypes.node,
    onClick: PropTypes.func.isRequired,
    disabled: PropTypes.bool
  })),
  hideDefaultExportOptions: PropTypes.bool
};

ActionButtons.defaultProps = {
  onEditModeToggle: null,
  onRequestEdit: null,
  onReset: null,
  showReset: false,
};

export default ActionButtons; 
