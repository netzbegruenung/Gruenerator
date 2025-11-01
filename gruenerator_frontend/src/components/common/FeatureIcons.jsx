import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import '../../assets/styles/components/ui/FeatureIcons.css';
import PropTypes from 'prop-types';
import { HiGlobeAlt, HiEye, HiPaperClip, HiAdjustments, HiLightningBolt, HiClipboardList, HiUpload, HiCollection, HiChatAlt2 } from 'react-icons/hi';
import AttachedFilesList from './AttachedFilesList';
import { validateFilesForPrivacyMode, getPDFPageCount } from '../../utils/fileAttachmentUtils';
import { useGeneratorKnowledgeStore } from '../../stores/core/generatorKnowledgeStore';
import { useInstructionsStatusForType } from '../../features/auth/hooks/useInstructionsStatus';
import { useAuth } from '../../hooks/useAuth';
import { EnhancedKnowledgeSelector } from './KnowledgeSelector/KnowledgeSelector';

const FeatureIcons = ({
  onWebSearchClick,
  onPrivacyModeClick,
  onProModeClick,
  onBalancedModeClick,
  onAttachmentClick,
  onRemoveFile,
  onAnweisungenClick,
  onInteractiveModeClick,
  webSearchActive = false,
  privacyModeActive = false,
  proModeActive = false,
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
  const [clickedIcon, setClickedIcon] = useState(null);
  const [isValidatingFiles, setIsValidatingFiles] = useState(false);
  const [validationError, setValidationError] = useState(null);
  const [fileMetadata, setFileMetadata] = useState({});

  // Unified dropdown state - only ONE dropdown can be open at a time
  const [activeDropdown, setActiveDropdown] = useState(null); // 'balanced' | 'content' | 'anweisungen' | null

  // Refs
  const balancedContainerRef = useRef(null);
  const contentContainerRef = useRef(null);
  const contentDropdownRef = useRef(null);
  const fileInputRef = useRef(null);

  // Get user authentication
  const { user } = useAuth();

  // Connect to knowledge store
  const {
    selectedKnowledgeIds,
    selectedDocumentIds,
    selectedTextIds,
    instructionType: storeInstructionType
  } = useGeneratorKnowledgeStore();

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
  const totalKnowledgeCount = useMemo(() => {
    return selectedKnowledgeIds.length + selectedDocumentIds.length + selectedTextIds.length;
  }, [selectedKnowledgeIds, selectedDocumentIds, selectedTextIds]);

  const totalContentCount = useMemo(() => {
    return attachedFiles.length + totalKnowledgeCount;
  }, [attachedFiles.length, totalKnowledgeCount]);

  // Smart dropdown toggle - ensures only one dropdown is open at a time
  const handleDropdownToggle = useCallback((dropdownName) => {
    setActiveDropdown(prev => {
      // If clicking same dropdown, close it
      if (prev === dropdownName) return null;
      // Otherwise, open the new one (auto-closes previous)
      return dropdownName;
    });
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!activeDropdown) return;

    const handleClickOutside = (e) => {
      const dropdownElements = [
        balancedContainerRef.current,
        contentContainerRef.current,
        contentDropdownRef.current
      ];

      const isInsideDropdown = dropdownElements.some(
        el => el && el.contains(e.target)
      );

      if (!isInsideDropdown) {
        setActiveDropdown(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [activeDropdown]);


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

        if (privacyModeActive) {
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
  }, [attachedFiles, fileMetadata, privacyModeActive]);

  useEffect(() => {
    revalidateFilesForPrivacyMode();
  }, [privacyModeActive]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleFileSelect = async (event) => {
    const files = Array.from(event.target.files);

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

            if (privacyModeActive && pageCount > 10) {
              metadata[i].hasPrivacyConflict = true;
              metadata[i].conflictReason = `PDF hat ${pageCount} Seiten, maximal 10 erlaubt`;
            }
          } catch (error) {
            metadata[i].pageCount = null;
          }
        }
        else if (file.type.startsWith('image/') && privacyModeActive) {
          metadata[i].hasPrivacyConflict = true;
          metadata[i].conflictReason = 'Bilder werden im Privacy Mode ignoriert';
        }
      }

      setFileMetadata(metadata);

      if (privacyModeActive) {
        const hasConflicts = Object.values(metadata).some(m => m.hasPrivacyConflict);
        if (hasConflicts) {
          const conflictFiles = Object.entries(metadata)
            .filter(([, meta]) => meta.hasPrivacyConflict)
            .map(([index, meta]) => `${files[index].name}: ${meta.conflictReason}`)
            .join(', ');

          setValidationError(`Privacy Mode Konflikt: ${conflictFiles}`);
          event.target.value = '';
          setIsValidatingFiles(false);
          return;
        }
      }

      if (onAttachmentClick) {
        onAttachmentClick(files);
      }

    } catch (error) {
      setValidationError('Fehler bei der Dateiverarbeitung. Bitte versuchen Sie es erneut.');
      event.target.value = '';
    } finally {
      setIsValidatingFiles(false);
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
        >
          <button
            className={`feature-icon-button ${(privacyModeActive || proModeActive) ? 'active' : ''} ${clickedIcon === 'balanced' ? 'clicked' : ''}`}
            aria-label={privacyModeActive ? 'Privacy' : (proModeActive ? 'Pro' : 'Ausbalanciert')}
            tabIndex={tabIndex.balancedMode}
            type="button"
            onClick={(event) => {
              handleIconClick(event, 'balanced');
              handleDropdownToggle('balanced');
            }}
          >
            {(privacyModeActive && <HiEye className="feature-icons__icon" />) ||
             (proModeActive && <HiLightningBolt className="feature-icons__icon" />) ||
             (<HiAdjustments className="feature-icons__icon" />)}
            <span className="feature-icons-button__label">
              {privacyModeActive ? 'Privacy' : (proModeActive ? 'Pro' : 'Ausbalanciert')}
            </span>
          </button>
        </div>

        <div
          className="content-mode-container"
          ref={contentContainerRef}
        >
          <button
            className={`feature-icon-button ${totalContentCount > 0 ? 'active' : ''} ${clickedIcon === 'content' ? 'clicked' : ''}`}
            onClick={(event) => {
              handleIconClick(event, 'content');
              handleDropdownToggle('content');
            }}
            aria-label="Inhalt auswählen"
            tabIndex={tabIndex.attachment}
            type="button"
            disabled={isValidatingFiles}
          >
            <HiPaperClip className="feature-icons__icon" />
            <span className="feature-icons-button__label">
              {isValidatingFiles ? 'Prüfe...' : `Inhalt${totalContentCount > 0 ? ` (${totalContentCount})` : ''}`}
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

      {/* Inline Balanced Mode Dropdown */}
      <div className={`balanced-dropdown-inline ${activeDropdown === 'balanced' ? 'open' : ''}`}>
        <button
          className={`balanced-dropdown-item ${!privacyModeActive && !proModeActive ? 'active' : ''}`}
          onClick={(event) => handleIconClick(event, 'balanced', () => {
            if (privacyModeActive && onPrivacyModeClick) onPrivacyModeClick();
            if (proModeActive && onProModeClick) onProModeClick();
            if (onBalancedModeClick) onBalancedModeClick();
            setActiveDropdown(null);
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
          className={`balanced-dropdown-item ${privacyModeActive ? 'active' : ''}`}
          onClick={(event) => handleIconClick(event, 'privacy', () => {
            if (proModeActive && onProModeClick) onProModeClick();
            if (onPrivacyModeClick) onPrivacyModeClick();
            setActiveDropdown(null);
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
          className={`balanced-dropdown-item ${proModeActive ? 'active' : ''}`}
          onClick={(event) => handleIconClick(event, 'pro', () => {
            if (privacyModeActive && onPrivacyModeClick) onPrivacyModeClick();
            if (onProModeClick) onProModeClick();
            setActiveDropdown(null);
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

      {/* Inline Content Dropdown */}
      <div
        ref={contentDropdownRef}
        className={`content-dropdown-inline ${activeDropdown === 'content' ? 'open' : ''}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          className="content-dropdown-item content-dropdown-item--file-upload"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => handleFileInputTrigger()}
          type="button"
          disabled={isValidatingFiles}
        >
          <HiUpload className="content-dropdown-icon" />
          <div className="content-dropdown-content">
            <span className="content-dropdown-title">Datei hochladen</span>
            <span className="content-dropdown-desc">PDF, Bilder (max. 10 Seiten im Privacy Mode)</span>
          </div>
        </button>

        <div className="content-dropdown-separator"></div>

        <div className="content-dropdown-item content-dropdown-item--knowledge-selector">
          <HiCollection className="content-dropdown-icon" />
          <div className="content-dropdown-knowledge-wrapper">
            <EnhancedKnowledgeSelector
              disabled={isValidatingFiles}
              tabIndex={-1}
              disableMenuPortal={true}
            />
          </div>
        </div>
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
  onAnweisungenClick: PropTypes.func.isRequired,
  onInteractiveModeClick: PropTypes.func,
  webSearchActive: PropTypes.bool,
  privacyModeActive: PropTypes.bool,
  proModeActive: PropTypes.bool,
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
