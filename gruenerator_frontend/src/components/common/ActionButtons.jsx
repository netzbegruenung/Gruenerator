import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { IoCopyOutline, IoCheckmarkOutline } from "react-icons/io5";
import { HiCog, HiPencil, HiSave } from "react-icons/hi";
import { IoArrowUndoOutline, IoArrowRedoOutline } from "react-icons/io5";
import { copyFormattedContent } from '../utils/commonFunctions';
import ExportDropdown from './ExportDropdown';
import { useLazyAuth } from '../../hooks/useAuth';
import { useBetaFeatures } from '../../hooks/useBetaFeatures';
import useGeneratedTextStore from '../../stores/core/generatedTextStore';

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
  componentName = 'default'
}) => {
  const { isAuthenticated } = useLazyAuth();
  const { getBetaFeatureState } = useBetaFeatures();
  const { generatedText } = useGeneratedTextStore();
  const undo = useGeneratedTextStore(state => state.undo);
  const redo = useGeneratedTextStore(state => state.redo);
  const canUndo = useGeneratedTextStore(state => state.canUndo);
  const canRedo = useGeneratedTextStore(state => state.canRedo);
  const [copyIcon, setCopyIcon] = useState(<IoCopyOutline size={16} />);
  const [saveIcon, setSaveIcon] = useState(<HiSave size={16} />);
  
  // Track undo/redo availability
  const [canUndoState, setCanUndoState] = useState(false);
  const [canRedoState, setCanRedoState] = useState(false);
  
  // Update undo/redo state when component or history changes
  useEffect(() => {
    setCanUndoState(canUndo(componentName));
    setCanRedoState(canRedo(componentName));
  }, [canUndo, canRedo, componentName, generatedContent]);

  const hasDatabaseAccess = isAuthenticated && getBetaFeatureState('database');

  // Use generatedContent prop if available, fall back to store's generatedText
  const activeContent = generatedContent || generatedText;


  const handleCopyToClipboard = () => {
    copyFormattedContent(
      activeContent,
      () => {
        setCopyIcon(<IoCheckmarkOutline size={16} />);
        setTimeout(() => {
          setCopyIcon(<IoCopyOutline size={16} />);
        }, 2000);
      },
      () => {}
    );
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
          {showUndo && (
            <button
              onClick={handleUndo}
              className="action-button"
              aria-label="Rückgängig (Strg+Z)"
              disabled={!canUndoState}
              {...(!isMobileView && {
                'data-tooltip-id': "action-tooltip",
                'data-tooltip-content': "Rückgängig (Strg+Z)"
              })}
            >
              <IoArrowUndoOutline size={16} />
            </button>
          )}
          {showRedo && (
            <button
              onClick={handleRedo}
              className="action-button"
              aria-label="Wiederholen (Strg+Y)"
              disabled={!canRedoState}
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
          {showEditMode && activeContent && onEditModeToggle && (
            <button
              onClick={onEditModeToggle}
              className={`action-button ${isEditModeActive ? 'active' : ''}`}
              aria-label="Edit Mode umschalten"
              {...(!isMobileView && {
                'data-tooltip-id': "action-tooltip",
                'data-tooltip-content': "Edit Mode"
              })}
            >
              <HiPencil size={16} />
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
};

export default ActionButtons; 