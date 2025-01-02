import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { IoCopyOutline, IoPencil, IoCheckmarkOutline } from "react-icons/io5";
import { copyFormattedContent } from '../utils/commonFunctions';
import ExportToDocument from './ExportToDocument';

const ActionButtons = ({
  content,
  onEdit,
  isEditing,
  allowEditing = true,
  hideEditButton = false,
  className = 'display-actions',
  showExport = false,
}) => {
  const [copyIcon, setCopyIcon] = useState(<IoCopyOutline size={16} />);

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

  const isMobileView = window.innerWidth <= 768;

  return (
    <div className={className}>
      {content && (
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
              onClick={onEdit}
              className="action-button"
              aria-label={isEditing ? "Bearbeiten beenden" : "Bearbeiten"}
              {...(!isMobileView && {
                'data-tooltip-id': "action-tooltip",
                'data-tooltip-content': isEditing ? "Bearbeiten beenden" : "Bearbeiten"
              })}
            >
              <IoPencil size={16} />
            </button>
          )}
        </>
      )}
    </div>
  );
};

ActionButtons.propTypes = {
  content: PropTypes.string,
  onEdit: PropTypes.func.isRequired,
  isEditing: PropTypes.bool.isRequired,
  allowEditing: PropTypes.bool,
  hideEditButton: PropTypes.bool,
  className: PropTypes.string,
  showExport: PropTypes.bool,
};

export default ActionButtons; 