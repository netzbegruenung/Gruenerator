import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { HiOutlineTrash, HiOutlineSearch, HiOutlineDocumentText, HiOutlinePencil, HiOutlineEye, HiRefresh, HiDotsVertical, HiExclamationCircle, HiShare, HiClipboard, HiChevronRight } from 'react-icons/hi';
import { NotebookIcon } from '../../config/icons';
import { motion } from "motion/react";
import Spinner from './Spinner';
import MenuDropdown from './MenuDropdown';
import BulkDeleteConfirmModal from './BulkDeleteConfirmModal';
import { useSearchState } from '../../hooks/useSearchState';
import { useFilteredAndGroupedItems } from '../../hooks/useFilteredAndGroupedItems';
import DocumentPreviewModal from './DocumentPreviewModal';
import SelectAllCheckbox from './SelectAllCheckbox';
import DocumentGroupedContent from './DocumentGroupedContent';
import { getActionItems } from './ItemActionBuilder';
import { truncateForPreview, getSortValueFactory, normalizeRemoteResults, formatDate } from '../utils/documentOverviewUtils';

// Document Overview Feature CSS - Loaded only when this feature is accessed
import '../../assets/styles/components/document-overview.css';
// Import ProfileActionButton CSS for consistent button styling
import '../../assets/styles/components/profile/profile-action-buttons.css';

// Define default values outside component to prevent re-creation on every render
const DEFAULT_SEARCH_FIELDS = ['title', 'content_preview', 'full_content'];
const DEFAULT_SORT_OPTIONS = [
    { value: 'updated_at', label: 'Zuletzt geändert' },
    { value: 'created_at', label: 'Erstellungsdatum' },
    { value: 'title', label: 'Titel' },
    { value: 'word_count', label: 'Wortanzahl' }
];

