import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { HiDocument, HiClipboardList, HiLightningBolt, HiArrowLeft, HiUpload, HiEye, HiX } from 'react-icons/hi';
import { useShallow } from 'zustand/react/shallow';
import { useGeneratorSelectionStore } from '../../stores/core/generatorSelectionStore';
import { useAuth } from '../../hooks/useAuth';
import { getPDFPageCount } from '../../utils/fileAttachmentUtils';
import EnhancedSelect from './EnhancedSelect/EnhancedSelect';
import { components as ReactSelectComponents } from 'react-select';
import AttachedFilesList from './AttachedFilesList';
import '../../assets/styles/components/profile/profile-action-buttons.css';
import '../../assets/styles/components/ui/ContentSelector.css';

/**
 * ContentSelector - File and text selector with compact and expanded modes
 * Uses EnhancedSelect dropdown for content selection
 *
 * @param {Object} props
 * @param {boolean} props.disabled - Disable all interactions
 * @param {'compact'|'expanded'} props.mode - Display mode (compact=dropdown content, expanded=full-screen overlay)
 * @param {Function} props.onAttachmentClick - Handle file attachments
 * @param {Function} props.onRemoveFile - Handle file removal
 * @param {Array} props.attachedFiles - Currently attached files
 * @param {boolean} props.usePrivacyMode - Privacy mode active state
 */
