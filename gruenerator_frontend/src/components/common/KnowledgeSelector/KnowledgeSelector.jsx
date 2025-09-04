import React, { lazy, Suspense, useState, useEffect, useMemo, memo, useCallback } from 'react';
import PropTypes from 'prop-types';
const Select = lazy(() => import('react-select'));
import FormSelect from '../Form/Input/FormSelect';
import FormFieldWrapper from '../Form/Input/FormFieldWrapper';
import { useGeneratorKnowledgeStore } from '../../../stores/core/generatorKnowledgeStore';
import { useGroups, useAllGroupsContent } from '../../../features/auth/utils/groupsUtils';
import { useBetaFeatures } from '../../../hooks/useBetaFeatures';
import { useDocumentsStore } from '../../../stores/documentsStore';
import { useAuth } from '../../../hooks/useAuth';
import { useInstructionsStatusForType } from '../../../features/auth/hooks/useInstructionsStatus';
import { FaBrain } from 'react-icons/fa';
import { HiDocument, HiDocumentText } from 'react-icons/hi';

// Knowledge type icons (SVG icons as components) - Extracted outside for performance
const KnowledgeIcon = memo(({ type, size = 16 }) => {
  const iconClass = "knowledge-option__icon";
  
  switch (type) {
    case 'instruction':
    case 'anweisung':
      return (
        <svg className={iconClass} width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
          <polyline points="14,2 14,8 20,8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
          <polyline points="10,9 9,9 8,9"/>
        </svg>
      );
    case 'knowledge':
    case 'wissen':
    case 'group_knowledge':
      return (
        <FaBrain className={iconClass} size={size} />
      );
    case 'document':
    case 'dokument':
    case 'user_document':
    case 'group_document':
      return (
        <HiDocument className={iconClass} size={size} />
      );
    case 'text':
    case 'user_text':
      return (
        <HiDocumentText className={iconClass} size={size} />
      );
    default:
      return (
        <svg className={iconClass} width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="12" r="10"/>
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      );
  }
});

// PropTypes for KnowledgeIcon
KnowledgeIcon.propTypes = {
  type: PropTypes.string,
  size: PropTypes.number
};

// Source tag component for showing content origin
const SourceTag = memo(({ source, groupName }) => {
  if (source === 'user') {
    return <span className="source-tag source-tag--user">Mein Profil</span>;
  }
  return (
    <span className="source-tag source-tag--group">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="source-tag__icon">
        <path d="M16 4c0-1.11.89-2 2-2s2 .89 2 2c0 1.11-.89 2-2 2s-2-.89-2-2zM4 18v-1c0-2.66 5.33-4 8-4s8 1.34 8 4v1H4zM12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4z"/>
      </svg>
      {groupName}
    </span>
  );
});

SourceTag.propTypes = {
  source: PropTypes.oneOf(['user', 'group']).isRequired,
  groupName: PropTypes.string
};

/**
 * ProfileSelector - Separate component for custom instructions only
 */
