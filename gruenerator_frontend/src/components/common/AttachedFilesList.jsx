import React from 'react';
import PropTypes from 'prop-types';
import { HiX } from 'react-icons/hi';
import { truncateWithSuffix } from './editor/textTruncation';

const AttachedFilesList = ({ files = [], onRemoveFile, className = '', fileMetadata = {}, privacyModeActive = false }) => {
  if (!files || files.length === 0) {
    return null;
  }

  const handleRemoveFile = (index, event) => {
    event.stopPropagation();
    if (onRemoveFile) {
      onRemoveFile(index);
    }
  };


  return (
    <div className={`attached-files-list ${className}`}>
      {files.map((file, index) => {
        const metadata = fileMetadata[index] || {};
        const hasWarning = privacyModeActive && metadata.hasPrivacyConflict;
        
        // Build display name with page count
        // Calculate page count suffix first
        let pageSuffix = '';
        if (file.type === 'application/pdf' && metadata.pageCount !== undefined) {
          const pageCountText = metadata.pageCount !== null ? `${metadata.pageCount}S.` : '?S.';
          pageSuffix = ` (${pageCountText})`;
        }
        
        // Truncate filename accounting for the suffix length (max total length: 50 chars)
        const truncatedName = truncateWithSuffix(file.name, 50, pageSuffix);
        const displayName = truncatedName + pageSuffix;
        
        // Build tooltip text
        const tooltipText = hasWarning && metadata.conflictReason 
          ? `${file.name} - ${metadata.conflictReason}`
          : file.name;
        
        return (
          <div 
            key={`${file.name}-${index}`} 
            className={`file-tag ${hasWarning ? 'file-tag--warning' : ''}`}
            title={tooltipText}
          >
            <span className="file-name">
              {displayName}
            </span>
            <button
              type="button"
              className="file-remove-btn"
              onClick={(e) => handleRemoveFile(index, e)}
              aria-label={`${file.name} entfernen`}
            >
              <HiX />
            </button>
          </div>
        );
      })}
    </div>
  );
};

AttachedFilesList.propTypes = {
  files: PropTypes.array,
  onRemoveFile: PropTypes.func,
  className: PropTypes.string,
  fileMetadata: PropTypes.object,
  privacyModeActive: PropTypes.bool
};

export default AttachedFilesList;