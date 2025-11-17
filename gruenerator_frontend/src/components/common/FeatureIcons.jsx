import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import '../../assets/styles/components/ui/FeatureIcons.css';
import PropTypes from 'prop-types';
import { HiGlobeAlt, HiEye, HiPaperClip, HiAdjustments, HiLightningBolt, HiPlusCircle, HiClipboardList, HiUpload, HiChatAlt2, HiDocument, HiX } from 'react-icons/hi';
import AttachedFilesList from './AttachedFilesList';
import ContentSelector from './ContentSelector';
import { getPDFPageCount } from '../../utils/fileAttachmentUtils';
import { useGeneratorSelectionStore } from '../../stores/core/generatorSelectionStore';
import { useInstructionsStatusForType } from '../../features/auth/hooks/useInstructionsStatus';
import { useAuth } from '../../hooks/useAuth';
import DropdownPortal from './DropdownPortal';
import LoginPage from '../../features/auth/pages/LoginPage';

/**
 * ValidationBanner - Shows file upload limits only when Privacy Mode is active
 */
const ValidationBanner = ({ usePrivacyMode }) => {
  // Only show banner when Privacy Mode is active (has restrictions)
  if (!usePrivacyMode) {
    return null;
  }

  return (
    <div className="content-dropdown__validation-banner content-dropdown__validation-banner--privacy">
      <HiEye className="validation-banner__icon" />
      <div className="validation-banner__content">
        <span className="validation-banner__title">Privacy Mode aktiv</span>
        <span className="validation-banner__text">PDFs max. 10 Seiten, keine Bilder</span>
      </div>
    </div>
  );
};

ValidationBanner.propTypes = {
  usePrivacyMode: PropTypes.bool
};

