import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { IoCopyOutline, IoCheckmarkOutline } from "react-icons/io5";
import { HiCog, HiOutlineUsers, HiSave } from "react-icons/hi";
import { copyFormattedContent } from '../utils/commonFunctions';
import ExportToDocument from './ExportToDocument';
import PDFExport from './PDFExport';
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
  showPDF = true,
  showCollab = false,
  showRegenerate = false,
  showSave = false,
  onCollab,
  onRegenerate,
  onSave,
  collabLoading = false,
  regenerateLoading = false,
  saveLoading = false,
  exportableContent,
  generatedPost,
  generatedContent,
  title
}) => {
  const { isAuthenticated } = useLazyAuth();
  const { getBetaFeatureState } = useBetaFeatures();
  const { generatedText } = useGeneratedTextStore();
  const [copyIcon, setCopyIcon] = useState(<IoCopyOutline size={16} />);

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

  return (
    <div className={className}>
      {activeContent && (
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
          {showPDF && <PDFExport content={activeContent} title={title} />}
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
              onClick={onSave}
              className="action-button"
              aria-label="In Supabase speichern"
              disabled={saveLoading}
              {...(!isMobileView && {
                'data-tooltip-id': "action-tooltip",
                'data-tooltip-content': "In Supabase speichern"
              })}
            >
              <HiSave size={16} />
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
              <HiOutlineUsers size={16} />
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
  showPDF: PropTypes.bool,
  showCollab: PropTypes.bool,
  showRegenerate: PropTypes.bool,
  showSave: PropTypes.bool,
  onCollab: PropTypes.func,
  onRegenerate: PropTypes.func,
  onSave: PropTypes.func,
  collabLoading: PropTypes.bool,
  regenerateLoading: PropTypes.bool,
  saveLoading: PropTypes.bool,
  exportableContent: PropTypes.string,
  generatedPost: PropTypes.string,
  generatedContent: PropTypes.any,
  title: PropTypes.string,
};

export default ActionButtons; 