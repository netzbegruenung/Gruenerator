import React, { useState, useEffect, useCallback } from 'react';
import { HiOutlineTrash, HiOutlineSearch, HiOutlineDocumentText, HiOutlinePencil, HiOutlineEye, HiRefresh, HiDotsVertical, HiExclamationCircle, HiChatAlt2, HiShare, HiClipboard, HiChevronRight } from 'react-icons/hi';
import { motion } from "motion/react";
import ReactMarkdown from 'react-markdown';
import Spinner from './Spinner';
import MenuDropdown from './MenuDropdown';
import BulkDeleteConfirmModal from './BulkDeleteConfirmModal';

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
    enableBulkSelect = true // new prop to enable/disable bulk selection
}) => {
    // Support both 'documents' (backward compatibility) and 'items' props
    const allItems = items || documents;
    
    // State management
    const [filteredItems, setFilteredItems] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedItem, setSelectedItem] = useState(null);
    const [showPreview, setShowPreview] = useState(false);
    const [editingTitle, setEditingTitle] = useState(null);
    const [newTitle, setNewTitle] = useState('');
    const [deleting, setDeleting] = useState(null);
    const [refreshing, setRefreshing] = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState(null);
    const [sortBy, setSortBy] = useState(sortOptions[0]?.value || 'updated_at');
    const [sortOrder, setSortOrder] = useState('desc');
    
    // Bulk selection state
    const [selectedItemIds, setSelectedItemIds] = useState(new Set());
    const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
    const [isBulkDeleting, setIsBulkDeleting] = useState(false);

    // Generic search field getter
    const getSearchValue = useCallback((item, field) => {
        // Handle Q&A collections vs documents
        if (itemType === 'qa') {
            switch (field) {
                case 'title': return item.name || '';
                case 'content_preview': return item.description || '';
                case 'full_content': return item.custom_prompt || '';
                default: return item[field] || '';
            }
        }
        return item[field] || '';
    }, [itemType]);

    // Generic sort value getter
    const getSortValue = useCallback((item, field) => {
        // Handle Q&A collections vs documents
        if (itemType === 'qa') {
            switch (field) {
                case 'title': return (item.name || '').toLowerCase();
                case 'word_count': return item.document_count || 0;
                case 'view_count': return item.view_count || 0;
                case 'created_at': return item.created_at ? new Date(item.created_at) : new Date(0);
                case 'updated_at': return item.updated_at ? new Date(item.updated_at) : new Date(0);
                default: return item[field] || '';
            }
        }
        
        // Default document handling
        switch (field) {
            case 'title': return (item.title || '').toLowerCase();
            case 'word_count': return item.word_count || 0;
            case 'created_at': return item.created_at ? new Date(item.created_at) : new Date(0);
            case 'updated_at': return item.updated_at ? new Date(item.updated_at) : new Date(0);
            default: return item[field] || '';
        }
    }, [itemType]);

    // Filter and sort items
    useEffect(() => {
        if (!Array.isArray(allItems)) {
            setFilteredItems([]);
            return;
        }

        let filtered = [...allItems]; // Create a copy to avoid mutating the original array

        // Apply search filter
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(item => 
                searchFields.some(field => {
                    const value = getSearchValue(item, field);
                    return value && value.toLowerCase().includes(query);
                })
            );
        }

        // Apply sorting
        filtered.sort((a, b) => {
            const valueA = getSortValue(a, sortBy);
            const valueB = getSortValue(b, sortBy);

            if (sortOrder === 'asc') {
                return valueA > valueB ? 1 : -1;
            } else {
                return valueA < valueB ? 1 : -1;
            }
        });

        setFilteredItems(filtered);
    }, [allItems, searchQuery, sortBy, sortOrder, searchFields, getSearchValue, getSortValue]);

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
        if (isSelected) {
            setSelectedItemIds(new Set(filteredItems.map(item => item.id)));
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

    const clearSelection = () => {
        setSelectedItemIds(new Set());
    };

    // Reset selection when items change
    useEffect(() => {
        setSelectedItemIds(prev => {
            const newSet = new Set();
            const currentIds = new Set(allItems.map(item => item.id));
            prev.forEach(id => {
                if (currentIds.has(id)) {
                    newSet.add(id);
                }
            });
            return newSet;
        });
    }, [allItems]);

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

    // Format date
    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleString('de-DE', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    // Default action items for different types
    const getDefaultActionItems = (item) => {
        if (actionItems) {
            return actionItems(item); // Use custom action items if provided
        }

        if (itemType === 'qa') {
            return [
                {
                    icon: HiOutlineEye,
                    label: 'Q&A öffnen',
                    onClick: () => handleViewItem(item),
                    primary: true
                },
                {
                    icon: HiOutlinePencil,
                    label: 'Bearbeiten',
                    onClick: () => handleEditItem(item),
                    show: !!onEdit
                },
                {
                    icon: HiShare,
                    label: 'Mit Gruppe teilen',
                    onClick: () => handleShareItem(item),
                    show: !!onShare
                },
                {
                    separator: true
                },
                {
                    icon: HiOutlineTrash,
                    label: 'Löschen',
                    onClick: () => handleDelete(item),
                    show: !!onDelete,
                    danger: true,
                    loading: deleting === item.id
                }
            ];
        }

        // Default document actions
        return [
            {
                icon: HiOutlineEye,
                label: item.status === 'completed' ? 'Text-Vorschau' : 'Anzeigen',
                onClick: () => item.status === 'completed' ? handleEnhancedPreview(item) : handleViewItem(item),
                primary: true
            },
            {
                icon: HiRefresh,
                label: 'Status aktualisieren',
                onClick: () => handleRefreshDocument(item),
                show: (item.status === 'processing' || item.status === 'pending') && !!onRefreshDocument,
                loading: refreshing === item.id
            },
            {
                icon: HiOutlinePencil,
                label: 'Bearbeiten',
                onClick: () => handleEditItem(item),
                show: !!onEdit
            },
            {
                icon: HiShare,
                label: 'Mit Gruppe teilen',
                onClick: () => handleShareItem(item),
                show: !!onShare
            },
            {
                separator: true
            },
            {
                icon: HiOutlineTrash,
                label: 'Löschen',
                onClick: () => handleDelete(item),
                show: !!onDelete,
                danger: true,
                loading: deleting === item.id
            }
        ];
    };

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
                    {enableBulkSelect && onBulkDelete && (
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
                                    className="btn-primary size-xs"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleTitleSave(item.id);
                                    }}
                                >
                                    ✓
                                </button>
                                <button 
                                    className="btn-secondary size-xs"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleTitleCancel();
                                    }}
                                >
                                    ✕
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
                            {item.full_content || item.content_preview || 'Kein Inhalt verfügbar'}
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
        const actions = getDefaultActionItems(item).filter(action => 
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
        const defaultIcon = itemType === 'qa' ? HiChatAlt2 : HiOutlineDocumentText;
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

    // Render preview modal
    const renderPreview = () => {
        if (!selectedItem) return null;

        const itemTitle = itemType === 'qa' ? selectedItem.name : selectedItem.title;
        const previewContent = itemType === 'qa' 
            ? selectedItem.description || selectedItem.custom_prompt || 'Keine Beschreibung verfügbar'
            : selectedItem.full_content || selectedItem.content_preview || 'Kein Inhalt verfügbar';

        return (
            <motion.div 
                className="document-preview-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowPreview(false)}
            >
                <motion.div 
                    className="document-preview-modal"
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    onClick={e => e.stopPropagation()}
                >
                    <div className="document-preview-header">
                        <h3>{itemTitle}</h3>
                        <button 
                            className="document-preview-close"
                            onClick={() => setShowPreview(false)}
                        >
                            ×
                        </button>
                    </div>
                    <div className="document-preview-content">
                        <div className="document-preview-meta">
                            {itemType === 'qa' ? (
                                <>
                                    {selectedItem.document_count && (
                                        <span>Dokumente: {selectedItem.document_count}</span>
                                    )}
                                    {selectedItem.is_public && (
                                        <span>Öffentlich</span>
                                    )}
                                    {selectedItem.view_count && (
                                        <span>Aufrufe: {selectedItem.view_count}</span>
                                    )}
                                    {selectedItem.created_at && (
                                        <span>Erstellt: {formatDate(selectedItem.created_at)}</span>
                                    )}
                                </>
                            ) : (
                                <>
                                    {selectedItem.type && (
                                        <span>Typ: {documentTypes[selectedItem.type] || selectedItem.type}</span>
                                    )}
                                    {selectedItem.word_count && (
                                        <span>Wörter: {selectedItem.word_count}</span>
                                    )}
                                    {selectedItem.created_at && (
                                        <span>Erstellt: {formatDate(selectedItem.created_at)}</span>
                                    )}
                                    {selectedItem.updated_at && (
                                        <span>Geändert: {formatDate(selectedItem.updated_at)}</span>
                                    )}
                                </>
                            )}
                        </div>
                        <div className="document-preview-text">
                            {selectedItem.markdown_content ? (
                                <div className="antrag-text-content">
                                    <ReactMarkdown>
                                        {selectedItem.markdown_content}
                                    </ReactMarkdown>
                                </div>
                            ) : (
                                previewContent
                            )}
                        </div>
                    </div>
                    {onEdit && (
                        <div className="document-preview-actions">
                            <button 
                                className="btn-primary"
                                onClick={() => handleEditItem(selectedItem)}
                            >
                                <HiOutlinePencil /> Bearbeiten
                            </button>
                        </div>
                    )}
                </motion.div>
            </motion.div>
        );
    };

    if (loading && allItems.length === 0) {
        return <div className="document-overview-loading"><Spinner /></div>;
    }

    return (
        <div className="document-overview-container">
            <div className="document-overview-card">
                <div className="document-overview-header">
                    <div className="document-overview-header-left">
                        <h3>{title} ({filteredItems.length})</h3>
                    </div>
                    
                    <div className="document-overview-header-actions">
                        {/* Bulk delete button */}
                        {enableBulkSelect && onBulkDelete && selectedItemIds.size > 0 && (
                            <div className="document-overview-bulk-actions">
                                <button
                                    type="button"
                                    className="btn-danger size-s"
                                    onClick={() => setShowBulkDeleteModal(true)}
                                    disabled={isBulkDeleting}
                                >
                                    <HiOutlineTrash />
                                    {selectedItemIds.size} löschen
                                </button>
                            </div>
                        )}
                        
                        {headerActions && (
                            <div className="document-overview-custom-actions">
                                {headerActions}
                            </div>
                        )}
                        {showRefreshButton && onFetch && (
                            <button
                                type="button"
                                className="icon-button style-as-link"
                                onClick={onFetch}
                                disabled={loading}
                                title="Aktualisieren"
                            >
                                <HiRefresh />
                            </button>
                        )}
                    </div>
                </div>

                <div className="document-overview-content">
                    {/* Search and Sort Controls */}
                    <div className="document-overview-controls">
                        <div className="search-container" style={{ maxWidth: '250px', flexShrink: 0 }}>
                            <HiOutlineSearch className="search-icon" />
                            <input
                                type="text"
                                className="form-input search-input"
                                placeholder={searchPlaceholder}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                style={{ fontSize: '14px' }}
                            />
                        </div>
                        <div className="sort-controls">
                            <select 
                                className="form-select"
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value)}
                            >
                                {sortOptions.map(option => (
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
                            {enableBulkSelect && onBulkDelete && filteredItems.length > 0 && (
                                <div className="document-overview-select-all">
                                    <input
                                        type="checkbox"
                                        id="select-all-checkbox"
                                        checked={selectedItemIds.size > 0 && selectedItemIds.size === filteredItems.length}
                                        onChange={(e) => handleSelectAll(e.target.checked)}
                                        ref={(input) => {
                                            if (input) {
                                                input.indeterminate = selectedItemIds.size > 0 && selectedItemIds.size < filteredItems.length;
                                            }
                                        }}
                                    />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Items Grid */}
                    {filteredItems.length === 0 ? (
                        searchQuery ? (
                            <div className="document-overview-empty-state">
                                <p>Keine Ergebnisse gefunden für "{searchQuery}"</p>
                            </div>
                        ) : renderEmptyState()
                    ) : (
                        <div className="document-overview-grid">
                            {filteredItems.map((item) => (
                                cardRenderer ? cardRenderer(item) : renderDefaultCard(item)
                            ))}
                        </div>
                    )}
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