const ProfileSelector = ({ disabled = false, tabIndex, instructionType = 'social' }) => {
  const { 
    source, 
    setSource
  } = useGeneratorKnowledgeStore();
  
  // Get groups and beta features for source selection
  const { isLoading: isLoadingBetaFeatures } = useBetaFeatures();
  const anweisungenBetaEnabled = true;
  const { 
    userGroups: groups, 
    isLoadingGroups, 
    errorGroups: groupsError 
  } = useGroups();
  
  // Handle profile source selection (for instructions only)
  const handleSourceChange = useCallback((e) => {
    const value = e.target.value;
    
    if (value === 'neutral') {
      setSource({ type: 'neutral', id: null, name: null });
    } else if (value === 'user') {
      setSource({ type: 'user', id: null, name: 'Mein Profil' });
    } else if (value.startsWith('group-')) {
      const groupId = value.substring("group-".length);
      const selectedGroup = groups.find(g => g.id === groupId);
      if (selectedGroup) {
        setSource({ type: 'group', id: selectedGroup.id, name: selectedGroup.name });
      }
    }
  }, [groups, setSource]);

  // Get current source value for the select
  const getCurrentSourceValue = useCallback(() => {
    if (source.type === 'neutral') return 'neutral';
    if (source.type === 'user') return 'user';
    if (source.type === 'group') return `group-${source.id}`;
    return 'neutral';
  }, [source.type, source.id]);

  // Memoize source options array
  const sourceOptions = useMemo(() => {
    const baseOptions = [
      { value: 'neutral', label: 'Neutral' },
      { value: 'user', label: 'Mein Profil' }
    ];

    const loadingOptions = [];
    if (isLoadingBetaFeatures) {
      loadingOptions.push({ value: '', label: 'Lade Beta Features...', disabled: true });
    }
    if (isLoadingGroups) {
      loadingOptions.push({ value: '', label: 'Lade Gruppen...', disabled: true });
    }
    if (groupsError && !isLoadingGroups) {
      loadingOptions.push({ value: '', label: 'Fehler beim Laden der Gruppen', disabled: true });
    }

    const groupOptions = (groups && !isLoadingGroups && !groupsError) 
      ? groups.map(group => ({
          value: `group-${group.id}`,
          label: `${group.name} Profil`
        }))
      : [];

    return [...baseOptions, ...loadingOptions, ...groupOptions];
  }, [groups, isLoadingGroups, isLoadingBetaFeatures, groupsError]);
  
  return (
    <div className="profile-selector">
      <FormSelect
        name="profile-source"
        label="Profil für Anweisungen auswählen"
        options={sourceOptions}
        value={getCurrentSourceValue()}
        onChange={handleSourceChange}
        disabled={isLoadingGroups || isLoadingBetaFeatures || !anweisungenBetaEnabled || disabled}
        placeholder=""
        tabIndex={tabIndex}
        helpText="Wähle das Profil aus, dessen Anweisungen verwendet werden sollen"
      />
    </div>
  );
};

ProfileSelector.propTypes = {
  disabled: PropTypes.bool,
  tabIndex: PropTypes.number,
  instructionType: PropTypes.oneOf(['antrag', 'social', 'universal', 'gruenejugend'])
};

/**
 * EnhancedKnowledgeSelector - Unified knowledge selector for all sources with React Portal
 */
