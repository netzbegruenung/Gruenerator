import { JSX, useState, useRef, useMemo, useCallback } from 'react';
import '../../assets/styles/components/ui/FeatureIcons.css';
import { HiGlobeAlt, HiPaperClip, HiLightningBolt, HiPlusCircle, HiClipboardList, HiAnnotation, HiDocument, HiX } from 'react-icons/hi';
import { HiRocketLaunch, HiSparkles } from 'react-icons/hi2';
import GrueneratorGPTIcon from './GrueneratorGPTIcon';
import AttachedFilesList from './AttachedFilesList';
import ContentSelector, { type AttachedFile } from './ContentSelector';
import { getPDFPageCount } from '../../utils/fileAttachmentUtils';
import { useGeneratorSelectionStore } from '../../stores/core/generatorSelectionStore';
import { useInstructionsStatusForType } from '../../features/auth/hooks/useInstructionsStatus';
import { useAuth } from '../../hooks/useAuth';
import DropdownPortal from './DropdownPortal';
import LoginPage from '../../features/auth/pages/LoginPage';

interface FeatureIconsProps {
  // Feature toggle props removed - now using store
  onBalancedModeClick?: () => void;
  // Optional callback for backward compatibility
  onAttachmentClick?: (files: File[]) => void;
  onRemoveFile?: (index: number) => void;
  onAnweisungenClick: () => void;
  onInteractiveModeClick?: () => void;
  anweisungenActive?: boolean;
  interactiveModeActive?: boolean;
  attachedFiles?: AttachedFile[];
  attachmentActive?: boolean;
  className?: string;
  tabIndex?: {
    webSearch?: number;
    balancedMode?: number;
    attachment?: number;
    interactiveMode?: number;
    anweisungen?: number
  };
  showPrivacyInfoLink?: boolean;
  onPrivacyInfoClick?: () => void;
  showWebSearchInfoLink?: boolean;
  onWebSearchInfoClick?: () => void;
  instructionType?: 'antrag' | 'social' | 'universal' | 'gruenejugend';
  noBorder?: boolean;
  hideLoginPrompt?: boolean;
}

