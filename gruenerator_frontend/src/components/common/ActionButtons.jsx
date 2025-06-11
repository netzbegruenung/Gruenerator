import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { IoCopyOutline, IoCheckmarkOutline } from "react-icons/io5";
import { HiCog, HiOutlineUsers, HiSave } from "react-icons/hi";
import { copyFormattedContent } from '../utils/commonFunctions';
import ExportToDocument from './ExportToDocument';
import { useLazyAuth } from '../../hooks/useAuth';
import useGeneratedTextStore from '../../stores/generatedTextStore';

const ActionButtons = ({
  onEdit,
  isEditing,
  allowEditing = true,
  hideEditButton = false,
  className = 'display-actions',
  showExport = false,
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
  generatedContent
}) => {
  const { isAuthenticated, betaFeatures } = useLazyAuth();
  const { generatedText } = useGeneratedTextStore();
  const [copyIcon, setCopyIcon] = useState(<IoCopyOutline size={16} />);

  const hasDatabaseAccess = isAuthenticated && betaFeatures?.database === true;
  const hasCollabAccess = betaFeatures?.collab === true;

  const handleCopyToClipboard = () => {
    copyFormattedContent(
      generatedText,
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
      {generatedText && (
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
          {showExport && <ExportToDocument content={generatedText} />}
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
          {showCollab && hasCollabAccess && allowEditing && exportableContent && !isEditing && onCollab && (
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
  onEdit: PropTypes.func.isRequired,
  isEditing: PropTypes.bool.isRequired,
  allowEditing: PropTypes.bool,
  hideEditButton: PropTypes.bool,
  className: PropTypes.string,
  showExport: PropTypes.bool,
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
};

export default ActionButtons; 