import React, { useState, useMemo, useEffect } from 'react';
import PropTypes from 'prop-types';
import { HiDocument, HiClipboardList, HiUser, HiSearch } from 'react-icons/hi';
import { useShallow } from 'zustand/react/shallow';
import { useGeneratorSelectionStore } from '../../stores/core/generatorSelectionStore';
import { useAuth } from '../../hooks/useAuth';
import '../../assets/styles/components/ui/SimpleContentSelector.css';

/**
 * SimpleContentSelector - Simplified file and text selector without nested dropdowns
 * Replaces the overengineered EnhancedKnowledgeSelector with a clean checkbox list
 */
const SimpleContentSelector = ({ disabled = false }) => {
  const [searchFilter, setSearchFilter] = useState('');

  // Consolidated store subscription with shallow comparison (performance optimization)
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
    uiConfig
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
      uiConfig: state.uiConfig
    }))
  );

  const { user } = useAuth();

  // Extract UI config
  const { enableDocuments = false, enableTexts = false } = uiConfig;

  // Fetch texts when component mounts and texts are enabled
  // fetchTexts is omitted from deps as it's a stable store action
  useEffect(() => {
    if (enableTexts && !isLoadingTexts && availableTexts.length === 0) {
      fetchTexts();
    }
  }, [enableTexts]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build unified item list
  const allItems = useMemo(() => {
    // Create Sets locally for O(1) lookup performance (instead of O(n) with array.includes)
    const selectedDocumentIdsSet = new Set(selectedDocumentIds);
    const selectedTextIdsSet = new Set(selectedTextIds);

    const items = [];

    // User documents
    if (enableDocuments && availableDocuments.length > 0) {
      availableDocuments
        .filter(doc => doc.status === 'completed')
        .forEach(doc => {
          items.push({
            id: doc.id,
            type: 'document',
            source: 'user',
            title: doc.title,
            filename: doc.filename,
            isSelected: selectedDocumentIdsSet.has(doc.id),
            searchText: `${doc.title} ${doc.filename || ''} ${doc.ocr_text || ''}`.toLowerCase()
          });
        });
    }

    // User texts
    if (enableTexts && availableTexts.length > 0) {
      availableTexts.forEach(text => {
        items.push({
          id: text.id,
          type: 'text',
          source: 'user',
          title: text.title,
          isSelected: selectedTextIdsSet.has(text.id),
          searchText: `${text.title} ${text.type || ''} ${text.full_content || text.content || ''}`.toLowerCase()
        });
      });
    }

    return items;
  }, [enableDocuments, enableTexts, availableDocuments, availableTexts, selectedDocumentIds, selectedTextIds]);

  // Filter items based on search
  const filteredItems = useMemo(() => {
    if (!searchFilter.trim()) return allItems;

    const searchLower = searchFilter.toLowerCase();
    return allItems.filter(item => item.searchText.includes(searchLower));
  }, [allItems, searchFilter]);

  // Handle checkbox toggle
  const handleToggle = (item) => {
    if (item.type === 'document') {
      toggleDocumentSelection(item.id);
    } else {
      toggleTextSelection(item.id);
    }
  };

  // Get icon for item type and source
  const getIcon = (item) => {
    if (item.type === 'document') {
      return <HiDocument className="item-icon item-icon--document" />;
    }
    return <HiClipboardList className="item-icon item-icon--text" />;
  };

  // Hide if not authenticated
  if (!user) return null;

  // Hide if no features enabled
  const hasAnyFeature = enableDocuments || enableTexts;
  if (!hasAnyFeature) return null;

  const isLoading = isLoadingTexts || isLoadingDocuments;
  const hasItems = allItems.length > 0;
  const hasFilteredItems = filteredItems.length > 0;

  return (
    <div className="simple-content-selector">
      {/* Search Filter */}
      <div className="content-selector__search">
        <HiSearch className="search-icon" />
        <input
          type="text"
          placeholder="Inhalte durchsuchen..."
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          disabled={disabled || isLoading}
          className="search-input"
        />
      </div>

      {/* Item List */}
      <div className="content-selector__list">
        {isLoading && (
          <div className="content-selector__loading">
            Lade verfügbare Inhalte...
          </div>
        )}

        {!isLoading && !hasItems && (
          <div className="content-selector__empty">
            Keine Inhalte verfügbar.<br />
            Lade Dokumente hoch oder generiere Texte.
          </div>
        )}

        {!isLoading && hasItems && !hasFilteredItems && (
          <div className="content-selector__no-results">
            Keine Ergebnisse für "{searchFilter}"
          </div>
        )}

        {!isLoading && hasFilteredItems && filteredItems.map(item => (
          <label
            key={`${item.source}-${item.type}-${item.id}`}
            className={`content-item ${item.isSelected ? 'content-item--selected' : ''}`}
          >
            <input
              type="checkbox"
              checked={item.isSelected}
              onChange={() => handleToggle(item)}
              disabled={disabled}
              className="content-item__checkbox"
            />
            {getIcon(item)}
            <span className="content-item__title" title={item.title}>
              {item.title}
            </span>
            {/* <span className="content-item__tag content-item__tag--user">
              <HiUser className="tag-icon" />
            </span> */}
          </label>
        ))}
      </div>
    </div>
  );
};

SimpleContentSelector.propTypes = {
  disabled: PropTypes.bool
};

export default SimpleContentSelector;
