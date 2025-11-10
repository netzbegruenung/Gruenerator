import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import '../../assets/styles/components/ui/FeatureIcons.css';
import '../../assets/styles/components/ui/knowledge-selector.css';
import PropTypes from 'prop-types';
import { HiGlobeAlt, HiEye, HiPaperClip, HiAdjustments, HiLightningBolt, HiClipboardList, HiUpload, HiCollection, HiChatAlt2 } from 'react-icons/hi';
import AttachedFilesList from './AttachedFilesList';
import { validateFilesForPrivacyMode, getPDFPageCount } from '../../utils/fileAttachmentUtils';
import { useGeneratorKnowledgeStore } from '../../stores/core/generatorKnowledgeStore';
import { useInstructionsStatusForType } from '../../features/auth/hooks/useInstructionsStatus';
import { useAuth } from '../../hooks/useAuth';
import { useGroups, useAllGroupsContent } from '../../features/groups/hooks/useGroups';
import { useBetaFeatures } from '../../hooks/useBetaFeatures';
import { useDocumentsStore } from '../../stores/documentsStore';
import EnhancedSelect from './EnhancedSelect';
import DropdownPortal from './DropdownPortal';

/**
 * EnhancedKnowledgeSelector - Unified knowledge selector for all sources with React Portal
 */