const FeatureIcons = ({
  // Feature toggle props removed - now using store
  onBalancedModeClick, // Keep for backward compatibility
  onAttachmentClick,
  onRemoveFile,
  onAnweisungenClick,
  onInteractiveModeClick,
  anweisungenActive = false,
  interactiveModeActive = false,
  attachedFiles = [],
  attachmentActive = false,
  className = '',
  tabIndex = {
    webSearch: 11,
    balancedMode: 12,
    attachment: 13,
    interactiveMode: 14,
    anweisungen: 15
  },
  showPrivacyInfoLink = false,
  onPrivacyInfoClick,
  showWebSearchInfoLink = false,
  onWebSearchInfoClick,
  instructionType = null
}) => {
  // Use store for feature toggles with selective subscriptions
  const useWebSearch = useGeneratorSelectionStore(state => state.useWebSearch);
  const usePrivacyMode = useGeneratorSelectionStore(state => state.usePrivacyMode);
  const useProMode = useGeneratorSelectionStore(state => state.useProMode);
  const useAutomaticSearch = useGeneratorSelectionStore(state => state.useAutomaticSearch);
  const toggleWebSearch = useGeneratorSelectionStore(state => state.toggleWebSearch);
  const togglePrivacyMode = useGeneratorSelectionStore(state => state.togglePrivacyMode);
  const toggleProMode = useGeneratorSelectionStore(state => state.toggleProMode);
  const [clickedIcon, setClickedIcon] = useState(null);
  const [isValidatingFiles, setIsValidatingFiles] = useState(false);
  const [validationError, setValidationError] = useState(null);
  const [fileMetadata, setFileMetadata] = useState({});
  const [isDragging, setIsDragging] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);

  // Unified dropdown state - only ONE dropdown can be open at a time
  const [activeDropdown, setActiveDropdown] = useState(null); // 'balanced' | 'content' | 'anweisungen' | null

  // Refs
  const featureIconsRef = useRef(null);
  const balancedContainerRef = useRef(null);
  const contentContainerRef = useRef(null);
  const contentDropdownRef = useRef(null);
  const fileInputRef = useRef(null);

  // Get user authentication
  const { user } = useAuth();

  // Connect to selection store with selective subscriptions
  const selectedDocumentIds = useGeneratorSelectionStore(state => state.selectedDocumentIds);
  const selectedTextIds = useGeneratorSelectionStore(state => state.selectedTextIds);
  const availableDocuments = useGeneratorSelectionStore(state => state.availableDocuments);
  const availableTexts = useGeneratorSelectionStore(state => state.availableTexts);
  const toggleDocumentSelection = useGeneratorSelectionStore(state => state.toggleDocumentSelection);
  const toggleTextSelection = useGeneratorSelectionStore(state => state.toggleTextSelection);
  const storeInstructionType = useGeneratorSelectionStore(state => state.instructionType);

  // Use instruction type from prop or store
  const finalInstructionType = instructionType || storeInstructionType;

  // Check if instructions exist for this type (smart contextual)
  const { data: instructionsStatus, isLoading: isLoadingInstructions } = useInstructionsStatusForType(
    finalInstructionType,
    { enabled: !!(finalInstructionType && user?.id) }
  );

  // Determine if Anweisungen button should be shown (smart contextual)
  const shouldShowAnweisungen = useMemo(() => {
    if (!finalInstructionType) return false;
    if (isLoadingInstructions) return false;
    return instructionsStatus?.hasAnyInstructions || false;
  }, [finalInstructionType, isLoadingInstructions, instructionsStatus]);

  // Calculate total content count for badge
  const totalContentCount = useMemo(() => {
    return attachedFiles.length + selectedDocumentIds.length + selectedTextIds.length;
  }, [attachedFiles.length, selectedDocumentIds.length, selectedTextIds.length]);

  // Smart dropdown toggle - ensures only one dropdown is open at a time
  const handleDropdownToggle = useCallback((dropdownName) => {
    setActiveDropdown(prev => {
      // If clicking same dropdown, close it
      if (prev === dropdownName) return null;
      // Otherwise, open the new one (auto-closes previous)
      return dropdownName;
    });
  }, []);

  // Re-validate files when privacy mode changes
  const revalidateFilesForPrivacyMode = useCallback(() => {
    if (!attachedFiles || attachedFiles.length === 0) return;

    const updatedMetadata = { ...fileMetadata };
    let hasConflicts = false;

    attachedFiles.forEach((file, index) => {
      if (updatedMetadata[index]) {
        const metadata = updatedMetadata[index];

        metadata.hasPrivacyConflict = false;
        metadata.conflictReason = null;

        if (usePrivacyMode) {
          if (file.type === 'application/pdf' && metadata.pageCount > 10) {
            metadata.hasPrivacyConflict = true;
            metadata.conflictReason = `PDF hat ${metadata.pageCount} Seiten, maximal 10 erlaubt`;
            hasConflicts = true;
          }
          else if (file.type.startsWith('image/')) {
            metadata.hasPrivacyConflict = true;
            metadata.conflictReason = 'Bilder werden im Privacy Mode ignoriert';
            hasConflicts = true;
          }
        }
      }
    });

    setFileMetadata(updatedMetadata);

    if (hasConflicts) {
      const conflictFiles = Object.entries(updatedMetadata)
        .filter(([, meta]) => meta.hasPrivacyConflict)
        .map(([index, meta]) => `${attachedFiles[index].name}: ${meta.conflictReason}`)
        .join(', ');
      setValidationError(`Privacy Mode Konflikt: ${conflictFiles}`);
    } else {
      setValidationError(null);
    }
  }, [attachedFiles, fileMetadata, usePrivacyMode]);

  useEffect(() => {
    revalidateFilesForPrivacyMode();
  }, [usePrivacyMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleIconClick = (event, type, callback) => {
    event.preventDefault();
    event.stopPropagation();
    setClickedIcon(type);
    if (callback) {
      callback();
    }
    setTimeout(() => setClickedIcon(null), 300);
  };

  const handleFileInputTrigger = () => {
    fileInputRef.current?.click();
    setActiveDropdown(null);
  };

  // Shared file processing logic for both file input and drag-drop
  const processFiles = useCallback(async (files) => {
    if (files.length === 0) {
      return;
    }

    setValidationError(null);
    setFileMetadata({});
    setIsValidatingFiles(true);

    try {
      const metadata = {};

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        metadata[i] = {
          pageCount: null,
          hasPrivacyConflict: false,
          conflictReason: null
        };

        if (file.type === 'application/pdf') {
          try {
            const pageCount = await getPDFPageCount(file);
            metadata[i].pageCount = pageCount;

            if (usePrivacyMode && pageCount > 10) {
              metadata[i].hasPrivacyConflict = true;
              metadata[i].conflictReason = `PDF hat ${pageCount} Seiten, maximal 10 erlaubt`;
            }
          } catch (error) {
            metadata[i].pageCount = null;
          }
        }
        else if (file.type.startsWith('image/') && usePrivacyMode) {
          metadata[i].hasPrivacyConflict = true;
          metadata[i].conflictReason = 'Bilder werden im Privacy Mode ignoriert';
        }
      }

      setFileMetadata(metadata);

      if (usePrivacyMode) {
        const hasConflicts = Object.values(metadata).some(m => m.hasPrivacyConflict);
        if (hasConflicts) {
          const conflictFiles = Object.entries(metadata)
            .filter(([, meta]) => meta.hasPrivacyConflict)
            .map(([index, meta]) => `${files[index].name}: ${meta.conflictReason}`)
            .join(', ');

          setValidationError(`Privacy Mode Konflikt: ${conflictFiles}`);
          setIsValidatingFiles(false);
          return;
        }
      }

      if (onAttachmentClick) {
        onAttachmentClick(files);
      }

    } catch (error) {
      setValidationError('Fehler bei der Dateiverarbeitung. Bitte versuchen Sie es erneut.');
    } finally {
      setIsValidatingFiles(false);
    }
  }, [usePrivacyMode, onAttachmentClick]);

  const handleFileSelect = async (event) => {
    const files = Array.from(event.target.files);
    await processFiles(files);
    event.target.value = '';
  };

  // Drag-and-drop handlers
  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();

    // Only set isDragging to false if leaving the content container entirely
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (isValidatingFiles) return;

    const droppedFiles = Array.from(e.dataTransfer.files);

    // Filter for accepted file types
    const acceptedTypes = ['.pdf', '.jpg', '.jpeg', '.png', '.webp'];
    const validFiles = droppedFiles.filter(file => {
      const extension = '.' + file.name.split('.').pop().toLowerCase();
      return acceptedTypes.includes(extension) ||
             file.type === 'application/pdf' ||
             file.type.startsWith('image/');
    });

    if (validFiles.length === 0) {
      setValidationError('Nur PDF und Bilder (.jpg, .jpeg, .png, .webp) sind erlaubt.');
      return;
    }

    if (validFiles.length < droppedFiles.length) {
      setValidationError(`${droppedFiles.length - validFiles.length} Datei(en) übersprungen (ungültiger Typ).`);
    }

    await processFiles(validFiles);
  }, [isValidatingFiles, processFiles]);


  // Show login prompt for non-authenticated users
  if (!user) {
    return (
      <>
        <div className={`feature-icons ${className}`} ref={featureIconsRef}>
          <div className="feature-icons__login-prompt">
            Für alle Features logge dich mit deinem Parteiaccount ein.{' '}
            <button
              type="button"
              onClick={() => setShowLoginModal(true)}
              className="feature-icons__login-link"
            >
              Login
            </button>
          </div>
        </div>

        {showLoginModal && (
          <LoginPage
            mode="required"
            pageName="Features"
            customMessage="Melde dich an, um alle Features zu nutzen."
            onClose={() => setShowLoginModal(false)}
          />
        )}
      </>
    );
  }

  return (
    <div className={`feature-icons ${className}`} ref={featureIconsRef}>
      <div className="feature-icons-row">
        <button
          className={`feature-icon-button ${useWebSearch ? 'active' : ''} ${clickedIcon === 'webSearch' ? 'clicked' : ''}`}
          onClick={(event) => handleIconClick(event, 'webSearch', toggleWebSearch)}
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
        >
          <button
            className={`feature-icon-button ${(usePrivacyMode || useProMode) ? 'active' : ''} ${clickedIcon === 'balanced' ? 'clicked' : ''}`}
            aria-label={usePrivacyMode ? 'Privacy' : (useProMode ? 'Pro' : 'Ausbalanciert')}
            tabIndex={tabIndex.balancedMode}
            type="button"
            onClick={(event) => {
              handleIconClick(event, 'balanced');
              handleDropdownToggle('balanced');
            }}
          >
            {(usePrivacyMode && <HiEye className="feature-icons__icon" />) ||
             (useProMode && <HiPlusCircle className="feature-icons__icon" />) ||
             (<HiAdjustments className="feature-icons__icon" />)}
            <span className="feature-icons-button__label">
              {usePrivacyMode ? 'Privacy' : (useProMode ? 'Pro' : 'Ausbalanciert')}
            </span>
          </button>
        </div>

        <div
          className={`content-mode-container ${isDragging ? 'dragging' : ''}`}
          ref={contentContainerRef}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <button
            className={`feature-icon-button ${(totalContentCount > 0 || useAutomaticSearch) ? 'active' : ''} ${clickedIcon === 'content' ? 'clicked' : ''} ${isDragging ? 'dragging' : ''}`}
            onClick={(event) => {
              handleIconClick(event, 'content');
              handleDropdownToggle('content');
            }}
            aria-label="Inhalt"
            tabIndex={tabIndex.attachment}
            type="button"
            disabled={isValidatingFiles}
          >
            {useAutomaticSearch ? (
              <HiLightningBolt className="feature-icons__icon" />
            ) : (
              <HiPaperClip className="feature-icons__icon" />
            )}
            <span className="feature-icons-button__label">
              {isValidatingFiles ? 'Prüfe...' : (
                useAutomaticSearch ? 'Auto' : (totalContentCount > 0 ? `${totalContentCount}` : 'Inhalt')
              )}
            </span>
          </button>

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
        </div>

        {onInteractiveModeClick && (
          <div className="interactive-mode-container">
            <button
              className={`feature-icon-button ${interactiveModeActive ? 'active' : ''} ${clickedIcon === 'interactiveMode' ? 'clicked' : ''}`}
              onClick={(event) => handleIconClick(event, 'interactiveMode', onInteractiveModeClick)}
              aria-label="Interaktiver Modus"
              tabIndex={tabIndex.interactiveMode}
              type="button"
            >
              <HiChatAlt2 className="feature-icons__icon" />
              <span className="feature-icons-button__label">
                {interactiveModeActive ? 'Interaktiv aktiv' : 'Interaktiv'}
              </span>
            </button>
          </div>
        )}

        {shouldShowAnweisungen && (
          <div className="anweisungen-mode-container">
            <button
              className={`feature-icon-button ${anweisungenActive ? 'active' : ''} ${clickedIcon === 'anweisungen' ? 'clicked' : ''}`}
              onClick={(event) => handleIconClick(event, 'anweisungen', onAnweisungenClick)}
              aria-label="Anweisungen aktivieren"
              tabIndex={tabIndex.anweisungen}
              type="button"
            >
              <HiClipboardList className="feature-icons__icon" />
              <span className="feature-icons-button__label">
                {anweisungenActive ? 'Meine Anweisungen' : 'Anweisungen'}
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Attached Files List */}
      <AttachedFilesList
        files={attachedFiles}
        onRemoveFile={onRemoveFile}
        fileMetadata={fileMetadata}
        privacyModeActive={usePrivacyMode}
      />

      {/* Selected Documents and Texts */}
      {(selectedDocumentIds.length > 0 || selectedTextIds.length > 0) && (
        <div className="feature-icons__selected-content">
          {selectedDocumentIds.map(docId => {
            const doc = availableDocuments.find(d => d.id === docId);
            if (!doc) return null;
            return (
              <div key={`doc-${docId}`} className="selected-content-tag">
                <HiDocument className="selected-content-icon" />
                <span className="selected-content-name">{doc.title}</span>
                <button
                  type="button"
                  className="selected-content-remove-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleDocumentSelection(docId);
                  }}
                  aria-label={`${doc.title} entfernen`}
                >
                  <HiX />
                </button>
              </div>
            );
          })}
          {selectedTextIds.map(textId => {
            const text = availableTexts.find(t => t.id === textId);
            if (!text) return null;
            return (
              <div key={`text-${textId}`} className="selected-content-tag">
                <HiClipboardList className="selected-content-icon" />
                <span className="selected-content-name">{text.title}</span>
                <button
                  type="button"
                  className="selected-content-remove-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleTextSelection(textId);
                  }}
                  aria-label={`${text.title} entfernen`}
                >
                  <HiX />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Inline Balanced Mode Dropdown */}
      <DropdownPortal
        triggerRef={balancedContainerRef}
        isOpen={activeDropdown === 'balanced'}
        onClose={() => setActiveDropdown(null)}
        className="balanced-dropdown-inline open"
        widthRef={featureIconsRef}
        minWidth={240}
        gap={8}
      >
        <button
          className={`balanced-dropdown-item ${!usePrivacyMode && !useProMode ? 'active' : ''}`}
          onClick={(event) => handleIconClick(event, 'balanced', () => {
            // Turn off both privacy and pro mode for balanced
            if (usePrivacyMode) togglePrivacyMode();
            if (useProMode) toggleProMode();
            if (onBalancedModeClick) onBalancedModeClick();
            setActiveDropdown(null);
          })}
          type="button"
        >
          <HiAdjustments className="balanced-dropdown-icon" />
          <div className="balanced-dropdown-content">
            <span className="balanced-dropdown-title">Ausbalanciert</span>
            <span className="balanced-dropdown-desc">Ausgewogen. Läuft auf EU-Servern.</span>
          </div>
        </button>

        <button
          className={`balanced-dropdown-item ${usePrivacyMode ? 'active' : ''}`}
          onClick={(event) => {
            event.stopPropagation();
            handleIconClick(event, 'privacy', () => {
              togglePrivacyMode();
              setActiveDropdown(null);
            });
          }}
          type="button"
        >
          <HiEye className="balanced-dropdown-icon" />
          <div className="balanced-dropdown-content">
            <span className="balanced-dropdown-title">Privacy</span>
            <span className="balanced-dropdown-desc">Netzbegrünung-Server (Deutschland).</span>
          </div>
        </button>

        <button
          className={`balanced-dropdown-item ${useProMode ? 'active' : ''}`}
          onClick={(event) => {
            event.stopPropagation();
            handleIconClick(event, 'pro', () => {
              toggleProMode();
              setActiveDropdown(null);
            });
          }}
          type="button"
        >
          <HiPlusCircle className="balanced-dropdown-icon" />
          <div className="balanced-dropdown-content">
            <span className="balanced-dropdown-title">Pro</span>
            <span className="balanced-dropdown-desc">Erweiterte KI für komplexe Aufgaben.</span>
          </div>
        </button>
      </DropdownPortal>

      {/* Content Dropdown */}
      <DropdownPortal
        triggerRef={contentContainerRef}
        isOpen={activeDropdown === 'content'}
        onClose={() => setActiveDropdown(null)}
        className="content-dropdown-inline open"
        widthRef={featureIconsRef}
        minWidth={240}
        gap={8}
      >
        <ContentSelector
          mode="compact"
          onAttachmentClick={onAttachmentClick}
          onRemoveFile={onRemoveFile}
          attachedFiles={attachedFiles}
          usePrivacyMode={usePrivacyMode}
          onDropdownClose={() => setActiveDropdown(null)}
        />
      </DropdownPortal>

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

      {validationError && (
        <div className="feature-icons__validation-error" role="alert" aria-live="assertive">
          <span style={{ color: 'var(--error-color, #e74c3c)', fontSize: '0.9em' }}>
            ⚠️ {validationError}
          </span>
          {validationError.includes('Privacy Mode') && (
            <button
              type="button"
              className="feature-icons__error-action"
              onClick={() => {
                togglePrivacyMode();
                setValidationError(null);
              }}
            >
              Privacy Mode deaktivieren
            </button>
          )}
        </div>
      )}
    </div>
  );
};

FeatureIcons.propTypes = {
  // Feature toggle props removed - now using store
  onBalancedModeClick: PropTypes.func, // Optional callback for backward compatibility
  onAttachmentClick: PropTypes.func,
  onRemoveFile: PropTypes.func,
  onAnweisungenClick: PropTypes.func.isRequired,
  onInteractiveModeClick: PropTypes.func,
  anweisungenActive: PropTypes.bool,
  interactiveModeActive: PropTypes.bool,
  attachedFiles: PropTypes.array,
  attachmentActive: PropTypes.bool,
  className: PropTypes.string,
  tabIndex: PropTypes.shape({
    webSearch: PropTypes.number,
    balancedMode: PropTypes.number,
    attachment: PropTypes.number,
    interactiveMode: PropTypes.number,
    anweisungen: PropTypes.number
  }),
  showPrivacyInfoLink: PropTypes.bool,
  onPrivacyInfoClick: PropTypes.func,
  showWebSearchInfoLink: PropTypes.bool,
  onWebSearchInfoClick: PropTypes.func,
  instructionType: PropTypes.oneOf(['antrag', 'social', 'universal', 'gruenejugend'])
};

export default FeatureIcons;
