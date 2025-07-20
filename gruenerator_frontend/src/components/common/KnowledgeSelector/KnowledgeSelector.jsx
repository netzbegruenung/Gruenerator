import React, { useState, useEffect, useMemo, memo, useCallback } from 'react';
import PropTypes from 'prop-types';
import Select from 'react-select';
import FormSelect from '../Form/Input/FormSelect';
import FormFieldWrapper from '../Form/Input/FormFieldWrapper';
import { useGeneratorKnowledgeStore } from '../../../stores/core/generatorKnowledgeStore';
import { useGroups } from '../../../features/auth/utils/groupsUtils';
import { useBetaFeatures } from '../../../hooks/useBetaFeatures';
import { useDocumentsStore } from '../../../stores/documentsStore';
import { useAuth } from '../../../hooks/useAuth';

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
      return (
        <svg className={iconClass} width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H6.5A2.5 2.5 0 0 0 4 4.5v15z"/>
          <path d="M4 11h16"/>
          <path d="M4 7h16"/>
        </svg>
      );
    case 'document':
    case 'dokument':
    case 'user_document':
      return (
        <svg className={iconClass} width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
          <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-7-7z"/>
          <polyline points="13,2 13,9 20,9"/>
        </svg>
      );
    case 'text':
    case 'user_text':
      return (
        <svg className={iconClass} width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
          <polyline points="14,2 14,8 20,8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
          <line x1="12" y1="9" x2="8" y2="9"/>
        </svg>
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

/**
 * KnowledgeSelector-Komponente zur Anzeige und Auswahl von Wissen.
 */
const KnowledgeSelector = ({ 
  onKnowledgeSelection, 
  disabled = false,
  tabIndex,
  sourceTabIndex,
  documentTabIndex
}) => {
  const { 
    source, 
    setSource,
    availableKnowledge, 
    selectedKnowledgeIds, 
    toggleSelection,
    // New: Document state
    availableDocuments,
    selectedDocumentIds,
    isLoadingDocuments,
    setAvailableDocuments,
    setLoadingDocuments,
    toggleDocumentSelection,
    handleDocumentLoadError,
    isExtractingDocumentContent,
    documentExtractionInfo,
    // New: Text state
    availableTexts,
    selectedTextIds,
    isLoadingTexts,
    setAvailableTexts,
    setLoadingTexts,
    toggleTextSelection,
    handleTextLoadError,
    fetchTexts,
    // UI Configuration
    uiConfig
  } = useGeneratorKnowledgeStore();

  // Extract UI config values for cleaner code
  const {
    enableKnowledge = false,
    enableDocuments = false,
    enableTexts = false,
    enableSourceSelection = false
  } = uiConfig;

  
  // Get groups and beta features for source selection
  const { getBetaFeatureState, isLoading: isLoadingBetaFeatures } = useBetaFeatures();
  const anweisungenBetaEnabled = true;
  const { 
    userGroups: groups, 
    isLoadingGroups, 
    errorGroups: groupsError 
  } = useGroups();
  
  // Get documents store and auth for document fetching
  const { fetchDocuments, isLoading: documentsLoading } = useDocumentsStore();
  const { user } = useAuth();
  
  // Removed console.log for performance

  // Handle knowledge source selection
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

  // Get current source value for the select - memoized for performance
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

  // Memoize expensive computations to prevent unnecessary re-renders
  // Merge knowledge and documents into single options array when user source is selected
  const baseKnowledgeOptions = useMemo(() => {
    const knowledgeItems = availableKnowledge.map(item => ({
      value: `knowledge_${item.id}`,
      label: item.title,
      type: item.type || 'knowledge',
      itemType: 'knowledge',
      originalId: item.id,
      searchableContent: `${item.title} ${item.content || ''}`.toLowerCase(),
      created_at: item.created_at || null
    }));
    
    // Only include documents when source is 'user' and documents are available
    const documentItems = (source.type === 'user' && enableDocuments) 
      ? availableDocuments.map(doc => ({
          value: `document_${doc.id}`,
          label: doc.title,
          type: 'user_document',
          itemType: 'document',
          originalId: doc.id,
          subtitle: doc.filename,
          searchableContent: `${doc.title} ${doc.filename || ''} ${doc.ocr_text || ''}`.toLowerCase(),
          created_at: doc.created_at || null
        }))
      : [];
    
    // Only include texts when source is 'user' and texts are available
    const textItems = (source.type === 'user' && enableTexts) 
      ? availableTexts.map(text => ({
          value: `text_${text.id}`,
          label: text.title,
          type: 'user_text',
          itemType: 'text',
          originalId: text.id,
          subtitle: text.type || 'Text',
          searchableContent: `${text.title} ${text.type || ''} ${text.full_content || text.content || ''}`.toLowerCase(),
          created_at: text.created_at || null
        }))
      : [];
    
    const allOptions = [...knowledgeItems, ...documentItems, ...textItems];
    
    
    return allOptions;
  }, [availableKnowledge, availableDocuments, availableTexts, source.type, enableDocuments, enableTexts]);

  // Sorted and filtered options based on current search term
  const knowledgeOptions = useMemo(() => {
    if (!currentSearchTerm || currentSearchTerm.trim() === '') {
      // No search term - return all options sorted by type priority and recency
      return baseKnowledgeOptions.sort((a, b) => {
        // Primary sort: content type priority
        const typeOrder = { knowledge: 0, text: 1, document: 2 };
        const typeDiff = (typeOrder[a.itemType] || 3) - (typeOrder[b.itemType] || 3);
        if (typeDiff !== 0) return typeDiff;
        
        // Secondary sort: recency (newer first)
        const aDate = new Date(a.created_at || 0);
        const bDate = new Date(b.created_at || 0);
        return bDate - aDate;
      });
    }
    
    const searchTerm = currentSearchTerm.trim();
    
    // Score and filter options
    const scoredOptions = baseKnowledgeOptions
      .map(option => ({
        ...option,
        relevanceScore: calculateRelevanceScore(option, searchTerm)
      }))
      .filter(option => option.relevanceScore > 0) // Only show items with matches
      .sort((a, b) => b.relevanceScore - a.relevanceScore); // Sort by relevance score (highest first)
    
    
    return scoredOptions;
  }, [baseKnowledgeOptions, currentSearchTerm, calculateRelevanceScore]);

  // Memoized option formatter for performance with search highlighting
  const formatOptionLabel = useCallback(({ type, label, subtitle, relevanceScore }, { context }) => {
    // Show icons only in the dropdown menu, not in selected values to save space
    if (context === 'menu') {
      const highlightedLabel = currentSearchTerm ? 
        highlightSearchTerm(label, currentSearchTerm) : label;
      const highlightedSubtitle = currentSearchTerm && subtitle ? 
        highlightSearchTerm(subtitle, currentSearchTerm) : subtitle;
      
      return (
        <div className="knowledge-option">
          <KnowledgeIcon type={type} size={16} />
          <div className="knowledge-option__content">
            <span 
              className="knowledge-option__label"
              dangerouslySetInnerHTML={{ __html: highlightedLabel }}
            />
            {subtitle && (
              <span 
                className="knowledge-option__subtitle"
                dangerouslySetInnerHTML={{ __html: highlightedSubtitle }}
              />
            )}
          </div>
        </div>
      );
    }
    // For selected values, show only text without highlighting
    return <span>{label}</span>;
  }, [currentSearchTerm, highlightSearchTerm]);

  const handleKnowledgeChange = useCallback((selectedOptions) => {
    const newSelectedValues = selectedOptions ? selectedOptions.map(option => option.value) : [];
    
    // Separate knowledge, document, and text selections
    const newKnowledgeIds = newSelectedValues
      .filter(value => value.startsWith('knowledge_'))
      .map(value => value.replace('knowledge_', ''));
    const newDocumentIds = newSelectedValues
      .filter(value => value.startsWith('document_'))
      .map(value => value.replace('document_', ''));
    const newTextIds = newSelectedValues
      .filter(value => value.startsWith('text_'))
      .map(value => value.replace('text_', ''));
    
    // Handle knowledge changes
    const addedKnowledgeIds = newKnowledgeIds.filter(id => !selectedKnowledgeIds.includes(id));
    const removedKnowledgeIds = selectedKnowledgeIds.filter(id => !newKnowledgeIds.includes(id));
    
    addedKnowledgeIds.forEach(knowledgeId => {
      const selectedItem = availableKnowledge.find(item => item.id === knowledgeId);
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
    
    // Handle document changes
    const addedDocumentIds = newDocumentIds.filter(id => !selectedDocumentIds.includes(id));
    const removedDocumentIds = selectedDocumentIds.filter(id => !newDocumentIds.includes(id));
    
    [...addedDocumentIds, ...removedDocumentIds].forEach(documentId => {
      toggleDocumentSelection(documentId);
    });
    
    // Handle text changes
    const addedTextIds = newTextIds.filter(id => !selectedTextIds.includes(id));
    const removedTextIds = selectedTextIds.filter(id => !newTextIds.includes(id));
    
    [...addedTextIds, ...removedTextIds].forEach(textId => {
      toggleTextSelection(textId);
    });
  }, [selectedKnowledgeIds, selectedDocumentIds, selectedTextIds, availableKnowledge, toggleSelection, toggleDocumentSelection, toggleTextSelection, onKnowledgeSelection]);


  // Note: Document preloading is now handled by useKnowledge hook in parent components
  // This eliminates the flash of "keine dokumente vorhanden" message
  // Note: Document selection clearing is handled by store reset in useKnowledge hook

  // Simplified loading logic since documents are preloaded by useKnowledge
  const [userInteracted, setUserInteracted] = React.useState(false);

  // Sync documents from documents store to knowledge store
  // Only sync documents when "Mein Profil" is selected
  const { documents: documentsStoreData } = useDocumentsStore();
  React.useEffect(() => {
    if (enableDocuments && source.type === 'user' && documentsStoreData !== null) {
      // Filter only completed documents for selection
      const completedDocuments = documentsStoreData.filter(doc => doc.status === 'completed');
      setAvailableDocuments(completedDocuments); // This will clear loading state regardless of count
    } else if (source.type !== 'user') {
      // Clear documents when source is not user
      setAvailableDocuments([]);
    }
  }, [enableDocuments, source.type, documentsStoreData, setAvailableDocuments]);

  // Fetch documents when needed but not yet loaded
  React.useEffect(() => {
    if (enableDocuments && source.type === 'user' && documentsStoreData.length === 0 && !documentsLoading) {
      fetchDocuments();
    }
  }, [enableDocuments, source.type, documentsStoreData.length, documentsLoading, fetchDocuments]);

  // Fetch texts when "Mein Profil" is selected and text selection is enabled
  React.useEffect(() => {
    if (enableTexts && source.type === 'user') {
      fetchTexts();
    } else if (source.type !== 'user') {
      setAvailableTexts([]);
    }
  }, [enableTexts, source.type, fetchTexts, setAvailableTexts, availableTexts.length]);

  // Note: Selection state is now managed by the store, no local state reset needed

  // Hide component if user is not authenticated
  if (!user) {
    return null;
  }
  
  // Only hide component if no functionality is enabled 
  const hasAnyFeatureEnabled = enableSourceSelection || enableKnowledge || enableDocuments || enableTexts;
  
  if (!hasAnyFeatureEnabled) {
    return null;
  }

  return (
    <div className="knowledge-selector__wrapper">
      {/* Knowledge Source Selection */}
      {enableSourceSelection && (
        <div className="knowledge-selector__source">
          <FormSelect
            name="knowledge-source"
            label="Profil auswählen"
            options={sourceOptions}
            value={getCurrentSourceValue()}
            onChange={handleSourceChange}
            disabled={isLoadingGroups || isLoadingBetaFeatures || !anweisungenBetaEnabled}
            placeholder=""
            tabIndex={sourceTabIndex || tabIndex}
          />
        </div>
      )}

      {/* Knowledge and documents selection with react-select multi-dropdown */}
      {enableKnowledge && knowledgeOptions.length > 0 && (
        <div className="knowledge-selector">
          <FormFieldWrapper
            label={source.type === 'user' && (enableDocuments || enableTexts) 
              ? `Wissen${enableDocuments ? ' & Dokumente' : ''}${enableTexts ? ' & Texte' : ''} auswählen`
              : "Wissen auswählen"}
            helpText={source.type === 'user' && (enableDocuments || enableTexts)
              ? `Wähle Wissen, Anweisungen${enableDocuments ? ', Dokumente' : ''}${enableTexts ? ' und Texte' : ''} aus, die bei der Generierung berücksichtigt werden sollen`
              : "Wähle Wissen und Anweisungen aus, die bei der Generierung berücksichtigt werden sollen"
            }
            htmlFor="knowledge-select"
          >
            <Select
              inputId="knowledge-select"
              classNamePrefix="knowledge-select"
              isMulti
              options={knowledgeOptions}
              placeholder={source.type === 'user' && (enableDocuments || enableTexts) 
                ? `Wissen${enableDocuments ? ' & Dokumente' : ''}${enableTexts ? ' & Texte' : ''} auswählen...`
                : "Wissen auswählen..."}
              isDisabled={disabled}
              formatOptionLabel={formatOptionLabel}
              filterOption={() => true} // Disable react-select's default filtering since we handle it
              onInputChange={(inputValue) => {
                setCurrentSearchTerm(inputValue);
              }}
              value={[
                ...selectedKnowledgeIds.map(id => 
                  baseKnowledgeOptions.find(option => option.value === `knowledge_${id}`)
                ).filter(Boolean),
                ...selectedDocumentIds.map(id => 
                  baseKnowledgeOptions.find(option => option.value === `document_${id}`)
                ).filter(Boolean),
                ...selectedTextIds.map(id => 
                  baseKnowledgeOptions.find(option => option.value === `text_${id}`)
                ).filter(Boolean)
              ]}
              onChange={handleKnowledgeChange}
              onFocus={() => {
                if (!userInteracted) {
                  setUserInteracted(true);
                }
              }}
              onMenuOpen={() => {
                if (!userInteracted) {
                  setUserInteracted(true);
                }
              }}
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
              menuPortalTarget={null}
              tabIndex={tabIndex}
              noOptionsMessage={() => {
                if (currentSearchTerm && currentSearchTerm.trim()) {
                  return `Keine Ergebnisse für "${currentSearchTerm}"`;
                }
                return source.type === 'user' && (enableDocuments || enableTexts) 
                  ? `Kein Wissen${enableDocuments ? ' oder Dokumente' : ''}${enableTexts ? ' oder Texte' : ''} verfügbar`
                  : 'Kein Wissen verfügbar';
              }}
            />
          </FormFieldWrapper>
        </div>
      )}

      {/* Show message when no knowledge/documents/texts are available for selection (but not when neutral source) */}
      {enableKnowledge && knowledgeOptions.length === 0 && !disabled && source.type !== 'neutral' && (
        <p className="knowledge-selector__no-options">
          {source.type === 'user' && (enableDocuments || enableTexts) ? (
            <>
              Kein Wissen{enableDocuments ? ', Dokumente' : ''}{enableTexts ? ' oder Texte' : ''} verfügbar.<br />
              {enableDocuments && 'Lade zuerst Dokumente in deinem Profil hoch, '}
              {enableTexts && 'erstelle Texte mit den Generatoren, '}
              oder erstelle Wissen.
            </>
          ) : (
            'Kein Wissen verfügbar für die aktuelle Auswahl.'
          )}
        </p>
      )}


      {/* Document Content Extraction Status */}
      {enableDocuments && selectedDocumentIds.length > 0 && isExtractingDocumentContent && documentExtractionInfo && (
        <div className={`knowledge-selector__extraction-status extraction-status--${documentExtractionInfo.type}`}>
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

KnowledgeSelector.propTypes = {
  onKnowledgeSelection: PropTypes.func,
  disabled: PropTypes.bool,
  tabIndex: PropTypes.number,
  sourceTabIndex: PropTypes.number,
  documentTabIndex: PropTypes.number
};

KnowledgeSelector.displayName = 'KnowledgeSelector';

// Memoize the component with optimized comparison to prevent unnecessary re-renders
const areEqual = (prevProps, nextProps) => {
  return (
    prevProps.disabled === nextProps.disabled &&
    prevProps.onKnowledgeSelection === nextProps.onKnowledgeSelection &&
    prevProps.tabIndex === nextProps.tabIndex &&
    prevProps.sourceTabIndex === nextProps.sourceTabIndex &&
    prevProps.documentTabIndex === nextProps.documentTabIndex
  );
};

export default memo(KnowledgeSelector, areEqual); 