const EnhancedKnowledgeSelector = ({
  onKnowledgeSelection,
  disabled = false,
  tabIndex,
  disableMenuPortal = false
}) => {
  const {
    availableKnowledge,
    selectedKnowledgeIds,
    toggleSelection,
    // Document state
    selectedDocumentIds,
    toggleDocumentSelection,
    isExtractingDocumentContent,
    documentExtractionInfo,
    isLoadingDocuments,
    // Text state
    availableTexts,
    selectedTextIds,
    isLoadingTexts,
    toggleTextSelection,
    fetchTexts,
    // UI Configuration
    uiConfig
  } = useGeneratorKnowledgeStore();

  // Extract UI config values for cleaner code
  const {
    enableKnowledge = false,
    enableDocuments = false,
    enableTexts = false
  } = uiConfig;

  // Get user groups and authentication
  const {
    userGroups: groups
  } = useGroups();

  const { user } = useAuth();

  // Load content from all groups using the new hook
  const {
    allGroupContent,
    groupContentErrors,
    hasGroupErrors,
    isLoadingAllGroupsContent,
    isErrorAllGroupsContent,
    errorAllGroupsContent
  } = useAllGroupsContent({
    isActive: true,
    enabled: true // Always load group content
  });

  // For backwards compatibility, alias the loading state
  const isLoadingAllGroups = isLoadingAllGroupsContent;

  // Derived state: Combined loading state for all content sources
  const isLoadingAnyContent = useMemo(() => {
    return isLoadingAllGroups || isLoadingTexts || isLoadingDocuments;
  }, [isLoadingAllGroups, isLoadingTexts, isLoadingDocuments]);

  // Get documents from generatorKnowledgeStore (now properly synced by useKnowledge)
  const {
    availableDocuments: documentsFromKnowledgeStore
  } = useGeneratorKnowledgeStore();

  // Use documents from the knowledge store which are synced from documentsStore
  const documentsStoreData = documentsFromKnowledgeStore;

  useEffect(() => {
    if (enableTexts) {
      fetchTexts();
    }
  }, [enableTexts, fetchTexts]);

  // State for current search term to trigger re-sorting
  const [currentSearchTerm, setCurrentSearchTerm] = useState('');

  // Helper function to truncate long titles
  const truncateTitle = useCallback((title, maxLength = 80) => {
    if (!title || title.length <= maxLength) return title;
    return title.substring(0, maxLength) + '...';
  }, []);

  // Relevance scoring function for search ranking
  const calculateRelevanceScore = useCallback((option, searchTerm) => {
    if (!searchTerm) return 0;

    const title = option.label.toLowerCase();
    const content = option.searchableContent || '';
    const searchTermLower = searchTerm.toLowerCase();

    let score = 0;

    // 1. Exact title match (highest priority)
    if (title === searchTermLower) {
      score += 100;
    }
    // 2. Title starts with search term
    else if (title.startsWith(searchTermLower)) {
      score += 80;
    }
    // 3. Title contains search term
    else if (title.includes(searchTermLower)) {
      score += 50;
    }

    // 4. Content frequency scoring
    const occurrences = (content.match(new RegExp(searchTermLower, 'g')) || []).length;
    score += Math.min(occurrences * 5, 25); // Max 25 points for frequency

    // 5. Position scoring (earlier occurrence = higher score)
    const firstIndex = content.indexOf(searchTermLower);
    if (firstIndex !== -1) {
      const positionScore = Math.max(10 - (firstIndex / content.length) * 10, 1);
      score += positionScore;
    }

    // 6. Content type priority
    if (option.itemType === 'knowledge') score += 10;
    else if (option.itemType === 'text') score += 5;
    // documents get no bonus (lowest priority)

    // 7. Multi-word search support
    const searchWords = searchTermLower.split(' ').filter(word => word.length > 1);
    if (searchWords.length > 1) {
      const wordMatches = searchWords.filter(word => content.includes(word)).length;
      score += (wordMatches / searchWords.length) * 15; // Bonus for multi-word matches
    }

    return score;
  }, []);

  // Helper function to highlight search terms in text
  const highlightSearchTerm = useCallback((text, searchTerm) => {
    if (!searchTerm || !searchTerm.trim()) return text;

    const terms = searchTerm.toLowerCase().split(' ').filter(term => term.length > 0);
    let highlightedText = text;

    terms.forEach(term => {
      const regex = new RegExp(`(${term})`, 'gi');
      highlightedText = highlightedText.replace(regex, '<mark>$1</mark>');
    });

    return highlightedText;
  }, []);

  // Unified options from all sources (user + all groups)
  const allKnowledgeOptions = useMemo(() => {
    const allOptions = [];

    // User knowledge
    if (enableKnowledge && availableKnowledge.length > 0) {
      const userKnowledgeItems = availableKnowledge.map(item => ({
        value: `knowledge_${item.id}`,
        label: truncateTitle(item.title),
        iconType: item.type || 'knowledge',
        tag: { label: 'Mein Profil', variant: 'user' },
        itemType: 'knowledge',
        originalId: item.id,
        sourceType: 'user',
        searchableContent: `${item.title} ${item.content || ''}`.toLowerCase(),
        created_at: item.created_at || null
      }));
      allOptions.push(...userKnowledgeItems);
    }

    // User documents
    if (enableDocuments && documentsStoreData.length > 0) {
      const userDocumentItems = documentsStoreData
        .filter(doc => doc.status === 'completed')
        .map(doc => ({
          value: `document_${doc.id}`,
          label: truncateTitle(doc.title),
          iconType: 'user_document',
          tag: { label: 'Mein Profil', variant: 'user' },
          itemType: 'document',
          originalId: doc.id,
          sourceType: 'user',
          searchableContent: `${doc.title} ${doc.filename || ''} ${doc.ocr_text || ''}`.toLowerCase(),
          created_at: doc.created_at || null
        }));
      allOptions.push(...userDocumentItems);
    }

    // User texts
    if (enableTexts && availableTexts.length > 0) {
      const userTextItems = availableTexts.map(text => ({
        value: `text_${text.id}`,
        label: truncateTitle(text.title),
        iconType: 'user_text',
        tag: { label: 'Mein Profil', variant: 'user' },
        itemType: 'text',
        originalId: text.id,
        sourceType: 'user',
        searchableContent: `${text.title} ${text.type || ''} ${text.full_content || text.content || ''}`.toLowerCase(),
        created_at: text.created_at || null
      }));
      allOptions.push(...userTextItems);
    }

    // Group content from all groups
    if (allGroupContent.length > 0) {
      const groupItems = allGroupContent.map(item => {
        const baseItem = {
          originalId: item.id,
          sourceType: 'group',
          tag: { label: item.groupName, variant: 'group' },
          created_at: item.created_at || null
        };

        // Determine item type and create appropriate option
        if (item.type === 'knowledge' || (!item.filename && !item.full_content)) {
          return {
            ...baseItem,
            value: `group_knowledge_${item.id}`,
            label: truncateTitle(item.title),
            iconType: 'group_knowledge',
            itemType: 'knowledge',
            searchableContent: `${item.title} ${item.content || ''}`.toLowerCase()
          };
        } else if (item.filename || item.ocr_text) {
          return {
            ...baseItem,
            value: `group_document_${item.id}`,
            label: truncateTitle(item.title),
            iconType: 'group_document',
            itemType: 'document',
            searchableContent: `${item.title} ${item.filename || ''} ${item.ocr_text || ''}`.toLowerCase()
          };
        } else {
          return {
            ...baseItem,
            value: `group_text_${item.id}`,
            label: truncateTitle(item.title),
            iconType: 'group_text',
            itemType: 'text',
            searchableContent: `${item.title} ${item.type || ''} ${item.full_content || item.content || ''}`.toLowerCase()
          };
        }
      });
      allOptions.push(...groupItems);
    }

    return allOptions;
  }, [enableKnowledge, enableDocuments, enableTexts, availableKnowledge, documentsStoreData, availableTexts, allGroupContent, truncateTitle]);

  // Sorted and filtered options based on current search term
  const knowledgeOptions = useMemo(() => {
    if (!currentSearchTerm || currentSearchTerm.trim() === '') {
      // No search term - return all options sorted with knowledge items first
      return allKnowledgeOptions.sort((a, b) => {
        // Primary sort: knowledge items first (user knowledge, then group knowledge)
        const getPriority = (item) => {
          if (item.sourceType === 'user' && item.itemType === 'knowledge') return 0;
          if (item.sourceType === 'group' && item.itemType === 'knowledge') return 1;
          if (item.sourceType === 'user' && item.itemType === 'text') return 2;
          if (item.sourceType === 'group' && item.itemType === 'text') return 3;
          if (item.sourceType === 'user' && item.itemType === 'document') return 4;
          if (item.sourceType === 'group' && item.itemType === 'document') return 5;
          return 6; // fallback
        };

        const priorityDiff = getPriority(a) - getPriority(b);
        if (priorityDiff !== 0) return priorityDiff;

        // Secondary sort: recency (newer first)
        const aDate = new Date(a.created_at || 0);
        const bDate = new Date(b.created_at || 0);
        return bDate - aDate;
      });
    }

    const searchTerm = currentSearchTerm.trim();

    // Score and filter options
    const scoredOptions = allKnowledgeOptions
      .map(option => ({
        ...option,
        relevanceScore: calculateRelevanceScore(option, searchTerm)
      }))
      .filter(option => option.relevanceScore > 0) // Only show items with matches
      .sort((a, b) => b.relevanceScore - a.relevanceScore); // Sort by relevance score (highest first)

    return scoredOptions;
  }, [allKnowledgeOptions, currentSearchTerm, calculateRelevanceScore]);


  const handleKnowledgeChange = useCallback((selectedOptions) => {
    const newSelectedValues = selectedOptions ? selectedOptions.map(option => option.value) : [];

    // Separate different types of selections (including group content)
    const newKnowledgeIds = newSelectedValues
      .filter(value => value.startsWith('knowledge_') || value.startsWith('group_knowledge_'))
      .map(value => value.replace(/^(knowledge_|group_knowledge_)/, ''));
    const newDocumentIds = newSelectedValues
      .filter(value => value.startsWith('document_') || value.startsWith('group_document_'))
      .map(value => value.replace(/^(document_|group_document_)/, ''));
    const newTextIds = newSelectedValues
      .filter(value => value.startsWith('text_') || value.startsWith('group_text_'))
      .map(value => value.replace(/^(text_|group_text_)/, ''));

    // Handle knowledge changes (user + group)
    const addedKnowledgeIds = newKnowledgeIds.filter(id => !selectedKnowledgeIds.includes(id));
    const removedKnowledgeIds = selectedKnowledgeIds.filter(id => !newKnowledgeIds.includes(id));

    addedKnowledgeIds.forEach(knowledgeId => {
      // Try to find in user knowledge first, then in group content
      let selectedItem = availableKnowledge.find(item => item.id === knowledgeId);
      if (!selectedItem) {
        selectedItem = allGroupContent.find(item => item.id === knowledgeId);
      }

      if (selectedItem) {
        toggleSelection(knowledgeId);
        if (onKnowledgeSelection) {
          onKnowledgeSelection(selectedItem);
        }
      }
    });

    removedKnowledgeIds.forEach(knowledgeId => {
      toggleSelection(knowledgeId);
    });

    // Handle document changes (user + group)
    const addedDocumentIds = newDocumentIds.filter(id => !selectedDocumentIds.includes(id));
    const removedDocumentIds = selectedDocumentIds.filter(id => !newDocumentIds.includes(id));

    [...addedDocumentIds, ...removedDocumentIds].forEach(documentId => {
      toggleDocumentSelection(documentId);
    });

    // Handle text changes (user + group)
    const addedTextIds = newTextIds.filter(id => !selectedTextIds.includes(id));
    const removedTextIds = selectedTextIds.filter(id => !newTextIds.includes(id));

    [...addedTextIds, ...removedTextIds].forEach(textId => {
      toggleTextSelection(textId);
    });
  }, [selectedKnowledgeIds, selectedDocumentIds, selectedTextIds, availableKnowledge, allGroupContent, toggleSelection, toggleDocumentSelection, toggleTextSelection, onKnowledgeSelection]);

  // Hide component if user is not authenticated
  if (!user) {
    return null;
  }

  // Only hide component if no functionality is enabled
  const hasAnyFeatureEnabled = enableKnowledge || enableDocuments || enableTexts;

  if (!hasAnyFeatureEnabled) {
    return null;
  }

  return (
    <div className="enhanced-knowledge-selector">
      <EnhancedSelect
        label=""
        inputId="enhanced-knowledge-select"
        classNamePrefix="enhanced-knowledge-select"
        className="enhanced-knowledge-select"
        enableTags={true}
        enableIcons={true}
        enableSubtitles={false}
        isMulti
        options={knowledgeOptions}
        placeholder={"Aus­wählen"}
        isDisabled={disabled}
        filterOption={() => true}
        onInputChange={(inputValue) => {
          setCurrentSearchTerm(inputValue);
        }}
        value={[
          ...selectedKnowledgeIds.map(id =>
            allKnowledgeOptions.find(option =>
              option.value === `knowledge_${id}` || option.value === `group_knowledge_${id}`
            )
          ).filter(Boolean),
          ...selectedDocumentIds.map(id =>
            allKnowledgeOptions.find(option =>
              option.value === `document_${id}` || option.value === `group_document_${id}`
            )
          ).filter(Boolean),
          ...selectedTextIds.map(id =>
            allKnowledgeOptions.find(option =>
              option.value === `text_${id}` || option.value === `group_text_${id}`
            )
          ).filter(Boolean)
        ]}
        onChange={handleKnowledgeChange}
        closeMenuOnSelect={false}
        hideSelectedOptions={true}
        isClearable={false}
        isSearchable={true}
        blurInputOnSelect={true}
        openMenuOnFocus={false}
        tabSelectsValue={true}
        captureMenuScroll={false}
        menuShouldBlockScroll={false}
        menuShouldScrollIntoView={false}
        menuPortalTarget={disableMenuPortal ? null : document.body}
        menuPosition={disableMenuPortal ? "absolute" : "fixed"}
        tabIndex={tabIndex}
        noOptionsMessage={() => {
          if (currentSearchTerm && currentSearchTerm.trim()) {
            return `Keine Ergebnisse für "${currentSearchTerm}"`;
          }
          if (isLoadingAnyContent) {
            return 'Lade verfügbare Inhalte...';
          }
          if (hasGroupErrors) {
            return 'Fehler beim Laden einiger Gruppeninhalte';
          }
          return 'Keine Inhalte verfügbar. Erstelle Wissen, lade Dokumente hoch oder teile Inhalte mit Gruppen.';
        }}
      />

      {groupContentErrors.length > 0 && (
        <div className="enhanced-knowledge-selector__errors">
          Einige Gruppeninhalte konnten nicht geladen werden: {groupContentErrors.map(e => e.groupName).join(', ')}
        </div>
      )}

      {knowledgeOptions.length === 0 && !disabled && !isLoadingAnyContent && (
        <p className="enhanced-knowledge-selector__no-options">
          Keine Inhalte verfügbar.<br />
          Erstelle Wissen in deinem Profil, lade Dokumente hoch, generiere Texte oder teile Inhalte mit Gruppen.
        </p>
      )}

      {enableDocuments && selectedDocumentIds.length > 0 && isExtractingDocumentContent && documentExtractionInfo && (
        <div className={`enhanced-knowledge-selector__extraction-status extraction-status--${documentExtractionInfo.type}`}>
          <div className="extraction-status__icon">
            {documentExtractionInfo.type === 'vector_search' && (
              <div className="extraction-status__spinner"></div>
            )}
            {documentExtractionInfo.type === 'success' && '✅'}
            {documentExtractionInfo.type === 'fallback' && '⚠️'}
            {documentExtractionInfo.type === 'error' && '❌'}
          </div>
          <div className="extraction-status__message">
            {documentExtractionInfo.message}
          </div>
        </div>
      )}
    </div>
  );
};

