import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { IoCopyOutline, IoCheckmarkOutline, IoDownloadOutline } from "react-icons/io5";
import { HiCog } from "react-icons/hi";
import { FaRegFilePdf } from "react-icons/fa6";
import { RiSaveLine } from "react-icons/ri";
import { MdEdit } from "react-icons/md";
import { copyFormattedContent } from '../utils/commonFunctions';
import ExportToDocument from './ExportToDocument';
import DownloadExport from './DownloadExport';
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
  showCollab = false,
  showRegenerate = false,
  showSave = false,
  showSaveToLibrary = true,
  onCollab,
  onRegenerate,
  onSave,
  onSaveToLibrary,
  collabLoading = false,
  regenerateLoading = false,
  saveLoading = false,
  saveToLibraryLoading = false,
  exportableContent,
  generatedPost,
  generatedContent,
  title
}) => {
  const { isAuthenticated } = useLazyAuth();
  const { getBetaFeatureState } = useBetaFeatures();
  const { generatedText } = useGeneratedTextStore();
  const [copyIcon, setCopyIcon] = useState(<IoCopyOutline size={16} />);
  const [saveToLibraryIcon, setSaveToLibraryIcon] = useState(<RiSaveLine size={16} />);
  const [saveIcon, setSaveIcon] = useState(<RiSaveLine size={16} />);

  const hasDatabaseAccess = isAuthenticated && getBetaFeatureState('database');
  const hasCollabAccess = getBetaFeatureState('collab');

  // Use generatedContent prop if available, fall back to store's generatedText
  const activeContent = generatedContent || generatedText;

  // Debug logging for collab button visibility
  React.useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[ActionButtons] Collab button debug:', {
        showCollab,
        hasCollabAccess,
        activeContentLength: activeContent?.length,
        onCollab: !!onCollab,
        finalCondition: showCollab && hasCollabAccess && activeContent && onCollab
      });
    }
  }, [showCollab, hasCollabAccess, activeContent, onCollab]);

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

  // Handle save to library with success indicator
  const handleSaveToLibrary = () => {
    if (onSaveToLibrary) {
      onSaveToLibrary();
      // Show checkmark after save attempt (we assume success for UI feedback)
      setTimeout(() => {
        setSaveToLibraryIcon(<IoCheckmarkOutline size={16} />);
        setTimeout(() => {
          setSaveToLibraryIcon(<RiSaveLine size={16} />);
        }, 2000);
      }, 500);
    }
  };

  // Handle regular save with success indicator
  const handleSave = () => {
    if (onSave) {
      onSave();
      // Show checkmark after save attempt
      setTimeout(() => {
        setSaveIcon(<IoCheckmarkOutline size={16} />);
        setTimeout(() => {
          setSaveIcon(<RiSaveLine size={16} />);
        }, 2000);
      }, 500);
    }
  };

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
          {showExport && <ExportToDocument content={activeContent} />}
          {showDownload && <DownloadExport content={activeContent} title={title} />}
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
          {showSaveToLibrary && isAuthenticated && activeContent && onSaveToLibrary && (
            <button
              onClick={handleSaveToLibrary}
              className="action-button"
              aria-label="Speichern"
              disabled={saveToLibraryLoading}
              {...(!isMobileView && {
                'data-tooltip-id': "action-tooltip",
                'data-tooltip-content': "Speichern"
              })}
            >
              {saveToLibraryIcon}
            </button>
          )}
          {showCollab && hasCollabAccess && activeContent && onCollab && (
            <button
              onClick={onCollab}
              className="action-button"
              aria-label="Kollaborativ bearbeiten"
              disabled={collabLoading}
              {...(!isMobileView && {
                'data-tooltip-id': "action-tooltip",
                'data-tooltip-content': "Kollaborativ bearbeiten"
              })}
            >
              <MdEdit size={16} />
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
  showCollab: PropTypes.bool,
  showRegenerate: PropTypes.bool,
  showSave: PropTypes.bool,
  showSaveToLibrary: PropTypes.bool,
  onCollab: PropTypes.func,
  onRegenerate: PropTypes.func,
  onSave: PropTypes.func,
  onSaveToLibrary: PropTypes.func,
  collabLoading: PropTypes.bool,
  regenerateLoading: PropTypes.bool,
  saveLoading: PropTypes.bool,
  saveToLibraryLoading: PropTypes.bool,
  exportableContent: PropTypes.string,
  generatedPost: PropTypes.string,
  generatedContent: PropTypes.any,
  title: PropTypes.string,
};

export default ActionButtons; 