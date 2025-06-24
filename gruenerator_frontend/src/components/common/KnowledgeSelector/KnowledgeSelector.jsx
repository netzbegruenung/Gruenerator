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
  enableSelection = false,
  enableSourceSelection = false,
  enableDocumentSelection = false,
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
    documentExtractionInfo
  } = useGeneratorKnowledgeStore();
  
  // Get groups and beta features for source selection
  const { getBetaFeatureState, isLoading: isLoadingBetaFeatures } = useBetaFeatures();
  const anweisungenBetaEnabled = getBetaFeatureState('anweisungen');
  const { 
    userGroups: groups, 
    isLoadingGroups, 
    errorGroups: groupsError 
  } = useGroups();
  
  // Get documents store and auth for document fetching
  const { fetchDocuments } = useDocumentsStore();
  const { user } = useAuth();
  
  // Removed console.log for performance

  // Handle knowledge source selection
  const handleSourceChange = useCallback((e) => {
    const value = e.target.value;
    
    if (value === 'neutral') {
      setSource({ type: 'neutral', id: null, name: null });
    } else if (value === 'user') {
      setSource({ type: 'user', id: null, name: 'Meine Anweisungen & Wissen' });
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
      { value: 'user', label: 'Meine Anweisungen & Wissen' }
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
          label: `${group.name} Anweisungen & Wissen`
        }))
      : [];

    return [...baseOptions, ...loadingOptions, ...groupOptions];
  }, [groups, isLoadingGroups, isLoadingBetaFeatures, groupsError]);

  // Memoize expensive computations to prevent unnecessary re-renders
  // Merge knowledge and documents into single options array when user source is selected
  const knowledgeOptions = useMemo(() => {
    const knowledgeItems = availableKnowledge.map(item => ({
      value: `knowledge_${item.id}`,
      label: item.title,
      type: item.type || 'knowledge',
      itemType: 'knowledge',
      originalId: item.id
    }));
    
    // Only include documents when source is 'user' and documents are available
    const documentItems = (source.type === 'user' && enableDocumentSelection) 
      ? availableDocuments.map(doc => ({
          value: `document_${doc.id}`,
          label: `${doc.title} (${doc.page_count || '?'} Seiten)`,
          type: 'user_document',
          itemType: 'document',
          originalId: doc.id,
          subtitle: doc.filename
        }))
      : [];
    
    return [...knowledgeItems, ...documentItems];
  }, [availableKnowledge, availableDocuments, source.type, enableDocumentSelection]);


  // Memoized option formatter for performance
  const formatOptionLabel = useCallback(({ type, label, subtitle }, { context }) => {
    // Show icons only in the dropdown menu, not in selected values to save space
    if (context === 'menu') {
      return (
        <div className="knowledge-option">
          <KnowledgeIcon type={type} size={16} />
          <div className="knowledge-option__content">
            <span className="knowledge-option__label">{label}</span>
            {subtitle && <span className="knowledge-option__subtitle">{subtitle}</span>}
          </div>
        </div>
      );
    }
    // For selected values, show only text
    return <span>{label}</span>;
  }, []);

  const handleKnowledgeChange = useCallback((selectedOptions) => {
    const newSelectedValues = selectedOptions ? selectedOptions.map(option => option.value) : [];
    
    // Separate knowledge and document selections
    const newKnowledgeIds = newSelectedValues
      .filter(value => value.startsWith('knowledge_'))
      .map(value => value.replace('knowledge_', ''));
    const newDocumentIds = newSelectedValues
      .filter(value => value.startsWith('document_'))
      .map(value => value.replace('document_', ''));
    
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
  }, [selectedKnowledgeIds, selectedDocumentIds, availableKnowledge, toggleSelection, toggleDocumentSelection, onKnowledgeSelection]);


  // Note: Document preloading is now handled by useKnowledge hook in parent components
  // This eliminates the flash of "keine dokumente vorhanden" message
  // Note: Document selection clearing is handled by store reset in useKnowledge hook

  // Simplified loading logic since documents are preloaded by useKnowledge
  const [userInteracted, setUserInteracted] = React.useState(false);

  // Sync documents from documents store to knowledge store
  // Only sync documents when "Meine Anweisungen & Wissen" is selected
  const { documents: documentsStoreData } = useDocumentsStore();
  React.useEffect(() => {
    if (enableDocumentSelection && source.type === 'user' && documentsStoreData !== null) {
      // Filter only completed documents for selection
      const completedDocuments = documentsStoreData.filter(doc => doc.status === 'completed');
      console.log('[KnowledgeSelector] Syncing completed documents to knowledge store:', completedDocuments.length);
      setAvailableDocuments(completedDocuments); // This will clear loading state regardless of count
    } else if (source.type !== 'user') {
      // Clear documents when source is not user
      setAvailableDocuments([]);
    }
  }, [enableDocumentSelection, source.type, documentsStoreData, setAvailableDocuments]);

  // Note: Selection state is now managed by the store, no local state reset needed

  // Only hide component if no functionality is enabled or no content is available
  if (!enableSourceSelection && !enableDocumentSelection && (source.type === 'neutral' || availableKnowledge.length === 0)) {
    return null;
  }

  return (
    <div className="knowledge-selector__wrapper">
      {/* Knowledge Source Selection */}
      {enableSourceSelection && (
        <div className="knowledge-selector__source">
          <FormSelect
            name="knowledge-source"
            label="Anweisungen & Wissensquelle"
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
      {enableSelection && knowledgeOptions.length > 0 && (
        <div className="knowledge-selector">
          <FormFieldWrapper
            label={source.type === 'user' && enableDocumentSelection ? "Wissen & Dokumente auswählen" : "Wissen auswählen"}
            helpText={source.type === 'user' && enableDocumentSelection 
              ? "Wähle Wissen, Anweisungen und Dokumente aus, die bei der Generierung berücksichtigt werden sollen"
              : "Wähle Wissen und Anweisungen aus, die bei der Generierung berücksichtigt werden sollen"
            }
            htmlFor="knowledge-select"
          >
            <Select
              inputId="knowledge-select"
              classNamePrefix="knowledge-select"
              isMulti
              options={knowledgeOptions}
              placeholder={source.type === 'user' && enableDocumentSelection ? "Wissen & Dokumente auswählen..." : "Wissen auswählen..."}
              isDisabled={disabled}
              formatOptionLabel={formatOptionLabel}
              value={[
                ...selectedKnowledgeIds.map(id => 
                  knowledgeOptions.find(option => option.value === `knowledge_${id}`)
                ).filter(Boolean),
                ...selectedDocumentIds.map(id => 
                  knowledgeOptions.find(option => option.value === `document_${id}`)
                ).filter(Boolean)
              ]}
              onChange={handleKnowledgeChange}
              onFocus={() => {
                if (!userInteracted) {
                  setUserInteracted(true);
                  console.log('[KnowledgeSelector] User interacted with combined selector');
                }
              }}
              onMenuOpen={() => {
                if (!userInteracted) {
                  setUserInteracted(true);
                  console.log('[KnowledgeSelector] User opened combined selector menu');
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
              noOptionsMessage={() => source.type === 'user' && enableDocumentSelection ? 'Kein Wissen oder Dokumente verfügbar' : 'Kein Wissen verfügbar'}
            />
          </FormFieldWrapper>
        </div>
      )}

      {/* Show message when no knowledge/documents are available for selection (but not when neutral source) */}
      {enableSelection && knowledgeOptions.length === 0 && !disabled && source.type !== 'neutral' && (
        <p className="knowledge-selector__no-options">
          {source.type === 'user' && enableDocumentSelection ? (
            <>
              Kein Wissen oder Dokumente verfügbar.<br />
              Lade zuerst Dokumente in deinem Profil hoch oder erstelle Wissen.
            </>
          ) : (
            'Kein Wissen verfügbar für die aktuelle Auswahl.'
          )}
        </p>
      )}


      {/* Document Content Extraction Status */}
      {enableDocumentSelection && selectedDocumentIds.length > 0 && isExtractingDocumentContent && documentExtractionInfo && (
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
          {documentExtractionInfo.type === 'success' && documentExtractionInfo.vectorResults > 0 && (
            <div className="extraction-status__details">
              {documentExtractionInfo.vectorResults} Vector-Ergebnisse in {documentExtractionInfo.responseTime}ms
            </div>
          )}
        </div>
      )}
    </div>
  );
};

KnowledgeSelector.propTypes = {
  onKnowledgeSelection: PropTypes.func,
  disabled: PropTypes.bool,
  enableSelection: PropTypes.bool,
  enableSourceSelection: PropTypes.bool,
  enableDocumentSelection: PropTypes.bool,
  tabIndex: PropTypes.number,
  sourceTabIndex: PropTypes.number,
  documentTabIndex: PropTypes.number
};

KnowledgeSelector.displayName = 'KnowledgeSelector';

// Memoize the component with optimized comparison to prevent unnecessary re-renders
const areEqual = (prevProps, nextProps) => {
  return (
    prevProps.disabled === nextProps.disabled &&
    prevProps.enableSelection === nextProps.enableSelection &&
    prevProps.enableSourceSelection === nextProps.enableSourceSelection &&
    prevProps.enableDocumentSelection === nextProps.enableDocumentSelection &&
    prevProps.onKnowledgeSelection === nextProps.onKnowledgeSelection &&
    prevProps.tabIndex === nextProps.tabIndex &&
    prevProps.sourceTabIndex === nextProps.sourceTabIndex &&
    prevProps.documentTabIndex === nextProps.documentTabIndex
  );
};

export default memo(KnowledgeSelector, areEqual); 