EnhancedKnowledgeSelector.propTypes = {
  onKnowledgeSelection: PropTypes.func,
  disabled: PropTypes.bool,
  tabIndex: PropTypes.number,
  disableMenuPortal: PropTypes.bool
};

EnhancedKnowledgeSelector.displayName = 'EnhancedKnowledgeSelector';

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
  // Debug configuration for toggle issue investigation
  const DEBUG_TOGGLES = {
    enabled: true,           // Master switch
    logClicks: true,         // Button click events
    logStoreUpdates: false,  // Store state changes (handled in store)
    logDropdown: true,       // Dropdown open/close
    logRenders: true,        // Component re-renders
    logTiming: true          // Timestamp deltas
  };

  // Debug logger utility with timestamps and grouped output
  const createDebugLogger = (category) => {
    if (!DEBUG_TOGGLES.enabled) return () => {};

    let lastTimestamp = performance.now();

    return (message, data = {}) => {
      const now = performance.now();
      const delta = (now - lastTimestamp).toFixed(2);

      console.groupCollapsed(
        `%c[${category}] %c${message} %c(+${delta}ms)`,
        'color: #4CAF50; font-weight: bold',
        'color: #2196F3',
        'color: #999; font-size: 0.9em'
      );

      if (Object.keys(data).length > 0) {
        console.table(data);
      }

      console.trace('Stack trace');
      console.groupEnd();

      lastTimestamp = now;
    };
  };

  // Use store for feature toggles instead of props
  const {
    useWebSearch,
    usePrivacyMode,
    useProMode,
    toggleWebSearch,
    togglePrivacyMode,
    toggleProMode,
  } = useGeneratorKnowledgeStore();
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

  // Debug: Track component re-renders
  useEffect(() => {
    if (DEBUG_TOGGLES.logRenders) {
      const logger = createDebugLogger('RENDER');
      logger('FeatureIcons re-rendered', {
        'Privacy Mode': usePrivacyMode,
        'Pro Mode': useProMode,
        'Active Dropdown': activeDropdown || 'none',
        'Clicked Icon': clickedIcon || 'none'
      });
    }
  }, [usePrivacyMode, useProMode, activeDropdown, clickedIcon]);

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
             (useProMode && <HiLightningBolt className="feature-icons__icon" />) ||
             (<HiAdjustments className="feature-icons__icon" />)}
            <span className="feature-icons-button__label">
              {usePrivacyMode ? 'Privacy' : (useProMode ? 'Pro' : 'Ausbalanciert')}
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
      <DropdownPortal
        triggerRef={balancedContainerRef}
        isOpen={activeDropdown === 'balanced'}
        onClose={() => setActiveDropdown(null)}
        className="balanced-dropdown-inline open"
        width="trigger"
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
            <span className="balanced-dropdown-desc">Ideal für die meisten Aufgaben. Läuft auf EU-Servern.</span>
          </div>
        </button>

        <button
          className={`balanced-dropdown-item ${usePrivacyMode ? 'active' : ''}`}
          onClick={(event) => {
            const logger = createDebugLogger('PRIVACY_CLICK');

            if (DEBUG_TOGGLES.logClicks) {
              logger('Privacy button clicked', {
                'Current Privacy': usePrivacyMode,
                'Current Pro': useProMode,
                'Dropdown': activeDropdown,
                'Event Type': event.type
              });
            }

            event.stopPropagation();

            handleIconClick(event, 'privacy', () => {
              if (DEBUG_TOGGLES.logClicks) {
                logger('Privacy callback executing', {
                  'Before Toggle': usePrivacyMode,
                  'Will Close Dropdown': true
                });
              }

              togglePrivacyMode();

              if (DEBUG_TOGGLES.logClicks) {
                logger('After togglePrivacyMode() call');
              }

              setActiveDropdown(null);

              if (DEBUG_TOGGLES.logClicks) {
                logger('Dropdown closed');
              }
            });
          }}
          type="button"
        >
          <HiEye className="balanced-dropdown-icon" />
          <div className="balanced-dropdown-content">
            <span className="balanced-dropdown-title">Privacy</span>
            <span className="balanced-dropdown-desc">Nutzt ein selbstgehostetes Sprachmodell bei der Netzbegrünung (deutsche Server).</span>
          </div>
        </button>

        <button
          className={`balanced-dropdown-item ${useProMode ? 'active' : ''}`}
          onClick={(event) => {
            const logger = createDebugLogger('PRO_CLICK');

            if (DEBUG_TOGGLES.logClicks) {
              logger('Pro button clicked', {
                'Current Privacy': usePrivacyMode,
                'Current Pro': useProMode,
                'Dropdown': activeDropdown,
                'Event Type': event.type
              });
            }

            event.stopPropagation();

            handleIconClick(event, 'pro', () => {
              if (DEBUG_TOGGLES.logClicks) {
                logger('Pro callback executing', {
                  'Before Toggle': useProMode,
                  'Will Close Dropdown': true
                });
              }

              toggleProMode();

              if (DEBUG_TOGGLES.logClicks) {
                logger('After toggleProMode() call');
              }

              setActiveDropdown(null);

              if (DEBUG_TOGGLES.logClicks) {
                logger('Dropdown closed');
              }
            });
          }}
          type="button"
        >
          <HiLightningBolt className="balanced-dropdown-icon" />
          <div className="balanced-dropdown-content">
            <span className="balanced-dropdown-title">Pro</span>
            <span className="balanced-dropdown-desc">Nutzt ein fortgeschrittenes Sprachmodell – ideal für komplexere Texte.</span>
          </div>
        </button>
      </DropdownPortal>

      {/* Inline Content Dropdown */}
      <DropdownPortal
        triggerRef={contentContainerRef}
        isOpen={activeDropdown === 'content'}
        onClose={() => setActiveDropdown(null)}
        className="content-dropdown-inline open"
        width="trigger"
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
          <div className="content-dropdown-knowledge-wrapper content-dropdown-knowledge-wrapper--inline">
            <EnhancedKnowledgeSelector
              disabled={isValidatingFiles}
              tabIndex={-1}
              disableMenuPortal={false}
            />
          </div>
        </div>
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
        </div>
      )}

      <AttachedFilesList
        files={attachedFiles}
        onRemoveFile={onRemoveFile}
        fileMetadata={fileMetadata}
        privacyModeActive={usePrivacyMode}
      />
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