const ContentSelector = ({
  disabled = false,
  mode = 'compact',
  onAttachmentClick,
  onRemoveFile,
  attachedFiles = [],
  usePrivacyMode = false,
  onDropdownClose
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isValidatingFiles, setIsValidatingFiles] = useState(false);
  const [validationError, setValidationError] = useState(null);
  const [fileMetadata, setFileMetadata] = useState({});

  const fileInputRef = useRef(null);
  const isExpanded = mode === 'expanded';
  const isFullScreen = mode === 'expanded';

  // Consolidated store subscription with shallow comparison
  const {
    availableTexts,
    selectedTextIds,
    toggleTextSelection,
    availableDocuments,
    selectedDocumentIds,
    toggleDocumentSelection,
    isLoadingTexts,
    isLoadingDocuments,
    fetchTexts,
    uiConfig,
    useAutomaticSearch,
    toggleAutomaticSearch
  } = useGeneratorSelectionStore(
    useShallow((state) => ({
      availableTexts: state.availableTexts,
      selectedTextIds: state.selectedTextIds,
      toggleTextSelection: state.toggleTextSelection,
      availableDocuments: state.availableDocuments,
      selectedDocumentIds: state.selectedDocumentIds,
      toggleDocumentSelection: state.toggleDocumentSelection,
      isLoadingTexts: state.isLoadingTexts,
      isLoadingDocuments: state.isLoadingDocuments,
      fetchTexts: state.fetchTexts,
      uiConfig: state.uiConfig,
      useAutomaticSearch: state.useAutomaticSearch,
      toggleAutomaticSearch: state.toggleAutomaticSearch
    }))
  );

  const { user } = useAuth();

  const { enableDocuments = false, enableTexts = false } = uiConfig;

  // Transform documents and texts into EnhancedSelect options
  const options = useMemo(() => {
    const opts = [];

    // Automatic Search as first option
    opts.push({
      value: 'automatic-search',
      label: 'Automatische Suche',
      selectedLabel: 'Auto-Modus',
      icon: HiLightningBolt,
      tag: {
        label: 'Auto',
        variant: 'custom'
      },
      subtitle: 'KI wählt relevante Inhalte automatisch',
      searchableContent: 'automatische suche auto ki smart intelligent',
      metadata: {
        type: 'automatic-search',
        isSpecialMode: true
      }
    });

    // User documents
    if (enableDocuments && availableDocuments.length > 0) {
      availableDocuments
        .filter(doc => doc.status === 'completed')
        .forEach(doc => {
          const sourceType = doc.source_type || 'manual';
          let sourceBadge = '📁 Upload';
          if (sourceType === 'wolke') sourceBadge = '☁️ Wolke';
          if (sourceType === 'url') sourceBadge = '🔗 URL';

          opts.push({
            value: `document-${doc.id}`,
            label: doc.title,
            icon: HiDocument,
            tag: {
              label: 'Dokument',
              variant: 'user'
            },
            subtitle: `${doc.filename || ''} • ${sourceBadge}`,
            searchableContent: `${doc.title} ${doc.filename || ''} ${doc.ocr_text || ''}`,
            metadata: {
              type: 'document',
              id: doc.id,
              ...doc
            }
          });
        });
    }

    // User texts
    if (enableTexts && availableTexts.length > 0) {
      availableTexts.forEach(text => {
        opts.push({
          value: `text-${text.id}`,
          label: text.title,
          icon: HiClipboardList,
          tag: {
            label: 'Text',
            variant: 'user'
          },
          subtitle: text.type || '',
          searchableContent: `${text.title} ${text.type || ''} ${text.full_content || text.content || ''}`,
          metadata: {
            type: 'text',
            id: text.id,
            ...text
          }
        });
      });
    }

    return opts;
  }, [enableDocuments, enableTexts, availableDocuments, availableTexts]);

  // Menu state controlled manually by user interaction
  // (Auto-open removed - user must click to open)

  // Get selected values for EnhancedSelect
  // Include automatic search in value array when active (hidden as chip via CustomMultiValue)
  const selectedValues = useMemo(() => {
    return options.filter(option => {
      if (option.metadata.type === 'automatic-search') {
        return useAutomaticSearch; // Include when active
      } else if (option.metadata.type === 'document') {
        return selectedDocumentIds.includes(option.metadata.id);
      } else {
        return selectedTextIds.includes(option.metadata.id);
      }
    });
  }, [options, selectedDocumentIds, selectedTextIds, useAutomaticSearch]);

  // Handle selection change
  const handleSelectionChange = useCallback((newSelectedOptions) => {
    const newSelectedOptionsList = newSelectedOptions || [];

    // If cleared (null/empty) while automatic search is active, turn it off
    if (newSelectedOptionsList.length === 0 && useAutomaticSearch && selectedValues.length === 0) {
      toggleAutomaticSearch();
      return;
    }

    // Check if automatic search is in new selection
    const hasAutomaticSearch = newSelectedOptionsList.some(opt => opt.metadata.type === 'automatic-search');
    const hadAutomaticSearch = useAutomaticSearch;

    // Mutual exclusivity: automatic search OR manual selections
    if (hasAutomaticSearch && !hadAutomaticSearch) {
      // User selected automatic search - turn it on (this will clear manual selections via store)
      toggleAutomaticSearch();
      if (onDropdownClose) onDropdownClose();
      return;
    } else if (!hasAutomaticSearch && hadAutomaticSearch) {
      // User deselected automatic search - turn it off
      toggleAutomaticSearch();
      return;
    } else if (hasAutomaticSearch && hadAutomaticSearch) {
      // User is trying to add manual selections while automatic is on
      // Turn off automatic search and process manual selections
      toggleAutomaticSearch();
    }

    // Process manual document/text selections
    const currentSelectedValues = new Set(selectedValues.map(v => v.value));
    const newSelectedValues = new Set(newSelectedOptionsList.map(v => v.value));

    // Find items that were toggled
    options.forEach(option => {
      if (option.metadata.type === 'automatic-search') return; // Skip automatic search

      const wasSelected = currentSelectedValues.has(option.value);
      const isSelected = newSelectedValues.has(option.value);

      if (wasSelected !== isSelected) {
        // Toggle this item
        if (option.metadata.type === 'document') {
          toggleDocumentSelection(option.metadata.id);
        } else if (option.metadata.type === 'text') {
          toggleTextSelection(option.metadata.id);
        }
      }
    });
  }, [selectedValues, options, useAutomaticSearch, toggleAutomaticSearch, toggleDocumentSelection, toggleTextSelection, onDropdownClose]);

  // File processing logic (for expanded mode)
  const processFiles = useCallback(async (files) => {
    if (files.length === 0 || !onAttachmentClick) {
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

      onAttachmentClick(files);

    } catch (error) {
      setValidationError('Fehler bei der Dateiverarbeitung. Bitte versuchen Sie es erneut.');
    } finally {
      setIsValidatingFiles(false);
    }
  }, [usePrivacyMode, onAttachmentClick]);

  // File input handler
  const handleFileSelect = async (event) => {
    const files = Array.from(event.target.files);
    await processFiles(files);
    event.target.value = '';
  };

  // Drag-and-drop handlers (for expanded mode)
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

  // Handle clear button (when automatic search is active)
  const handleClear = useCallback(() => {
    if (useAutomaticSearch) {
      toggleAutomaticSearch(); // Turn off automatic search
    }
  }, [useAutomaticSearch, toggleAutomaticSearch]);

  // Dynamic placeholder based on automatic search state
  const placeholder = useMemo(() => {
    if (useAutomaticSearch) {
      return '⚡ Auto-Modus';
    }
    return 'Auswählen...';
  }, [useAutomaticSearch]);

  // Custom ClearIndicator to show clear button when automatic search is active
  const ClearIndicator = useCallback((props) => {
    // Show clear indicator if automatic search is active OR if there are selected values
    if (!useAutomaticSearch && selectedValues.length === 0) {
      return null;
    }

    // Use react-select's default ClearIndicator component with proper props
    return <ReactSelectComponents.ClearIndicator {...props} />;
  }, [useAutomaticSearch, selectedValues.length]);

  // Custom MultiValue to hide automatic search chip (shown as placeholder instead)
  const CustomMultiValue = useCallback((props) => {
    // Hide automatic search as a chip - it's shown as placeholder instead
    if (props.data.metadata?.type === 'automatic-search') {
      return null;
    }
    // Render normal chips for documents/texts
    return <ReactSelectComponents.MultiValue {...props} />;
  }, []);

  // Custom ValueContainer to show "Auto-Modus" text when automatic is active
  const CustomValueContainer = useCallback((props) => {
    const { children } = props;

    // When automatic search is active, inject the text display
    if (useAutomaticSearch) {
      return (
        <ReactSelectComponents.ValueContainer {...props}>
          <div className="react-select__placeholder-wrapper">
            <HiLightningBolt className="react-select__placeholder-icon" />
            <span className="content-selector__auto-mode-text">
              Auto-Modus
            </span>
          </div>
          {/* Still render children (clear button, etc) but hide chips */}
          <div className="content-selector__hidden-children">{children}</div>
        </ReactSelectComponents.ValueContainer>
      );
    }

    // Normal behavior for manual selections
    return <ReactSelectComponents.ValueContainer {...props}>{children}</ReactSelectComponents.ValueContainer>;
  }, [useAutomaticSearch]);

  // Selection count for badge
  const selectionCount = selectedDocumentIds.length + selectedTextIds.length;

  if (!user) return null;

  const isLoading = isLoadingTexts || isLoadingDocuments;

  return (
    <div className={`content-selector ${isFullScreen ? 'content-selector--expanded' : ''}`}>
      {/* Body (scrollable in expanded mode) */}
      <div className={isExpanded ? 'content-selector__body' : ''}>
        {/* Drag-Drop Zone */}
        {onAttachmentClick && (
          <div
            className={`content-dropdown__drag-zone ${isDragging ? 'dragging' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <HiUpload className="drag-zone__icon" />
            <div className="drag-zone__content">
              <span className="drag-zone__title">
                {isDragging ? 'Dateien hier ablegen' : 'Drag & Drop oder klicken'}
              </span>
              <span className="drag-zone__desc">PDF, DOCX</span>
            </div>
          </div>
        )}

        {/* Privacy Mode Banner */}
        {usePrivacyMode && (
          <div className="content-dropdown__validation-banner content-dropdown__validation-banner--privacy">
            <HiEye className="validation-banner__icon" />
            <div className="validation-banner__content">
              <span className="validation-banner__text">
                Privacy Mode aktiv: PDFs max. 10 Seiten, keine Bilder
              </span>
            </div>
          </div>
        )}

        {/* Hidden file input */}
        {onAttachmentClick && (
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
            disabled={isValidatingFiles}
          />
        )}

        {/* Validation Error */}
        {validationError && (
          <div style={{ color: 'var(--error-color, #e74c3c)', fontSize: '0.9em', padding: 'var(--spacing-small)' }}>
            ⚠️ {validationError}
          </div>
        )}

        {/* Attached Files List */}
        {attachedFiles.length > 0 && (
          <AttachedFilesList
            files={attachedFiles}
            onRemoveFile={onRemoveFile}
            fileMetadata={fileMetadata}
            privacyModeActive={usePrivacyMode}
          />
        )}

        {/* EnhancedSelect Dropdown */}
        <div className="content-selector__controls-row">
          <div className="content-selector__dropdown-container">
            {isLoading && (
              <div className="shared-content-loading">
                Lade verfügbare Inhalte...
              </div>
            )}

            {!isLoading && options.length === 0 && (
              <div className="shared-content-empty">
                Keine Inhalte verfügbar.<br />
                Lade Dokumente hoch oder generiere Texte.
              </div>
            )}

            {!isLoading && options.length > 0 && (
              <EnhancedSelect
                options={options}
                value={selectedValues}
                onChange={handleSelectionChange}
                isMulti
                isSearchable={!useAutomaticSearch}
                enableTags
                enableIcons
                enableSubtitles
                placeholder={placeholder}
                placeholderIcon={useAutomaticSearch ? HiLightningBolt : null}
                noOptionsMessage={() => "Keine gefunden"}
                isDisabled={disabled}
                isClearable={true}
                menuIsOpen={useAutomaticSearch ? false : undefined}
                components={{
                  ClearIndicator: ClearIndicator,
                  MultiValue: CustomMultiValue,
                  ValueContainer: CustomValueContainer
                }}
                classNamePrefix="react-select"
                menuPortalTarget={document.body}
                menuPosition="absolute"
                menuPlacement="bottom"
                menuShouldBlockScroll={false}
                menuShouldScrollIntoView={false}
                styles={{
                  menuPortal: (base) => ({ ...base, zIndex: 1000 }),
                  control: (base) => ({
                    ...base,
                    ...(useAutomaticSearch && {
                      backgroundColor: 'rgba(135, 206, 250, 0.08)',
                      borderColor: 'var(--himmel)'
                    })
                  }),
                  placeholder: (base) => ({
                    ...base,
                    ...(useAutomaticSearch && {
                      color: 'var(--himmel-dark, var(--font-color))',
                      fontWeight: 600,
                      opacity: 1
                    })
                  })
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

ContentSelector.propTypes = {
  disabled: PropTypes.bool,
  mode: PropTypes.oneOf(['compact', 'expanded']),
  onAttachmentClick: PropTypes.func,
  onRemoveFile: PropTypes.func,
  attachedFiles: PropTypes.array,
  usePrivacyMode: PropTypes.bool,
  onDropdownClose: PropTypes.func
};

export default React.memo(ContentSelector);