const DocumentOverview = ({
    documents = [], // backward compatibility - will also accept 'items'
    items, // new generic prop for any type of items
    loading = false,
    onFetch,
    onDelete,
    onBulkDelete, // new prop for bulk delete functionality
    onUpdateTitle,
    onEdit,
    onView,
    onRefreshDocument, // for document-specific refresh functionality
    onShare, // for Q&A sharing functionality
    documentTypes = {},
    itemType = 'document', // 'document' (default) or 'qa'
    searchFields = DEFAULT_SEARCH_FIELDS, // configurable search fields
    sortOptions = DEFAULT_SORT_OPTIONS, // configurable sort options
    cardRenderer, // optional custom card content renderer
    metaRenderer, // optional custom metadata renderer
    actionItems, // configurable dropdown menu items
    emptyStateConfig = {},
    searchPlaceholder = "Dokumente durchsuchen...",
    onSuccessMessage,
    onErrorMessage,
    title = "Dokumente",
    showRefreshButton = true,
    headerActions, // custom action buttons/elements to render in header
    enableBulkSelect = true, // new prop to enable/disable bulk selection
    enableGrouping = false, // new prop to enable/disable source grouping
    enableLocalSearch = true, // when false, hides internal search bar (use external search UI)
    // Remote search integration (full-text / intelligent)
    remoteSearchEnabled = false,
    onRemoteSearch, // (query, mode) => void
    isRemoteSearching = false,
    remoteResults = [],
    onClearRemoteSearch,
    remoteSearchDefaultMode = 'intelligent', // 'intelligent' | 'fulltext'
    // NEW: Wolke share links for cloud documents
    wolkeShareLinks = []
}) => {
    // Support both 'documents' (backward compatibility) and 'items' props
    const allItems = items || documents;
    
    // Ensure isRemoteSearching always has a defined value to prevent scope issues
    const isRemoteSearchingValue = isRemoteSearching ?? false;
    
    // Search state management using custom hook
    const searchState = useSearchState({
        mode: remoteSearchEnabled ? 'remote' : 'local',
        onRemoteSearch,
        onClearRemoteSearch,
        searchMode: remoteSearchDefaultMode
    });
    
    // Sort state (must be declared before useFilteredAndGroupedItems)
    const [sortBy, setSortBy] = useState(sortOptions[0]?.value || 'updated_at');
    const [sortOrder, setSortOrder] = useState('desc');
    
    // Derived items and grouping
    const { filteredItems, groupedItems } = useFilteredAndGroupedItems({
        items: allItems,
        itemType,
        searchFields,
        sortBy,
        sortOrder,
        enableGrouping,
        searchState,
    });
    
    // Component state
    const [selectedItem, setSelectedItem] = useState(null);
    const [showPreview, setShowPreview] = useState(false);
    const [editingTitle, setEditingTitle] = useState(null);
    const [newTitle, setNewTitle] = useState('');
    const [deleting, setDeleting] = useState(null);
    const [refreshing, setRefreshing] = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState(null);

    // Bulk selection state
    const [selectedItemIds, setSelectedItemIds] = useState(new Set());
    const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
    const [isBulkDeleting, setIsBulkDeleting] = useState(false);
    
    // Grouping state
    const [expandedGroups, setExpandedGroups] = useState(new Set(['manual', 'wolke']));

    // Sort getter for remote results sorting
    const getSortValue = useMemo(() => getSortValueFactory(itemType), [itemType]);

    // Auto-switch to relevance sorting when remote search is active
    useEffect(() => {
        // Only run effect when all required state is initialized
        if (!sortBy || !searchState) return;
        
        if (remoteSearchEnabled && searchState.hasQuery && sortBy !== 'similarity_score') {
            setSortBy('similarity_score');
        } else if (remoteSearchEnabled && !searchState.hasQuery && sortBy === 'similarity_score') {
            // Switch back to default sort when search is cleared
            setSortBy(sortOptions[0]?.value || 'updated_at');
        }
    }, [remoteSearchEnabled, searchState?.hasQuery, sortBy, sortOptions]);

    // Handle item deletion
    const handleDelete = async (item) => {
        const itemName = itemType === 'qa' ? item.name : item.title;
        const confirmMessage = itemType === 'qa' 
            ? `Möchten Sie die Q&A-Sammlung "${itemName}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`
            : 'Möchtest du dieses Dokument wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.';
            
        if (!window.confirm(confirmMessage)) {
            return;
        }

        setDeleting(item.id);
        try {
            await onDelete(item.id);
            
            // Close preview if deleted item was selected
            if (selectedItem?.id === item.id) {
                setSelectedItem(null);
                setShowPreview(false);
            }
        } catch (error) {
            onErrorMessage && onErrorMessage('Fehler beim Löschen: ' + error.message);
        } finally {
            setDeleting(null);
        }
    };

    // Handle title editing
    const handleTitleEdit = (item) => {
        setEditingTitle(item.id);
        const currentTitle = itemType === 'qa' ? item.name : item.title;
        setNewTitle(currentTitle);
    };

    const handleTitleSave = async (itemId) => {
        const originalItem = allItems.find(item => item.id === itemId);
        const originalTitle = itemType === 'qa' ? originalItem?.name : originalItem?.title;
        
        if (newTitle.trim() && newTitle.trim() !== originalTitle) {
            try {
                await onUpdateTitle(itemId, newTitle.trim());
                onSuccessMessage && onSuccessMessage('Titel erfolgreich aktualisiert');
            } catch (error) {
                onErrorMessage && onErrorMessage('Fehler beim Aktualisieren des Titels: ' + error.message);
            }
        }
        setEditingTitle(null);
        setNewTitle('');
    };

    const handleTitleCancel = () => {
        setEditingTitle(null);
        setNewTitle('');
    };

    // Bulk selection handlers
    const handleSelectItem = (itemId, isSelected) => {
        setSelectedItemIds(prev => {
            const newSet = new Set(prev);
            if (isSelected) {
                newSet.add(itemId);
            } else {
                newSet.delete(itemId);
            }
            return newSet;
        });
    };

    const handleSelectAll = (isSelected) => {
        // Only allow bulk select for non-Wolke documents
        const selectable = filteredItems.filter(item => itemType !== 'document' || item.source_type !== 'wolke');
        if (isSelected) {
            setSelectedItemIds(new Set(selectable.map(item => item.id)));
        } else {
            setSelectedItemIds(new Set());
        }
    };

    const handleBulkDelete = async () => {
        if (!onBulkDelete || selectedItemIds.size === 0) return;

        setIsBulkDeleting(true);
        try {
            const idsArray = Array.from(selectedItemIds);
            await onBulkDelete(idsArray);
            
            // Clear selection after successful delete
            setSelectedItemIds(new Set());
            setShowBulkDeleteModal(false);
            
            onSuccessMessage && onSuccessMessage(
                `${idsArray.length} ${idsArray.length === 1 ? 'Element' : 'Elemente'} erfolgreich gelöscht.`
            );
        } catch (error) {
            onErrorMessage && onErrorMessage('Fehler beim Bulk-Löschen: ' + error.message);
        } finally {
            setIsBulkDeleting(false);
        }
    };
    
    // Group expansion handlers
    const toggleGroupExpansion = (groupKey) => {
        setExpandedGroups(prev => {
            const newSet = new Set(prev);
            if (newSet.has(groupKey)) {
                newSet.delete(groupKey);
            } else {
                newSet.add(groupKey);
            }
            return newSet;
        });
    };

    const clearSelection = () => {
        setSelectedItemIds(new Set());
    };

    // Reset selection when items change
    useEffect(() => {
        setSelectedItemIds(prev => {
            const newSet = new Set();
            const activeItems = remoteSearchEnabled && searchState.hasQuery ? (remoteResults || []) : allItems;
            const currentIds = new Set((activeItems || []).map(item => item.id));
            prev.forEach(id => {
                if (currentIds.has(id)) {
                    newSet.add(id);
                }
            });
            return newSet;
        });
    }, [allItems, remoteResults, remoteSearchEnabled, searchState.hasQuery]);

    // Item action handlers
    const handleViewItem = (item) => {
        if (onView) {
            onView(item);
        } else {
            setSelectedItem(item);
            setShowPreview(true);
        }
    };

    const handleEditItem = (item) => {
        onEdit && onEdit(item);
    };

    const handleShareItem = (item) => {
        onShare && onShare(item);
    };

    // Handle document refresh (for processing/pending documents)
    const handleRefreshDocument = async (item) => {
        if (!onRefreshDocument) return;
        
        setRefreshing(item.id);
        try {
            await onRefreshDocument(item.id);
            onSuccessMessage && onSuccessMessage('Dokumentstatus wurde aktualisiert.');
        } catch (error) {
            console.error('[DocumentOverview] Error refreshing document:', error);
            onErrorMessage && onErrorMessage('Fehler beim Aktualisieren des Dokumentstatus: ' + error.message);
        } finally {
            setRefreshing(null);
        }
    };

    // Enhanced preview with API content fetch (document-specific)
    const handleEnhancedPreview = async (item) => {
        if (itemType === 'qa' || item.full_content) {
            setSelectedItem(item);
            setShowPreview(true);
            return;
        }

        setPreviewLoading(true);
        setPreviewError(null);

        try {
            const AUTH_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
            const response = await fetch(`${AUTH_BASE_URL}/documents/${item.id}/content`, {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            const enhancedItem = {
                ...item,
                full_content: data.data.ocr_text || 'Kein Text extrahiert',
                markdown_content: data.data.markdown_content
            };
            
            setSelectedItem(enhancedItem);
            setShowPreview(true);
        } catch (error) {
            console.error('[DocumentOverview] Error fetching document content:', error);
            setPreviewError('Fehler beim Laden des Dokument-Inhalts');
            onErrorMessage && onErrorMessage('Fehler beim Laden des Dokument-Inhalts: ' + error.message);
        } finally {
            setPreviewLoading(false);
        }
    };

    // formatDate moved to utils

    // Build action items via builder, falling back to custom actionItems if provided

    // Render default card
    const renderDefaultCard = (item) => {
        const itemTitle = itemType === 'qa' ? item.name : item.title;
        const isDocument = itemType === 'document';
        
        return (
            <div 
                key={item.id} 
                className="document-card"
            >
                {/* Header with title and dropdown menu */}
                <div className="document-card-header">
                    {/* Bulk selection checkbox */}
                    {enableBulkSelect && onBulkDelete && !(itemType === 'document' && item.source_type === 'wolke') && (
                        <div className="document-card-checkbox">
                            <input
                                type="checkbox"
                                checked={selectedItemIds.has(item.id)}
                                onChange={(e) => {
                                    e.stopPropagation();
                                    handleSelectItem(item.id, e.target.checked);
                                }}
                                onClick={(e) => e.stopPropagation()}
                            />
                        </div>
                    )}
                    
                    {editingTitle === item.id ? (
                        <div className="document-title-edit">
                            <input
                                type="text"
                                className="form-input"
                                value={newTitle}
                                onChange={(e) => setNewTitle(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleTitleSave(item.id);
                                    if (e.key === 'Escape') handleTitleCancel();
                                }}
                                onClick={(e) => e.stopPropagation()}
                                autoFocus
                            />
                            <div className="document-title-edit-actions">
                                <button 
                                    className="pabtn pabtn--primary pabtn--s"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleTitleSave(item.id);
                                    }}
                                >
                                    <span className="pabtn__label">✓</span>
                                </button>
                                <button 
                                    className="pabtn pabtn--ghost pabtn--s"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleTitleCancel();
                                    }}
                                >
                                    <span className="pabtn__label">✕</span>
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="document-title-header">
                            <h4 
                                className={`document-card-title ${onUpdateTitle ? "editable-title" : ""} clickable-title`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (onUpdateTitle && e.detail === 2) {
                                        // Double-click for edit
                                        handleTitleEdit(item);
                                    } else if (e.detail === 1) {
                                        // Single-click for preview
                                        if (isDocument && item.status === 'completed') {
                                            handleEnhancedPreview(item);
                                        } else {
                                            handleViewItem(item);
                                        }
                                    }
                                }}
                                title={`${itemTitle} (Klicken zum Öffnen${onUpdateTitle ? ', Doppelklick zum Bearbeiten' : ''})`}
                            >
                                {itemTitle}
                            </h4>
                        </div>
                    )}
                    
                    {/* Three-dot menu */}
                    <MenuDropdown
                        className="document-card-menu-container"
                        trigger={
                            <button
                                className="document-card-menu-button"
                                title="Aktionen"
                            >
                                <HiDotsVertical />
                            </button>
                        }
                        alignRight={true}
                    >
                        {/* Pass onClose from MenuDropdown's cloneElement */}
                        {({ onClose }) => renderDropdownContent(item, onClose)}
                    </MenuDropdown>
                </div>

                {/* Preview Image for Templates */}
                {(item.preview_image_url || item.thumbnail_url) && (
                    <div className="document-card-preview">
                        <img 
                            src={item.preview_image_url || item.thumbnail_url} 
                            alt={`Vorschau von ${itemTitle}`}
                            className="document-preview-image"
                            onError={(e) => {
                                e.target.style.display = 'none';
                            }}
                            loading="lazy"
                        />
                    </div>
                )}

                {/* Content */}
                <div className="document-card-content">
                    {itemType === 'qa' ? (
                        <>
                            {item.description && (
                                <p className="qa-description">
                                    {item.description}
                                </p>
                            )}
                            {item.custom_prompt && (
                                <div className="qa-custom-prompt-preview">
                                    <strong>Anweisungen:</strong>
                                    <p>{item.custom_prompt}</p>
                                </div>
                            )}
                        </>
                    ) : (
                        <p className="content-preview">
                            {(() => {
                                const raw = item.full_content || item.content_preview || item.ocr_text;
                                const text = truncateForPreview(raw);
                                // If no inline preview is available but the document is completed,
                                // hint that the preview loads on open instead of "Kein Inhalt verfügbar".
                                if (!text && item.status === 'completed') {
                                    return 'Vorschau beim Öffnen verfügbar';
                                }
                                return text || 'Kein Inhalt verfügbar';
                            })()}
                        </p>
                    )}
                </div>

                {/* Footer with metadata */}
                <div className="document-card-footer">
                    {metaRenderer ? metaRenderer(item) : renderDefaultMeta(item)}
                </div>
            </div>
        );
    };

    // Render default metadata
    const renderDefaultMeta = (item) => {
        if (itemType === 'qa') {
            return (
                <>
                    {item.document_count !== undefined && (
                        <span className="document-type qa-document-count">
                            {item.document_count} Dokument{item.document_count !== 1 ? 'e' : ''}
                        </span>
                    )}
                    {item.is_public && (
                        <span className="document-type qa-public-badge">Öffentlich</span>
                    )}
                    {item.created_at && (
                        <span className="document-date">{formatDate(item.created_at)}</span>
                    )}
                    {item.view_count && item.view_count > 0 && (
                        <span className="document-stats">{item.view_count} Aufrufe</span>
                    )}
                </>
            );
        }

        return (
            <>
                {/* Source badge - only show when not grouping or for context */}
                {(!enableGrouping || itemType !== 'document') && item.source_type && (
                    <span className={`document-source-badge source-${item.source_type}`}>
                        {item.source_type === 'wolke' ? '☁️ Wolke' : '📁 Manual'}
                    </span>
                )}
                {item.similarity_score != null && (
                    <span className="document-stats">Relevanz: {Math.round(item.similarity_score * 100)}%</span>
                )}
                {item.type && (
                    <span className="document-type">
                        {documentTypes[item.type] || item.type}
                    </span>
                )}
                {item.word_count && (
                    <span className="document-stats">{item.word_count} Wörter</span>
                )}
                {item.updated_at && (
                    <span className="document-date">{formatDate(item.updated_at)}</span>
                )}
            </>
        );
    };

    // Render dropdown menu content
    const renderDropdownContent = (item, onClose) => {
        const actions = (actionItems ? actionItems(item) : getActionItems(item, {
            itemType,
            onViewItem: (it) => (it.status === 'completed' && itemType === 'document') ? handleEnhancedPreview(it) : handleViewItem(it),
            onEditItem: handleEditItem,
            onShareItem: handleShareItem,
            onDeleteItem: handleDelete,
            onRefreshDocument: handleRefreshDocument,
            deletingId: deleting,
            refreshingId: refreshing,
            wolkeShareLinks,
        })).filter(action => 
            action.separator || action.show !== false
        );

        return (
            <div>
                {actions.map((action, index) => {
                    if (action.separator) {
                        return <div key={index} className="menu-dropdown-separator"></div>;
                    }

                    // Handle submenu items (like Copy Links)
                    if (action.submenu && action.submenuItems) {
                        const IconComponent = action.icon;
                        
                        return (
                            <div key={index} className="menu-dropdown-submenu-container">
                                <div className="menu-dropdown-submenu-trigger">
                                    <button className="menu-dropdown-item submenu-trigger">
                                        <IconComponent />
                                        {action.label}
                                        <HiChevronRight className="submenu-arrow" />
                                    </button>
                                    <div className="menu-dropdown-submenu-content">
                                        {action.submenuItems.map((subItem, subIndex) => (
                                            <button
                                                key={subIndex}
                                                className="menu-dropdown-item submenu-item"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    // Call the copy function if it exists on the subItem
                                                    if (subItem.onClick) {
                                                        subItem.onClick(onClose);
                                                    }
                                                }}
                                                title={subItem.description}
                                            >
                                                <HiClipboard />
                                                {subItem.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        );
                    }

                    // Regular menu items
                    const IconComponent = action.icon;
                    
                    return (
                        <button
                            key={index}
                            className={`menu-dropdown-item ${action.danger ? 'danger' : ''}`}
                            onClick={(e) => {
                                e.stopPropagation();
                                action.onClick();
                                onClose && onClose();
                            }}
                            disabled={action.loading}
                        >
                            {action.loading ? (
                                <>
                                    <Spinner size="xsmall" />
                                    {action.label}...
                                </>
                            ) : (
                                <>
                                    <IconComponent />
                                    {action.label}
                                </>
                            )}
                        </button>
                    );
                })}
            </div>
        );
    };

    // Render empty state
    const renderEmptyState = () => {
        const defaultIcon = itemType === 'qa' ? NotebookIcon : HiOutlineDocumentText;
        const DefaultIcon = defaultIcon;
        const defaultMessage = itemType === 'qa' ? 'Keine Q&A-Sammlungen vorhanden.' : 'Keine Dokumente vorhanden.';
        
        return (
            <div className="document-overview-empty-state">
                <DefaultIcon size={48} className="empty-state-icon" />
                <p>{emptyStateConfig.noDocuments || defaultMessage}</p>
                {emptyStateConfig.createMessage && (
                    <p>{emptyStateConfig.createMessage}</p>
                )}
            </div>
        );
    };

    // Render preview modal (extracted component)
    const renderPreview = () => {
        if (!selectedItem) return null;
        return (
            <DocumentPreviewModal
                item={selectedItem}
                itemType={itemType}
                documentTypes={documentTypes}
                onClose={() => setShowPreview(false)}
            />
        );
    };

    // Render grouped content via extracted component
    const renderGroupedContent = () => (
        <DocumentGroupedContent
            groupedItems={groupedItems}
            expandedGroups={expandedGroups}
            onToggleGroup={toggleGroupExpansion}
            cardRenderer={cardRenderer}
            renderDefaultCard={renderDefaultCard}
        />
    );
    
    if (loading && allItems.length === 0) {
        return <div className="document-overview-loading"><Spinner /></div>;
    }

    return (
        <div className="document-overview-container">
            <div className="document-overview-card">
                <div className="document-overview-header">
                    <div className="document-overview-header-left">
                        <h3>{title} ({(() => {
                            const usingRemote = remoteSearchEnabled && searchState.hasQuery;
                            const itemsToShow = usingRemote ? normalizeRemoteResults(remoteResults) : filteredItems;
                            return itemsToShow.length;
                        })()})</h3>
                    </div>
                    
                    <div className="document-overview-header-actions">
                        {/* Bulk delete button */}
                        {enableBulkSelect && onBulkDelete && selectedItemIds.size > 0 && (
                            <div className="document-overview-bulk-actions">
                                <button
                                    type="button"
                                    className="pabtn pabtn--delete pabtn--s"
                                    onClick={() => setShowBulkDeleteModal(true)}
                                    disabled={isBulkDeleting}
                                >
                                    <HiOutlineTrash className="pabtn__icon" />
                                    <span className="pabtn__label">{selectedItemIds.size} löschen</span>
                                </button>
                            </div>
                        )}
                        
                        {headerActions && (
                            <div className="document-overview-custom-actions">
                                {headerActions}
                            </div>
                        )}
                        {/* Removed built-in refresh to avoid duplicate sync/refresh controls */}
                    </div>
                </div>

                <div className="document-overview-content">
                    {/* Search and Sort Controls */}
                    <div className="document-overview-controls">
                        {enableLocalSearch && (
                          <div className="search-container" style={{ maxWidth: '250px', flexShrink: 0 }}>
                              <HiOutlineSearch className="search-icon" />
                              <input
                                  type="text"
                                  className="form-input search-input"
                                  placeholder={searchPlaceholder}
                                  value={searchState.searchQuery}
                                  onChange={(e) => searchState.setSearchQuery(e.target.value)}
                                  style={{ fontSize: '14px' }}
                              />
                          </div>
                        )}
                        {remoteSearchEnabled && (
                            <div className="search-mode-controls" style={{ marginLeft: '8px' }}>
                                <select
                                    className="form-select"
                                    value={searchState.searchMode}
                                    onChange={(e) => searchState.setSearchMode(e.target.value)}
                                    title="Suchmodus"
                                >
                                    <option value="intelligent">Intelligent</option>
                                    <option value="fulltext">Volltext</option>
                                </select>
                            </div>
                        )}
                        <div className="sort-controls">
                            <select 
                                className="form-select"
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value)}
                            >
                                {[...sortOptions, ...(remoteSearchEnabled && searchState.hasQuery ? [{ value: 'similarity_score', label: 'Relevanz' }] : [])].map(option => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                            <button
                                className="sort-order-button"
                                onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                                title={sortOrder === 'asc' ? 'Aufsteigend sortiert' : 'Absteigend sortiert'}
                            >
                                {sortOrder === 'asc' ? '↑' : '↓'}
                            </button>
                            
                            {/* Select all checkbox - positioned next to sort controls */}
                            <SelectAllCheckbox
                                enabled={enableBulkSelect && !!onBulkDelete}
                                disabledWhenRemote={true}
                                isRemoteActive={remoteSearchEnabled && searchState.hasQuery}
                                filteredItems={filteredItems}
                                itemType={itemType}
                                selectedItemIds={selectedItemIds}
                                onToggleAll={handleSelectAll}
                            />
                        </div>
                    </div>

                    {/* Items Grid (supports remote results) */}
                    {(() => {
                        const usingRemote = remoteSearchEnabled && searchState.hasQuery;
                        const itemsToShow = usingRemote ? normalizeRemoteResults(remoteResults) : filteredItems;


                        if (itemsToShow.length === 0) {
                            if (!searchState.hasQuery) {
                                return renderEmptyState();
                            }
                            
                            // Handle empty search results
                            const status = searchState.getSearchStatus(isRemoteSearchingValue);
                            if (status) {
                                return (
                                    <div className="document-overview-empty-state">
                                        <p>{status}</p>
                                    </div>
                                );
                            }
                            
                            if (searchState.shouldShowNoResults(0, isRemoteSearchingValue)) {
                                return (
                                    <div className="document-overview-empty-state">
                                        <p>Keine Ergebnisse gefunden für "{searchState.searchQuery}"</p>
                                    </div>
                                );
                            }
                            
                            return null;
                        }

                        if (!usingRemote && enableGrouping && itemType === 'document') {
                            return renderGroupedContent();
                        }

                        // Sort remote results by selected sort if needed
                        const sorted = [...itemsToShow].sort((a, b) => {
                            const valA = getSortValue(a, sortBy);
                            const valB = getSortValue(b, sortBy);
                            return sortOrder === 'asc' ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
                        });

                        return (
                            <div className="document-overview-grid">
                                {sorted.map((item) => (
                                    cardRenderer ? cardRenderer(item) : renderDefaultCard(item)
                                ))}
                            </div>
                        );
                    })()}
                </div>
            </div>

            {/* Preview Modal */}
            {showPreview && renderPreview()}

            {/* Bulk Delete Confirmation Modal */}
            <BulkDeleteConfirmModal
                isOpen={showBulkDeleteModal}
                onClose={() => setShowBulkDeleteModal(false)}
                onConfirm={handleBulkDelete}
                itemCount={selectedItemIds.size}
                itemType={itemType === 'qa' ? 'qas' : itemType === 'document' ? 'documents' : 'texts'}
                isDeleting={isBulkDeleting}
            />
        </div>
    );
};

export default DocumentOverview;
