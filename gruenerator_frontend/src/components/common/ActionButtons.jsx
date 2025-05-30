import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { IoCopyOutline, IoPencil, IoCheckmarkOutline } from "react-icons/io5";
import { FaRegEye, FaRegEyeSlash } from "react-icons/fa6";
import { HiCog, HiOutlineUsers, HiSave } from "react-icons/hi";
import { copyFormattedContent } from '../utils/commonFunctions';
import ExportToDocument from './ExportToDocument';
import { useSupabaseAuth } from '../../context/SupabaseAuthContext';
import EditorMaintenancePopup from '../Popups/popup_editor_maintenance';

const ActionButtons = ({
  content,
  onEdit,
  isEditing,
  allowEditing = true,
  hideEditButton = false,
  className = 'display-actions',
  showExport = false,
  onToggleFocusMode,
  isFocusMode = false,
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
  const { betaFeatures } = useSupabaseAuth();
  const [copyIcon, setCopyIcon] = useState(<IoCopyOutline size={16} />);
  const [showMaintenancePopup, setShowMaintenancePopup] = useState(false);

  // Check if user has access to database feature for save functionality
  const hasDatabaseAccess = betaFeatures?.database === true;

  const handleCopyToClipboard = () => {
    copyFormattedContent(
      content,
      () => {
        setCopyIcon(<IoCheckmarkOutline size={16} />);
        setTimeout(() => {
          setCopyIcon(<IoCopyOutline size={16} />);
        }, 2000);
      },
      () => {}
    );
  };

  const handleEditClick = () => {
    setShowMaintenancePopup(true);
  };

  const handleCloseMaintenancePopup = () => {
    setShowMaintenancePopup(false);
  };

  const isMobileView = window.innerWidth <= 768;

  return (
    <>
      <div className={className}>
        {content && (
          <>
            {!isFocusMode && (
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
                {showExport && <ExportToDocument content={content} />}
                {allowEditing && !hideEditButton && (
                  <button
                    onClick={handleEditClick}
                    className="action-button action-button-disabled"
                    aria-label="Editor wird überarbeitet"
                    {...(!isMobileView && {
                      'data-tooltip-id': "action-tooltip",
                      'data-tooltip-content': "Editor wird überarbeitet"
                    })}
                  >
                    <IoPencil size={16} />
                  </button>
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
                {showCollab && allowEditing && exportableContent && !isEditing && onCollab && (
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
            <button
              onClick={onToggleFocusMode}
              className="action-button"
              aria-label={isFocusMode ? "Fokus-Modus beenden" : "Fokus-Modus"}
              {...(!isMobileView && {
                'data-tooltip-id': "action-tooltip",
                'data-tooltip-content': isFocusMode ? "Fokus-Modus beenden" : "Fokus-Modus"
              })}
            >
              {isFocusMode ? <FaRegEyeSlash size={16} /> : <FaRegEye size={16} />}
            </button>
          </>
        )}
      </div>
      
      <EditorMaintenancePopup 
        isVisible={showMaintenancePopup}
        onClose={handleCloseMaintenancePopup}
      />
    </>
  );
};

ActionButtons.propTypes = {
  content: PropTypes.string.isRequired,
  onEdit: PropTypes.func.isRequired,
  isEditing: PropTypes.bool.isRequired,
  allowEditing: PropTypes.bool,
  hideEditButton: PropTypes.bool,
  className: PropTypes.string,
  showExport: PropTypes.bool,
  onToggleFocusMode: PropTypes.func.isRequired,
  isFocusMode: PropTypes.bool,
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