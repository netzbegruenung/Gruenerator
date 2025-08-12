import React, { useState, useRef } from 'react';
import PropTypes from 'prop-types';
import { HiGlobeAlt } from 'react-icons/hi';
import { RiSpyLine } from 'react-icons/ri';
import { FaPaperclip } from 'react-icons/fa6';
import AttachedFilesList from './AttachedFilesList';
import { validateFilesForPrivacyMode, getPDFPageCount } from '../../utils/fileAttachmentUtils';

const FeatureIcons = ({ 
  onWebSearchClick, 
  onPrivacyModeClick,
  onAttachmentClick,
  onRemoveFile,
  webSearchActive = false,
  privacyModeActive = false,
  attachedFiles = [],
  attachmentActive = false,
  className = '',
  tabIndex = {
    webSearch: 11,
    privacyMode: 12,
    attachment: 13
  },
  // Show a small info line when privacy mode is active and there is no generated content
  showPrivacyInfoLink = false,
  onPrivacyInfoClick,
  // Show a small info line when web search is active and there is no generated content
  showWebSearchInfoLink = false,
  onWebSearchInfoClick
}) => {
  const [clickedIcon, setClickedIcon] = useState(null);
  const [isValidatingFiles, setIsValidatingFiles] = useState(false);
  const [validationError, setValidationError] = useState(null);
  const [fileMetadata, setFileMetadata] = useState({});
  const fileInputRef = useRef(null);

  // Re-validate files when privacy mode changes
  const revalidateFilesForPrivacyMode = () => {
    if (!attachedFiles || attachedFiles.length === 0) return;
    
    const updatedMetadata = { ...fileMetadata };
    let hasConflicts = false;
    
    attachedFiles.forEach((file, index) => {
      if (updatedMetadata[index]) {
        const metadata = updatedMetadata[index];
        
        // Reset conflict state
        metadata.hasPrivacyConflict = false;
        metadata.conflictReason = null;
        
        if (privacyModeActive) {
          // Check PDF page limit
          if (file.type === 'application/pdf' && metadata.pageCount > 10) {
            metadata.hasPrivacyConflict = true;
            metadata.conflictReason = `PDF hat ${metadata.pageCount} Seiten, maximal 10 erlaubt`;
            hasConflicts = true;
          }
          // Check image restriction
          else if (file.type.startsWith('image/')) {
            metadata.hasPrivacyConflict = true;
            metadata.conflictReason = 'Bilder werden im Privacy Mode ignoriert';
            hasConflicts = true;
          }
        }
      }
    });
    
    setFileMetadata(updatedMetadata);
    
    // Clear validation error if no conflicts, or set if conflicts exist
    if (hasConflicts) {
      const conflictFiles = Object.entries(updatedMetadata)
        .filter(([, meta]) => meta.hasPrivacyConflict)
        .map(([index, meta]) => `${attachedFiles[index].name}: ${meta.conflictReason}`)
        .join(', ');
      setValidationError(`Privacy Mode Konflikt: ${conflictFiles}`);
    } else {
      setValidationError(null);
    }
  };

  // Re-validate when privacy mode changes
  React.useEffect(() => {
    revalidateFilesForPrivacyMode();
  }, [privacyModeActive]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleIconClick = (type, callback) => {
    setClickedIcon(type);
    if (callback) {
      callback();
    }
    // Reset animation after completion
    setTimeout(() => setClickedIcon(null), 300);
  };

  const handleAttachmentClick = () => {
    handleIconClick('attachment');
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (event) => {
    const files = Array.from(event.target.files);
    
    if (files.length === 0) {
      return;
    }

    // Clear previous validation error and metadata
    setValidationError(null);
    setFileMetadata({});
    setIsValidatingFiles(true);
    
    try {
      // Build metadata for all files
      const metadata = {};
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        metadata[i] = {
          pageCount: null,
          hasPrivacyConflict: false,
          conflictReason: null
        };
        
        // Count PDF pages
        if (file.type === 'application/pdf') {
          try {
            const pageCount = await getPDFPageCount(file);
            metadata[i].pageCount = pageCount;
            
            // Check privacy mode conflict
            if (privacyModeActive && pageCount > 10) {
              metadata[i].hasPrivacyConflict = true;
              metadata[i].conflictReason = `PDF hat ${pageCount} Seiten, maximal 10 erlaubt`;
            }
          } catch (error) {
            console.warn(`Failed to count pages for ${file.name}:`, error);
            metadata[i].pageCount = null; // Will show (?S.)
          }
        } 
        // Check image privacy conflict
        else if (file.type.startsWith('image/') && privacyModeActive) {
          metadata[i].hasPrivacyConflict = true;
          metadata[i].conflictReason = 'Bilder werden im Privacy Mode ignoriert';
        }
      }
      
      // Store metadata
      setFileMetadata(metadata);
      
      // Check for privacy mode violations
      if (privacyModeActive) {
        const hasConflicts = Object.values(metadata).some(m => m.hasPrivacyConflict);
        if (hasConflicts) {
          const conflictFiles = Object.entries(metadata)
            .filter(([, meta]) => meta.hasPrivacyConflict)
            .map(([index, meta]) => `${files[index].name}: ${meta.conflictReason}`)
            .join(', ');
          
          setValidationError(`Privacy Mode Konflikt: ${conflictFiles}`);
          // Reset file input
          event.target.value = '';
          setIsValidatingFiles(false);
          return;
        }
      }
      
      // Files are valid, proceed with attachment
      if (onAttachmentClick) {
        onAttachmentClick(files);
      }
      
    } catch (error) {
      console.error('File processing error:', error);
      setValidationError('Fehler bei der Dateiverarbeitung. Bitte versuchen Sie es erneut.');
      event.target.value = '';
    } finally {
      setIsValidatingFiles(false);
      // Reset file input to allow selecting the same file again
      event.target.value = '';
    }
  };


  return (
    <div className={`feature-icons ${className}`}>
      <div className="feature-icons-row">
        <button
          className={`feature-icon-button ${webSearchActive ? 'active' : ''} ${clickedIcon === 'webSearch' ? 'clicked' : ''}`}
          onClick={() => handleIconClick('webSearch', onWebSearchClick)}
          aria-label="Websuche aktivieren"
          tabIndex={tabIndex.webSearch}
          type="button"
        >
          <HiGlobeAlt className="feature-icon" />
          <span className="feature-icons-button__label">Websuche</span>
        </button>
        
        <button
          className={`feature-icon-button ${privacyModeActive ? 'active' : ''} ${clickedIcon === 'privacy' ? 'clicked' : ''}`}
          onClick={() => handleIconClick('privacy', onPrivacyModeClick)}
          aria-label="Privacy Mode aktivieren"
          tabIndex={tabIndex.privacyMode}
          type="button"
        >
          <RiSpyLine className="feature-icon" />
          <span className="feature-icons-button__label">Privacy Mode</span>
        </button>
        
        <button
          className={`feature-icon-button ${attachmentActive || attachedFiles.length > 0 ? 'active' : ''} ${clickedIcon === 'attachment' ? 'clicked' : ''}`}
          onClick={handleAttachmentClick}
          aria-label="Anhang hinzufügen"
          tabIndex={tabIndex.attachment}
          type="button"
          disabled={isValidatingFiles}
        >
          <FaPaperclip className="feature-icon" />
          <span className="feature-icons-button__label">
            {isValidatingFiles ? 'Prüfe Dateien...' : 'Anhang hinzufügen'}
          </span>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            onChange={handleFileSelect}
            className="attachment-file-input"
            aria-hidden="true"
            disabled={isValidatingFiles}
          />
        </button>
      </div>
      {showWebSearchInfoLink && (
        <div className="feature-icons__websearch-info" role="status" aria-live="polite">
          <span>Websuche aktiviert. </span>
          <button
            type="button"
            className="feature-icons__info-link"
            onClick={onWebSearchInfoClick}
          >
            Was ist das?
          </button>
        </div>
      )}
      {showPrivacyInfoLink && (
        <div className="feature-icons__privacy-info" role="status" aria-live="polite">
          <span>Privacy-Mode aktiviert. </span>
          <button
            type="button"
            className="feature-icons__info-link"
            onClick={onPrivacyInfoClick}
          >
            Was ist das?
          </button>
        </div>
      )}
      
      {/* Privacy mode file validation error */}
      {validationError && (
        <div className="feature-icons__validation-error" role="alert" aria-live="assertive">
          <span style={{ color: 'var(--error-color, #e74c3c)', fontSize: '0.9em' }}>
            ⚠️ {validationError}
          </span>
        </div>
      )}
      
      <AttachedFilesList 
        files={attachedFiles}
        onRemoveFile={onRemoveFile}
        fileMetadata={fileMetadata}
        privacyModeActive={privacyModeActive}
      />
      {/* Debug info - remove after testing */}
      {console.log('[FeatureIcons] attachedFiles:', attachedFiles)}
    </div>
  );
};

FeatureIcons.propTypes = {
  onWebSearchClick: PropTypes.func.isRequired,
  onPrivacyModeClick: PropTypes.func.isRequired,
  onAttachmentClick: PropTypes.func,
  onRemoveFile: PropTypes.func,
  webSearchActive: PropTypes.bool,
  privacyModeActive: PropTypes.bool,
  attachedFiles: PropTypes.array,
  attachmentActive: PropTypes.bool,
  className: PropTypes.string,
  tabIndex: PropTypes.shape({
    webSearch: PropTypes.number,
    privacyMode: PropTypes.number,
    attachment: PropTypes.number
  }),
  showPrivacyInfoLink: PropTypes.bool,
  onPrivacyInfoClick: PropTypes.func,
  showWebSearchInfoLink: PropTypes.bool,
  onWebSearchInfoClick: PropTypes.func
};

export default FeatureIcons;