const EnhancedKnowledgeSelector = ({ 
  onKnowledgeSelection, 
  disabled = false,
  tabIndex
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
  
  const { fetchDocuments, isLoading: documentsLoading } = useDocumentsStore();
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
  
  // Removed console.log for performance

  // Load user documents and texts
  const { documents: documentsStoreData } = useDocumentsStore();
  
  useEffect(() => {
    if (enableDocuments && documentsStoreData.length === 0 && !documentsLoading) {
      fetchDocuments();
    }
  }, [enableDocuments, documentsStoreData.length, documentsLoading, fetchDocuments]);

  useEffect(() => {
    if (enableTexts) {
      fetchTexts();
    }
  }, [enableTexts, fetchTexts]);

  // State for current search term to trigger re-sorting
  const [currentSearchTerm, setCurrentSearchTerm] = useState('');

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
        label: item.title,
        type: item.type || 'knowledge',
        itemType: 'knowledge',
        originalId: item.id,
        sourceType: 'user',
        sourceTag: { source: 'user' },
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
          label: doc.title,
          type: 'user_document',
          itemType: 'document',
          originalId: doc.id,
          sourceType: 'user',
          sourceTag: { source: 'user' },
          subtitle: doc.filename,
          searchableContent: `${doc.title} ${doc.filename || ''} ${doc.ocr_text || ''}`.toLowerCase(),
          created_at: doc.created_at || null
        }));
      allOptions.push(...userDocumentItems);
    }
    
    // User texts
    if (enableTexts && availableTexts.length > 0) {
      const userTextItems = availableTexts.map(text => ({
        value: `text_${text.id}`,
        label: text.title,
        type: 'user_text',
        itemType: 'text',
        originalId: text.id,
        sourceType: 'user',
        sourceTag: { source: 'user' },
        subtitle: text.type || 'Text',
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
          sourceTag: { source: 'group', groupName: item.groupName },
          created_at: item.created_at || null
        };
        
        // Determine item type and create appropriate option
        if (item.type === 'knowledge' || (!item.filename && !item.full_content)) {
          return {
            ...baseItem,
            value: `group_knowledge_${item.id}`,
            label: item.title,
            type: 'group_knowledge',
            itemType: 'knowledge',
            searchableContent: `${item.title} ${item.content || ''}`.toLowerCase()
          };
        } else if (item.filename || item.ocr_text) {
          return {
            ...baseItem,
            value: `group_document_${item.id}`,
            label: item.title,
            type: 'group_document',
            itemType: 'document',
            subtitle: item.filename,
            searchableContent: `${item.title} ${item.filename || ''} ${item.ocr_text || ''}`.toLowerCase()
          };
        } else {
          return {
            ...baseItem,
            value: `group_text_${item.id}`,
            label: item.title,
            type: 'group_text',
            itemType: 'text',
            subtitle: item.type || 'Text',
            searchableContent: `${item.title} ${item.type || ''} ${item.full_content || item.content || ''}`.toLowerCase()
          };
        }
      });
      allOptions.push(...groupItems);
    }
    
    return allOptions;
  }, [enableKnowledge, enableDocuments, enableTexts, availableKnowledge, documentsStoreData, availableTexts, allGroupContent]);

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

  // Enhanced option formatter with source tags - title only for compact display
  const formatOptionLabel = useCallback(({ type, label, sourceTag }, { context }) => {
    // Show enhanced layout only in the dropdown menu
    if (context === 'menu') {
      const highlightedLabel = currentSearchTerm ? 
        highlightSearchTerm(label, currentSearchTerm) : label;
      
      return (
        <div className="knowledge-option-enhanced">
          <KnowledgeIcon type={type} size={16} />
          <div className="knowledge-option__content">
            <span 
              className="knowledge-option__label"
              dangerouslySetInnerHTML={{ __html: highlightedLabel }}
            />
          </div>
          {sourceTag && <SourceTag {...sourceTag} />}
        </div>
      );
    }
    // For selected values, show text with source indicator
    return (
      <span className="knowledge-selected-option">
        {label}
        {sourceTag && sourceTag.source === 'group' && (
          <span className="knowledge-selected-source">[{sourceTag.groupName}]</span>
        )}
      </span>
    );
  }, [currentSearchTerm, highlightSearchTerm]);

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


  // Note: Document preloading is now handled by useKnowledge hook in parent components
  // This eliminates the flash of "keine dokumente vorhanden" message
  // Note: Document selection clearing is handled by store reset in useKnowledge hook


  // Note: Selection state is now managed by the store, no local state reset needed

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
      <FormFieldWrapper
        label="Wissen, Dokumente & Texte auswählen"
        helpText="Wähle Wissen, Dokumente und Texte aus"
        htmlFor="enhanced-knowledge-select"
      >
        <Suspense fallback={<div>Loading...</div>}><Select
          inputId="enhanced-knowledge-select"
          classNamePrefix="enhanced-knowledge-select"
          className="enhanced-knowledge-select"
          isMulti
          options={knowledgeOptions}
          // Allow placeholder to hyphenate and wrap: Aus­wählen (soft hyphen)
          placeholder={"Aus­wählen"}
          isDisabled={disabled}
          formatOptionLabel={formatOptionLabel}
          filterOption={() => true} // Disable default filtering since we handle it
          onInputChange={(inputValue) => {
            setCurrentSearchTerm(inputValue);
          }}
          value={[
            // Find selected options from all sources
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
          // React Portal implementation for larger dropdown
          menuPortalTarget={document.body}
          menuPosition="fixed"
          tabIndex={tabIndex}
          noOptionsMessage={() => {
            if (currentSearchTerm && currentSearchTerm.trim()) {
              return `Keine Ergebnisse für "${currentSearchTerm}"`;
            }
            if (isLoadingAllGroups || documentsLoading || isLoadingTexts) {
              return 'Lade verfügbare Inhalte...';
            }
            if (hasGroupErrors) {
              return 'Fehler beim Laden einiger Gruppeninhalte';
            }
            return 'Keine Inhalte verfügbar. Erstelle Wissen, lade Dokumente hoch oder teile Inhalte mit Gruppen.';
          }}
        /></Suspense>
      </FormFieldWrapper>

      {/* Loading status for groups */}
      {isLoadingAllGroups && (
        <div className="enhanced-knowledge-selector__loading">
          Lade Gruppeninhalte...
        </div>
      )}

      {/* Error status for groups */}
      {groupContentErrors.length > 0 && (
        <div className="enhanced-knowledge-selector__errors">
          Einige Gruppeninhalte konnten nicht geladen werden: {groupContentErrors.map(e => e.groupName).join(', ')}
        </div>
      )}

      {/* Show message when no content is available */}
      {knowledgeOptions.length === 0 && !disabled && !isLoadingAllGroups && (
        <p className="enhanced-knowledge-selector__no-options">
          Keine Inhalte verfügbar.<br />
          Erstelle Wissen in deinem Profil, lade Dokumente hoch, generiere Texte oder teile Inhalte mit Gruppen.
        </p>
      )}

      {/* Document Content Extraction Status */}
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
  tabIndex: PropTypes.number
};

EnhancedKnowledgeSelector.displayName = 'EnhancedKnowledgeSelector';

/**
 * Main KnowledgeSelector component - now combines ProfileSelector and EnhancedKnowledgeSelector
 */
const KnowledgeSelector = ({ 
  onKnowledgeSelection, 
  disabled = false,
  tabIndex,
  sourceTabIndex,
  showProfileSelector = true,
  instructionType: propInstructionType = null, // Optional override prop
  ...rest
}) => {
  const { user } = useAuth();
  
  // Get instruction type from store (set by useKnowledge hook) or prop override
  const { instructionType: storeInstructionType } = useGeneratorKnowledgeStore();
  const instructionType = propInstructionType || storeInstructionType;
  
  // Check if user has instructions for this specific generator type
  const { data: instructionsStatus, isLoading: isLoadingStatus } = useInstructionsStatusForType(
    instructionType,
    { enabled: !!(instructionType && user?.id) }
  );
  
  // Determine if ProfileSelector should be shown
  const shouldShowProfileSelector = useMemo(() => {
    // Allow prop override to force hide
    if (!showProfileSelector) return false;
    
    // If no instructionType provided, use legacy behavior (always show)
    if (!instructionType) return true;
    
    // While loading, show based on prop default
    if (isLoadingStatus) return showProfileSelector;
    
    // Show only if instructions exist for this specific type
    return instructionsStatus?.hasAnyInstructions || false;
  }, [showProfileSelector, instructionType, isLoadingStatus, instructionsStatus]);
  
  if (!user) {
    return null;
  }

  return (
    <div className="knowledge-selector-wrapper">
      {/* Profile selector for instructions only - conditionally rendered based on instruction existence */}
      {shouldShowProfileSelector && (
        <ProfileSelector 
          disabled={disabled}
          tabIndex={sourceTabIndex || tabIndex}
          instructionType={instructionType}
        />
      )}
      
      {/* Enhanced knowledge selector for all content */}
      <EnhancedKnowledgeSelector
        onKnowledgeSelection={onKnowledgeSelection}
        disabled={disabled}
        tabIndex={tabIndex}
        {...rest}
      />
    </div>
  );
};

KnowledgeSelector.propTypes = {
  onKnowledgeSelection: PropTypes.func,
  disabled: PropTypes.bool,
  tabIndex: PropTypes.number,
  sourceTabIndex: PropTypes.number,
  showProfileSelector: PropTypes.bool,
  instructionType: PropTypes.oneOf(['antrag', 'social', 'universal', 'gruenejugend'])
};

KnowledgeSelector.displayName = 'KnowledgeSelector';

// Export both components
export { ProfileSelector, EnhancedKnowledgeSelector };
export default memo(KnowledgeSelector); 