const FeatureIcons = ({
  // Feature toggle props removed - now using store
  onBalancedModeClick, // Keep for backward compatibility
  onAttachmentClick,
  onRemoveFile,
  onAnweisungenClick,
  onInteractiveModeClick,
  anweisungenActive = false,
  interactiveModeActive = true,
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
  instructionType = undefined,
  noBorder = false,
  hideLoginPrompt = false
}: FeatureIconsProps): JSX.Element | null => {
  // Use store for feature toggles with selective subscriptions
  const useWebSearch = useGeneratorSelectionStore(state => state.useWebSearch);
  const usePrivacyMode = useGeneratorSelectionStore(state => state.usePrivacyMode);
  const useProMode = useGeneratorSelectionStore(state => state.useProMode);
  const useAutomaticSearch = useGeneratorSelectionStore(state => state.useAutomaticSearch);
  const toggleWebSearch = useGeneratorSelectionStore(state => state.toggleWebSearch);
  const togglePrivacyMode = useGeneratorSelectionStore(state => state.togglePrivacyMode);
  const toggleProMode = useGeneratorSelectionStore(state => state.toggleProMode);
  const [clickedIcon, setClickedIcon] = useState<string | null>(null);
  const [isValidatingFiles, setIsValidatingFiles] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [fileMetadata, setFileMetadata] = useState<Record<number, { pageCount: number | null }>>({});
  const [showLoginModal, setShowLoginModal] = useState(false);

  // Unified dropdown state - only ONE dropdown can be open at a time
  const [activeDropdown, setActiveDropdown] = useState<'balanced' | 'content' | 'anweisungen' | null>(null);

  // Refs
  const featureIconsRef = useRef<HTMLDivElement>(null);
  const balancedContainerRef = useRef<HTMLDivElement>(null);
  const contentContainerRef = useRef<HTMLDivElement>(null);
  const contentDropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  interface InstructionsStatus {
    hasAnyInstructions?: boolean;
    [key: string]: unknown;
  }

  // Check if instructions exist for this type (smart contextual)
  const { data: instructionsStatus, isLoading: isLoadingInstructions } = useInstructionsStatusForType(
    finalInstructionType || undefined,
    { enabled: !!(finalInstructionType && user?.id) }
  ) as { data?: InstructionsStatus; isLoading: boolean };

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
  const handleDropdownToggle = useCallback((dropdownName: 'balanced' | 'content' | 'anweisungen') => {
    setActiveDropdown(prev => {
      // If clicking same dropdown, close it
      if (prev === dropdownName) return null;
      // Otherwise, open the new one (auto-closes previous)
      return dropdownName;
    });
  }, []);

  const handleIconClick = (event: React.MouseEvent<HTMLButtonElement>, type: string, callback?: () => void): void => {
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

  // File processing logic
  const processFiles = useCallback(async (files: File[]): Promise<void> => {
    if (files.length === 0) {
      return;
    }

    setValidationError(null);
    setFileMetadata({});
    setIsValidatingFiles(true);

    try {
      const metadata: Record<number, { pageCount: number | null }> = {};

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        metadata[i] = {
          pageCount: null
        };

        if (file.type === 'application/pdf') {
          try {
            const pageCount = await getPDFPageCount(file);
            metadata[i].pageCount = pageCount;
          } catch (error) {
            metadata[i].pageCount = null;
          }
        }
      }

      setFileMetadata(metadata);

      if (onAttachmentClick) {
        onAttachmentClick(files);
      }

    } catch (error) {
      setValidationError('Fehler bei der Dateiverarbeitung. Bitte versuchen Sie es erneut.');
    } finally {
      setIsValidatingFiles(false);
    }
  }, [onAttachmentClick]);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []) as File[];
    await processFiles(files);
    event.target.value = '';
  };

  // Show login prompt for non-authenticated users (unless hidden or on localhost for debugging)
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (!user && !isLocalhost) {
    if (hideLoginPrompt) {
      return null;
    }
    return (
      <>
        <div className={`feature-icons ${noBorder ? 'feature-icons--no-border' : ''} ${className}`} ref={featureIconsRef}>
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
    <div className={`feature-icons ${noBorder ? 'feature-icons--no-border' : ''} ${className}`} ref={featureIconsRef}>
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
            aria-label={usePrivacyMode ? 'Gruenerator-GPT' : (useProMode ? 'Pro' : 'Kreativ')}
            tabIndex={tabIndex.balancedMode}
            type="button"
            onClick={(event) => {
              handleIconClick(event, 'balanced', undefined);
              handleDropdownToggle('balanced');
            }}
          >
            {(usePrivacyMode && <GrueneratorGPTIcon className="feature-icons__icon" />) ||
              (useProMode && <HiPlusCircle className="feature-icons__icon" />) ||
              (<HiSparkles className="feature-icons__icon" />)}
            <span className="feature-icons-button__label">
              {usePrivacyMode ? 'Gruenerator-GPT' : (useProMode ? 'Pro' : 'Kreativ')}
            </span>
          </button>
        </div>

        <div
          className="content-mode-container"
          ref={contentContainerRef}
        >
          <button
            className={`feature-icon-button ${(totalContentCount > 0 || useAutomaticSearch) ? 'active' : ''} ${clickedIcon === 'content' ? 'clicked' : ''}`}
            onClick={(event) => {
              handleIconClick(event, 'content', undefined);
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
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
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
              <HiAnnotation className="feature-icons__icon" />
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

        {/* Attached Files List - inside the row for inline display */}
        <AttachedFilesList
          files={attachedFiles}
          onRemoveFile={onRemoveFile}
          fileMetadata={fileMetadata}
          compact={true}
        />
      </div>

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
                  onClick={(e: React.MouseEvent) => {
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
                  onClick={(e: React.MouseEvent) => {
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
        triggerRef={balancedContainerRef as React.RefObject<HTMLDivElement>}
        isOpen={activeDropdown === 'balanced'}
        onClose={() => setActiveDropdown(null)}
        className="balanced-dropdown-inline open"
        widthRef={featureIconsRef as React.RefObject<HTMLDivElement>}
        gap={8}
      >
        <button
          className={`balanced-dropdown-item ${!usePrivacyMode && !useProMode ? 'active' : ''}`}
          onClick={(event) => handleIconClick(event, 'balanced', () => {
            // Turn off all special modes for balanced
            if (usePrivacyMode) togglePrivacyMode();
            if (useProMode) toggleProMode();
            if (onBalancedModeClick) onBalancedModeClick();
            setActiveDropdown(null);
          })}
          type="button"
        >
          <HiSparkles className="balanced-dropdown-icon" />
          <div className="balanced-dropdown-content">
            <span className="balanced-dropdown-title">Kreativ</span>
            <span className="balanced-dropdown-desc">Mistral Medium.</span>
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
          <GrueneratorGPTIcon className="balanced-dropdown-icon" />
          <div className="balanced-dropdown-content">
            <span className="balanced-dropdown-title">Gruenerator-GPT</span>
            <span className="balanced-dropdown-desc">Selbstgehostete, sichere KI.</span>
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
            <span className="balanced-dropdown-title">Reasoning</span>
            <span className="balanced-dropdown-desc">Kann nachdenken. Dauert länger.</span>
          </div>
        </button>


      </DropdownPortal>

      {/* Content Dropdown */}
      <DropdownPortal
        triggerRef={contentContainerRef as React.RefObject<HTMLDivElement>}
        isOpen={activeDropdown === 'content'}
        onClose={() => setActiveDropdown(null)}
        className="content-dropdown-inline open"
        widthRef={featureIconsRef as React.RefObject<HTMLDivElement>}
        gap={8}
      >
        <ContentSelector
          onAttachmentClick={onAttachmentClick}
          onRemoveFile={onRemoveFile}
          attachedFiles={attachedFiles}
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
            {validationError}
          </span>
        </div>
      )}
    </div>
  );
};

export default FeatureIcons;
