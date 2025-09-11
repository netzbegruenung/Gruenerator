import React, { useState, useRef } from 'react';
import '../../assets/styles/components/ui/FeatureIcons.css';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { HiGlobeAlt, HiEye, HiPaperClip, HiAdjustments, HiLightningBolt } from 'react-icons/hi';
import AttachedFilesList from './AttachedFilesList';
import { validateFilesForPrivacyMode, getPDFPageCount } from '../../utils/fileAttachmentUtils';

const FeatureIcons = ({ 
  onWebSearchClick, 
  onPrivacyModeClick,
  onProModeClick,
  onBalancedModeClick,
  onAttachmentClick,
  onRemoveFile,
  webSearchActive = false,
  privacyModeActive = false,
  proModeActive = false,
  attachedFiles = [],
  attachmentActive = false,
  className = '',
  tabIndex = {
    webSearch: 11,
    balancedMode: 12,
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
  const [showBalancedDropdown, setShowBalancedDropdown] = useState(false);
  const balancedContainerRef = useRef(null);
  const hoverTimeoutRef = useRef(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const dropdownRef = useRef(null);

  const updateDropdownPosition = () => {
    const triggerEl = balancedContainerRef.current;
    if (!triggerEl) return;
    const triggerRect = triggerEl.getBoundingClientRect();
    const centerX = triggerRect.left + triggerRect.width / 2;
    let dropdownWidth = 0;
    if (dropdownRef.current) {
      const dr = dropdownRef.current.getBoundingClientRect();
      dropdownWidth = dr.width;
    }
    // Calculate left so that dropdown is slightly right of perfect center (approx 25% of width)
    const offsetRatio = 0.33; // shift dropdown right by ~33% of its width
    let left = centerX - dropdownWidth * (0.5 - offsetRatio);
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    // Clamp within viewport with small margin
    const margin = 8;
    if (left < margin) left = margin;
    if (left + dropdownWidth > viewportWidth - margin) left = Math.max(margin, viewportWidth - margin - dropdownWidth);
    setDropdownPosition({ top: triggerRect.bottom + 6, left });
  };

  React.useEffect(() => {
    if (!showBalancedDropdown) return;
    updateDropdownPosition();
    const onScrollOrResize = () => updateDropdownPosition();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize, true);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize, true);
    };
  }, [showBalancedDropdown]);
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

  const handleIconClick = (event, type, callback) => {
    event.preventDefault();
    event.stopPropagation();
    setClickedIcon(type);
    if (callback) {
      callback();
    }
    // Reset animation after completion
    setTimeout(() => setClickedIcon(null), 300);
  };

  const handleAttachmentClick = (event) => {
    handleIconClick(event, 'attachment');
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
          onClick={(event) => handleIconClick(event, 'webSearch', onWebSearchClick)}
          aria-label="Websuche aktivieren"
          tabIndex={tabIndex.webSearch}
          type="button"
        >
          <HiGlobeAlt className="feature-icons__icon" />
          <span className="feature-icons-button__label">Websuche</span>
        </button>
        
        <div 
          className="balanced-mode-container"
          ref={balancedContainerRef}
          onMouseEnter={() => {
            if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
            setShowBalancedDropdown(true);
          }}
          onMouseLeave={() => {
            if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
            hoverTimeoutRef.current = setTimeout(() => setShowBalancedDropdown(false), 120);
          }}
        >
          <button
            className={`feature-icon-button ${(privacyModeActive || proModeActive) ? 'active' : ''} ${clickedIcon === 'balanced' ? 'clicked' : ''}`}
            aria-label={privacyModeActive ? 'Privacy' : (proModeActive ? 'Pro' : 'Ausbalanciert')}
            tabIndex={tabIndex.balancedMode}
            type="button"
            onClick={(event) => handleIconClick(event, 'balanced', () => {
              // Cycle modes on click: Balance -> Privacy -> Pro -> Balance
              if (!privacyModeActive && !proModeActive) {
                // Balanced -> Privacy
                if (onPrivacyModeClick) onPrivacyModeClick();
              } else if (privacyModeActive) {
                // Privacy -> Pro
                if (onProModeClick) onProModeClick();
                if (onPrivacyModeClick) onPrivacyModeClick();
              } else if (proModeActive) {
                // Pro -> Balance
                if (onProModeClick) onProModeClick();
                if (onBalancedModeClick) onBalancedModeClick();
              }
            })}
          >
            {(privacyModeActive && <HiEye className="feature-icons__icon" />) ||
             (proModeActive && <HiLightningBolt className="feature-icons__icon" />) ||
             (<HiAdjustments className="feature-icons__icon" />)}
            <span className="feature-icons-button__label">
              {privacyModeActive ? 'Privacy' : (proModeActive ? 'Pro' : 'Ausbalanciert')}
            </span>
          </button>
          
          {showBalancedDropdown && createPortal(
            <div
              className="balanced-dropdown-portal-wrapper"
              style={{ top: dropdownPosition.top, left: dropdownPosition.left, zIndex: 2000, position: 'fixed' }}
              onMouseEnter={() => {
                if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                setShowBalancedDropdown(true);
              }}
              onMouseLeave={() => setShowBalancedDropdown(false)}
            >
              <div className="balanced-dropdown balanced-dropdown--portal" ref={dropdownRef}>
              <button
                className={`balanced-dropdown-item`}
                onClick={(event) => handleIconClick(event, 'balanced', () => {
                  // Ensure balanced mode clears other modes
                  if (privacyModeActive && onPrivacyModeClick) onPrivacyModeClick();
                  if (proModeActive && onProModeClick) onProModeClick();
                  if (onBalancedModeClick) onBalancedModeClick();
                })}
                type="button"
              >
                <HiAdjustments className="balanced-dropdown-icon" />
                <div className="balanced-dropdown-content">
                  <span className="balanced-dropdown-title">Ausbalanciert</span>
                  <span className="balanced-dropdown-desc">Ideal für die meisten Aufgaben. Läuft auf EU-Servern.</span>
                </div>
              </button>
              
              <button
                className={`balanced-dropdown-item`}
                onClick={(event) => handleIconClick(event, 'privacy', () => {
                  // Ensure mutual exclusivity: turn off Pro if active
                  if (proModeActive && onProModeClick) onProModeClick();
                  if (onPrivacyModeClick) onPrivacyModeClick();
                })}
                type="button"
              >
                <HiEye className="balanced-dropdown-icon" />
                <div className="balanced-dropdown-content">
                  <span className="balanced-dropdown-title">Privacy</span>
                  <span className="balanced-dropdown-desc">Nutzt ein selbstgehostetes Sprachmodell bei der Netzbegrünung (deutsche Server).</span>
                </div>
              </button>
              
              <button
                className={`balanced-dropdown-item`}
                onClick={(event) => handleIconClick(event, 'pro', () => {
                  // Ensure mutual exclusivity: turn off Privacy if active
                  if (privacyModeActive && onPrivacyModeClick) onPrivacyModeClick();
                  if (onProModeClick) onProModeClick();
                })}
                type="button"
              >
                <HiLightningBolt className="balanced-dropdown-icon" />
                <div className="balanced-dropdown-content">
                  <span className="balanced-dropdown-title">Pro</span>
                  <span className="balanced-dropdown-desc">Nutzt ein fortgeschrittenes Sprachmodell – ideal für komplexere Texte.</span>
                </div>
              </button>
              </div>
            </div>,
            document.body
          )}
        </div>
        
        <button
          className={`feature-icon-button ${attachmentActive || attachedFiles.length > 0 ? 'active' : ''} ${clickedIcon === 'attachment' ? 'clicked' : ''}`}
          onClick={handleAttachmentClick}
          aria-label="Anhang hinzufügen"
          tabIndex={tabIndex.attachment}
          type="button"
          disabled={isValidatingFiles}
        >
          <HiPaperClip className="feature-icons__icon" />
          <span className="feature-icons-button__label">
            {isValidatingFiles ? 'Prüfe Dateien...' : 'Anhang hinzufügen'}
          </span>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            onChange={handleFileSelect}
            onClick={(e) => e.stopPropagation()}
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
    </div>
  );
};

FeatureIcons.propTypes = {
  onWebSearchClick: PropTypes.func.isRequired,
  onPrivacyModeClick: PropTypes.func.isRequired,
  onProModeClick: PropTypes.func.isRequired,
  onBalancedModeClick: PropTypes.func.isRequired,
  onAttachmentClick: PropTypes.func,
  onRemoveFile: PropTypes.func,
  webSearchActive: PropTypes.bool,
  privacyModeActive: PropTypes.bool,
  proModeActive: PropTypes.bool,
  attachedFiles: PropTypes.array,
  attachmentActive: PropTypes.bool,
  className: PropTypes.string,
  tabIndex: PropTypes.shape({
    webSearch: PropTypes.number,
    balancedMode: PropTypes.number,
    attachment: PropTypes.number
  }),
  showPrivacyInfoLink: PropTypes.bool,
  onPrivacyInfoClick: PropTypes.func,
  showWebSearchInfoLink: PropTypes.bool,
  onWebSearchInfoClick: PropTypes.func
};

export default FeatureIcons;
