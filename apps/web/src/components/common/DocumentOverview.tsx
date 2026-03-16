import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@gruenerator/ui';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { FaFileWord, FaFilePdf } from 'react-icons/fa6';
import {
  HiOutlineTrash,
  HiOutlineSearch,
  HiOutlineDocumentText,
  HiOutlinePencil,
  HiOutlineEye,
  HiRefresh,
  HiDotsVertical,
  HiExclamationCircle,
  HiShare,
  HiClipboard,
} from 'react-icons/hi';
import { IoDownloadOutline } from 'react-icons/io5';

import { NotebookIcon } from '../../config/icons';
import { useFilteredAndGroupedItems } from '../../hooks/useFilteredAndGroupedItems';
import { useSearchState } from '../../hooks/useSearchState';
import { useExportStore } from '../../stores/core/exportStore';
import { cn } from '../../utils/cn';
import apiClient from '../utils/apiClient';
import {
  truncateForPreview,
  stripMarkdownForPreview,
  getSortValueFactory,
  normalizeRemoteResults,
  formatDate,
} from '../utils/documentOverviewUtils';

import BulkDeleteConfirmModal from './BulkDeleteConfirmModal';
import DocumentPreviewModal from './DocumentPreviewModal';
import EnhancedSelect from './EnhancedSelect/EnhancedSelect';
import { getActionItems } from './ItemActionBuilder';
import SelectAllCheckbox from './SelectAllCheckbox';
import Spinner from './Spinner';

// Define default values outside component to prevent re-creation on every render
const DEFAULT_SEARCH_FIELDS = ['title', 'content_preview', 'full_content'];
const DEFAULT_SORT_OPTIONS = [
  { value: 'updated_at', label: 'Zuletzt geändert' },
  { value: 'created_at', label: 'Erstellungsdatum' },
  { value: 'title', label: 'Titel' },
  { value: 'word_count', label: 'Wortanzahl' },
];

// Types
export interface DocumentItem {
  id: string;
  title?: string;
  name?: string;
  status?: string;
  source_type?: string;
  description?: string;
  custom_prompt?: string;
  preview_image_url?: string;
  thumbnail_url?: string;
  document_count?: number;
  is_public?: boolean;
  created_at?: string;
  updated_at?: string;
  view_count?: number;
  similarity_score?: number;
  markdown_content?: string;
  full_content?: string;
  content_preview?: string;
  ocr_text?: string;
  [key: string]: unknown;
}

interface SortOption {
  value: string;
  label: string;
}

interface EmptyStateConfig {
  noDocuments?: string;
  createMessage?: string;
}

interface WolkeShareLink {
  id: string;
  [key: string]: unknown;
}

interface SubMenuItem {
  label: string;
  description?: string;
  onClick?: (onClose?: () => void) => void;
}

interface ActionItem {
  separator?: boolean;
  show?: boolean;
  label?: string;
  icon?: React.ComponentType<{ className?: string }>;
  onClick?: () => void;
  danger?: boolean;
  loading?: boolean;
  submenu?: boolean;
  submenuItems?: SubMenuItem[];
}

interface DocumentOverviewProps {
  documents?: DocumentItem[];
  items?: DocumentItem[];
  loading?: boolean;
  onFetch?: () => void;
  onDelete?: (id: string, item: DocumentItem) => Promise<void>;
  onBulkDelete?: (ids: string[]) => Promise<void>;
  onUpdateTitle?: (id: string, title: string) => Promise<void>;
  onEdit?: (item: DocumentItem) => void;
  onView?: (item: DocumentItem) => void;
  onRefreshDocument?: (id: string) => Promise<void>;
  onShare?: (item: DocumentItem) => void;
  documentTypes?: Record<string, string>;
  itemType?: 'document' | 'notebook';
  searchFields?: string[];
  sortOptions?: SortOption[];
  cardRenderer?: (item: DocumentItem) => React.ReactNode;
  metaRenderer?: (item: DocumentItem) => React.ReactNode;
  actionItems?: (item: DocumentItem) => ActionItem[];
  emptyStateConfig?: EmptyStateConfig;
  searchPlaceholder?: string;
  onSuccessMessage?: (message: string) => void;
  onErrorMessage?: (message: string) => void;
  title?: string;
  showRefreshButton?: boolean;
  headerActions?: React.ReactNode;
  enableBulkSelect?: boolean;
  enableGrouping?: boolean;
  enableLocalSearch?: boolean;
  remoteSearchEnabled?: boolean;
  onRemoteSearch?: (query: string, mode: string) => void;
  isRemoteSearching?: boolean;
  remoteResults?: DocumentItem[];
  onClearRemoteSearch?: () => void;
  remoteSearchDefaultMode?: 'intelligent' | 'fulltext';
  wolkeShareLinks?: WolkeShareLink[];
}

const DocumentOverview = ({
  documents = [],
  items,
  loading = false,
  onFetch,
  onDelete,
  onBulkDelete,
  onUpdateTitle,
  onEdit,
  onView,
  onRefreshDocument,
  onShare,
  documentTypes = {},
  itemType = 'document',
  searchFields = DEFAULT_SEARCH_FIELDS,
  sortOptions = DEFAULT_SORT_OPTIONS,
  cardRenderer,
  metaRenderer,
  actionItems,
  emptyStateConfig = {},
  searchPlaceholder = 'Dokumente durchsuchen...',
  onSuccessMessage,
  onErrorMessage,
  title = 'Dokumente',
  showRefreshButton = true,
  headerActions,
  enableBulkSelect = true,
  enableGrouping = false,
  enableLocalSearch = true,
  remoteSearchEnabled = false,
  onRemoteSearch,
  isRemoteSearching = false,
  remoteResults = [],
  onClearRemoteSearch,
  remoteSearchDefaultMode = 'intelligent',
  wolkeShareLinks = [],
}: DocumentOverviewProps) => {
  // Support both 'documents' (backward compatibility) and 'items' props
  const allItems = items || documents;

  // Ensure isRemoteSearching always has a defined value to prevent scope issues
  const isRemoteSearchingValue = isRemoteSearching ?? false;

  // Search state management using custom hook
  const searchState = useSearchState({
    mode: remoteSearchEnabled ? 'remote' : 'local',
    onRemoteSearch,
    onClearRemoteSearch,
    searchMode: remoteSearchDefaultMode,
  });

  // Sort state (must be declared before useFilteredAndGroupedItems)
  const [sortBy, setSortBy] = useState(sortOptions[0]?.value || 'updated_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Derived items and filtering
  const { filteredItems } = useFilteredAndGroupedItems({
    items: allItems,
    itemType,
    searchFields,
    sortBy,
    sortOrder,
    enableGrouping: false, // Grouping disabled - using category filter instead
    searchState,
  }) as { filteredItems: DocumentItem[]; groupedItems: Record<string, DocumentItem[]> };

  // Component state
  const [selectedItem, setSelectedItem] = useState<DocumentItem | null>(null);
  const [showPreview, setShowPreview] = useState<boolean>(false);
  const [editingTitle, setEditingTitle] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState<string>('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Category filter state
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Category options with counts
  const categoryOptions = useMemo(() => {
    // Early return for empty state - skip reduce computation
    if (!allItems || allItems.length === 0) {
      return [{ value: 'all', label: 'Alle Dokumente (0)', icon: '📄' }];
    }

    const counts = allItems.reduce<Record<string, number>>((acc, item) => {
      if (itemType === 'document') {
        const sourceType = item.source_type || 'manual';
        acc[sourceType] = (acc[sourceType] || 0) + 1;
        acc.all = (acc.all || 0) + 1;
      } else {
        acc.all = (acc.all || 0) + 1;
      }
      return acc;
    }, {});

    const options = [
      {
        value: 'all',
        label: `Alle Dokumente (${counts.all || 0})`,
        icon: '📄',
      },
    ];

    if (itemType === 'document') {
      if (counts.wolke > 0) {
        options.push({
          value: 'wolke',
          label: `Wolke Dokumente (${counts.wolke})`,
          icon: '☁️',
        });
      }
      if (counts.manual > 0) {
        options.push({
          value: 'manual',
          label: `Manuelle Uploads (${counts.manual})`,
          icon: '📁',
        });
      }
      if (counts.url > 0) {
        options.push({
          value: 'url',
          label: `URL Dokumente (${counts.url})`,
          icon: '🔗',
        });
      }
    }

    return options;
  }, [allItems, itemType]);

  // Apply category filtering to items
  const categoryFilteredItems = useMemo((): DocumentItem[] => {
    if (selectedCategory === 'all') {
      return filteredItems;
    }
    return filteredItems.filter((item) => {
      if (itemType === 'document') {
        const sourceType = item.source_type || 'manual';
        return sourceType === selectedCategory;
      }
      return true;
    });
  }, [filteredItems, selectedCategory, itemType]);

  // Bulk selection state
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

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
  const handleDelete = async (item: DocumentItem) => {
    const itemName = itemType === 'notebook' ? item.name : item.title;
    const confirmMessage =
      itemType === 'notebook'
        ? `Möchten Sie das Notebook "${itemName}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`
        : 'Möchtest du dieses Dokument wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.';

    if (!window.confirm(confirmMessage)) {
      return;
    }

    setDeleting(item.id);
    try {
      if (onDelete) {
        await onDelete(item.id, item);
      }

      // Close preview if deleted item was selected
      if (selectedItem?.id === item.id) {
        setSelectedItem(null);
        setShowPreview(false);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
      onErrorMessage?.('Fehler beim Löschen: ' + errorMessage);
    } finally {
      setDeleting(null);
    }
  };

  // Handle title editing
  const handleTitleEdit = (item: DocumentItem) => {
    setEditingTitle(item.id);
    const currentTitle = itemType === 'notebook' ? item.name : item.title;
    setNewTitle(currentTitle || '');
  };

  const handleTitleSave = async (itemId: string) => {
    const originalItem = allItems.find((item) => item.id === itemId);
    const originalTitle = itemType === 'notebook' ? originalItem?.name : originalItem?.title;

    if (newTitle.trim() && newTitle.trim() !== originalTitle && onUpdateTitle) {
      try {
        await onUpdateTitle(itemId, newTitle.trim());
        onSuccessMessage?.('Titel erfolgreich aktualisiert');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
        onErrorMessage?.('Fehler beim Aktualisieren des Titels: ' + errorMessage);
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
  const handleSelectItem = (itemId: string, isSelected: boolean) => {
    setSelectedItemIds((prev) => {
      const newSet = new Set(prev);
      if (isSelected) {
        newSet.add(itemId);
      } else {
        newSet.delete(itemId);
      }
      return newSet;
    });
  };

  const handleSelectAll = (isSelected: boolean) => {
    // Only allow bulk select for non-Wolke documents
    const selectable = categoryFilteredItems.filter(
      (item) => itemType !== 'document' || item.source_type !== 'wolke'
    );
    if (isSelected) {
      setSelectedItemIds(new Set<string>(selectable.map((item) => item.id)));
    } else {
      setSelectedItemIds(new Set<string>());
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

      onSuccessMessage?.(
        `${idsArray.length} ${idsArray.length === 1 ? 'Element' : 'Elemente'} erfolgreich gelöscht.`
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
      onErrorMessage?.('Fehler beim Bulk-Löschen: ' + errorMessage);
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const clearSelection = () => {
    setSelectedItemIds(new Set());
  };

  // Reset selection when items change
  useEffect(() => {
    setSelectedItemIds((prev) => {
      const newSet = new Set<string>();
      const activeItems =
        remoteSearchEnabled && searchState.hasQuery ? remoteResults || [] : allItems;
      const currentIds = new Set<string>((activeItems || []).map((item) => item.id));
      prev.forEach((id) => {
        if (currentIds.has(id)) {
          newSet.add(id);
        }
      });
      return newSet;
    });
  }, [allItems, remoteResults, remoteSearchEnabled, searchState.hasQuery]);

  // Item action handlers
  const handleViewItem = (item: DocumentItem) => {
    if (onView) {
      onView(item);
    } else {
      setSelectedItem(item);
      setShowPreview(true);
    }
  };

  const handleEditItem = (item: DocumentItem) => {
    onEdit?.(item);
  };

  const handleShareItem = (item: DocumentItem) => {
    onShare?.(item);
  };

  // Handle document refresh (for processing/pending documents)
  const handleRefreshDocument = async (item: DocumentItem) => {
    if (!onRefreshDocument) return;

    setRefreshing(item.id);
    try {
      await onRefreshDocument(item.id);
      onSuccessMessage?.('Dokumentstatus wurde aktualisiert.');
    } catch (error) {
      console.error('[DocumentOverview] Error refreshing document:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
      onErrorMessage?.('Fehler beim Aktualisieren des Dokumentstatus: ' + errorMessage);
    } finally {
      setRefreshing(null);
    }
  };

  // Enhanced preview with API content fetch (document-specific)
  const handleEnhancedPreview = async (item: DocumentItem) => {
    if (itemType === 'notebook' || item.full_content) {
      setSelectedItem(item);
      setShowPreview(true);
      return;
    }

    setPreviewLoading(true);
    setPreviewError(null);

    try {
      const response = await apiClient.get(`/documents/${item.id}/content`);
      const data = response.data;
      const enhancedItem: DocumentItem = {
        ...item,
        full_content: data.data.ocr_text || 'Kein Text extrahiert',
        markdown_content: data.data.markdown_content,
      };

      setSelectedItem(enhancedItem);
      setShowPreview(true);
    } catch (error) {
      console.error('[DocumentOverview] Error fetching document content:', error);
      setPreviewError('Fehler beim Laden des Dokument-Inhalts');
      const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
      onErrorMessage?.('Fehler beim Laden des Dokument-Inhalts: ' + errorMessage);
    } finally {
      setPreviewLoading(false);
    }
  };

  // Export functionality
  const { generateDOCX, generatePDF, isGenerating: isExporting } = useExportStore();

  const getDocumentContent = async (item: DocumentItem): Promise<string> => {
    const existing = item.markdown_content || item.full_content || item.ocr_text;
    if (existing) return existing;

    const response = await apiClient.get(`/documents/${item.id}/content`);
    const data = response.data;
    return data.data.markdown_content || data.data.ocr_text || '';
  };

  const handleExportDOCX = async (item: DocumentItem) => {
    try {
      const content = await getDocumentContent(item);
      if (!content) {
        onErrorMessage?.('Kein Inhalt zum Exportieren verfügbar.');
        return;
      }
      await generateDOCX(content, item.title || 'Dokument');
    } catch (error) {
      console.error('[DocumentOverview] DOCX export error:', error);
      onErrorMessage?.('Fehler beim Erstellen der Word-Datei.');
    }
  };

  const handleExportPDF = async (item: DocumentItem) => {
    try {
      const content = await getDocumentContent(item);
      if (!content) {
        onErrorMessage?.('Kein Inhalt zum Exportieren verfügbar.');
        return;
      }
      await generatePDF(content, item.title || 'Dokument');
    } catch (error) {
      console.error('[DocumentOverview] PDF export error:', error);
      onErrorMessage?.('Fehler beim Erstellen der PDF-Datei.');
    }
  };

  // Helper to get file extension from filename
  const getFileExtension = (filename?: string) => {
    if (!filename) return null;
    const ext = filename.split('.').pop()?.toUpperCase();
    return ext && ext.length <= 4 ? ext : null;
  };

  // Render default card
  const renderDefaultCard = (item: DocumentItem) => {
    const itemTitle = itemType === 'notebook' ? item.name : item.title;
    const isDocument = itemType === 'document';
    const fileExt = isDocument ? getFileExtension(item.title || '') : null;

    return (
      <div
        key={item.id}
        className="group relative bg-background border-2 border-grey-200 dark:border-grey-700 rounded-lg p-lg transition-[transform,box-shadow,border-color] duration-200 flex flex-col min-h-[220px] shadow-sm hover:-translate-y-0.5 hover:border-primary-400 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:transform-none max-md:min-h-[180px] max-md:p-md max-sm:p-sm"
      >
        {/* File Type Badge */}
        {fileExt && (
          <span className="absolute top-sm right-sm px-1.5 py-0.5 bg-secondary-600/15 text-secondary-700 dark:text-secondary-300 text-[0.6rem] font-bold tracking-wide rounded uppercase">
            {fileExt}
          </span>
        )}

        {/* Header with title and dropdown menu */}
        <div className="flex justify-between items-start mb-sm gap-sm max-sm:flex-col max-sm:items-stretch max-sm:gap-xs">
          {/* Bulk selection checkbox */}
          {enableBulkSelect &&
            onBulkDelete &&
            !(itemType === 'document' && item.source_type === 'wolke') && (
              <div className="mr-xs">
                <input
                  type="checkbox"
                  className="w-[18px] h-[18px] cursor-pointer accent-primary-600"
                  checked={selectedItemIds.has(item.id)}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    e.stopPropagation();
                    handleSelectItem(item.id, e.target.checked);
                  }}
                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                />
              </div>
            )}

          {editingTitle === item.id ? (
            <div className="flex flex-col gap-xs flex-1">
              <input
                type="text"
                className="form-input text-base font-semibold p-xs"
                value={newTitle}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTitle(e.target.value)}
                onKeyDown={(e: React.KeyboardEvent) => {
                  if (e.key === 'Enter') handleTitleSave(item.id);
                  if (e.key === 'Escape') handleTitleCancel();
                }}
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
                autoFocus
              />
              <div className="flex gap-xs">
                <button
                  className="pabtn pabtn--primary pabtn--s"
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    handleTitleSave(item.id);
                  }}
                >
                  <span className="pabtn__label">✓</span>
                </button>
                <button
                  className="pabtn pabtn--ghost pabtn--s"
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    handleTitleCancel();
                  }}
                >
                  <span className="pabtn__label">✕</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 min-w-0">
              <h4
                className={cn(
                  'm-0 text-foreground-heading text-base font-semibold leading-tight cursor-pointer transition-colors duration-200 overflow-hidden text-ellipsis whitespace-nowrap max-w-full hover:text-primary-600',
                  onUpdateTitle && 'hover:text-primary-600',
                  'select-none hover:underline'
                )}
                onClick={(e: React.MouseEvent) => {
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="bg-transparent border-none cursor-pointer p-xs rounded-lg text-grey-500 dark:text-grey-400 text-[1.2rem] leading-none transition-all duration-200 flex items-center justify-center min-w-[32px] h-8 hover:bg-hover-alt hover:text-foreground max-sm:self-end">
                <HiDotsVertical />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">{renderDropdownContent(item)}</DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Preview Image for Templates */}
        {(item.preview_image_url || item.thumbnail_url) && (
          <div className="my-sm rounded-md overflow-hidden bg-grey-50 dark:bg-grey-800">
            <img
              src={item.preview_image_url || item.thumbnail_url}
              alt={`Vorschau von ${itemTitle}`}
              className="w-full h-auto max-h-[180px] object-cover object-center block transition-transform duration-200 hover:scale-[1.02] max-sm:max-h-[150px]"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
              loading="lazy"
            />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 mb-sm">
          {itemType === 'notebook' ? (
            <>
              {item.description && (
                <p className="text-foreground italic mb-sm">{item.description}</p>
              )}
              {item.custom_prompt && (
                <div className="mt-sm p-sm bg-grey-50 dark:bg-grey-800 rounded-lg border-l-[3px] border-l-primary-600 dark:border-l-primary-400">
                  <strong className="block text-primary-600 text-[0.75rem] uppercase tracking-wide mb-xs">
                    Anweisungen:
                  </strong>
                  <p className="m-0 text-foreground text-sm leading-normal italic">
                    {item.custom_prompt}
                  </p>
                </div>
              )}
            </>
          ) : (
            <p className="m-0 text-grey-500 dark:text-grey-400 text-[0.85rem] leading-normal line-clamp-3">
              {(() => {
                const raw =
                  item.markdown_content ||
                  item.full_content ||
                  item.content_preview ||
                  item.ocr_text;
                const text = stripMarkdownForPreview(raw);
                return text || 'Kein Inhalt verfügbar';
              })()}
            </p>
          )}
        </div>

        {/* Footer with metadata */}
        <div className="flex justify-between items-center gap-sm text-[0.8rem] text-grey-500 dark:text-grey-400 border-t border-grey-200 dark:border-grey-700 pt-sm flex-wrap mt-auto max-md:flex-col max-md:items-start max-md:gap-xs">
          {metaRenderer ? metaRenderer(item) : renderDefaultMeta(item)}
        </div>
      </div>
    );
  };

  // Render default metadata
  const renderDefaultMeta = (item: DocumentItem) => {
    if (itemType === 'notebook') {
      return (
        <>
          {item.document_count !== undefined && (
            <span className="bg-secondary-600/10 dark:bg-secondary-600/20 text-secondary-700 dark:text-secondary-300 font-medium px-xs py-0.5 rounded-md whitespace-nowrap before:content-['📄'] before:mr-0.5">
              {item.document_count} Dokument{item.document_count !== 1 ? 'e' : ''}
            </span>
          )}
          {item.is_public && (
            <span className="bg-primary-600/10 dark:bg-primary-600/20 text-primary-700 dark:text-primary-300 font-medium px-xs py-0.5 rounded-md whitespace-nowrap before:content-['🌍'] before:mr-0.5">
              Öffentlich
            </span>
          )}
          {item.created_at && (
            <span className="whitespace-nowrap">{formatDate(item.created_at)}</span>
          )}
          {item.view_count && item.view_count > 0 && (
            <span className="whitespace-nowrap">{item.view_count} Aufrufe</span>
          )}
        </>
      );
    }

    return (
      <>
        {/* Source badge */}
        {itemType === 'document' && item.source_type && (
          <span>
            {item.source_type === 'wolke' ? '☁️' : item.source_type === 'url' ? '🔗' : '📁'}
          </span>
        )}
        {item.similarity_score != null && (
          <span className="whitespace-nowrap">
            Relevanz: {Math.round(item.similarity_score * 100)}%
          </span>
        )}
        {item.updated_at && (
          <span className="whitespace-nowrap">{formatDate(item.updated_at)}</span>
        )}
      </>
    );
  };

  // Render dropdown menu content
  const renderDropdownContent = (item: DocumentItem) => {
    const actions: ActionItem[] = (
      actionItems
        ? actionItems(item)
        : getActionItems(item, {
            itemType,
            onViewItem: (it: DocumentItem) =>
              it.status === 'completed' && itemType === 'document'
                ? handleEnhancedPreview(it)
                : handleViewItem(it),
            onEditItem: handleEditItem,
            onShareItem: handleShareItem,
            onDeleteItem: handleDelete,
            onRefreshDocument: handleRefreshDocument,
            deletingId: deleting,
            refreshingId: refreshing,
            wolkeShareLinks,
          })
    ).filter((action) => action.separator || action.show !== false);

    return (
      <>
        {actions.map((action, index) => {
          if (action.separator) {
            return <DropdownMenuSeparator key={index} />;
          }

          // Handle submenu items (like Copy Links)
          if (action.submenu && action.submenuItems && action.icon) {
            const IconComponent = action.icon;

            return (
              <DropdownMenuSub key={index}>
                <DropdownMenuSubTrigger>
                  <IconComponent />
                  {action.label}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {action.submenuItems.map((subItem, subIndex) => (
                    <DropdownMenuItem
                      key={subIndex}
                      onClick={() => subItem.onClick?.()}
                      title={subItem.description}
                    >
                      <HiClipboard />
                      {subItem.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            );
          }

          // Regular menu items
          if (!action.icon || !action.onClick) {
            return null;
          }

          const IconComponent = action.icon;
          const handleClick = action.onClick;

          return (
            <DropdownMenuItem
              key={index}
              variant={action.danger ? 'destructive' : 'default'}
              onClick={handleClick}
              disabled={action.loading}
            >
              {action.loading ? (
                <>
                  <Spinner size="small" />
                  {action.label}...
                </>
              ) : (
                <>
                  <IconComponent />
                  {action.label}
                </>
              )}
            </DropdownMenuItem>
          );
        })}

        {/* Export submenu for documents/texts with content (hide for processing/pending) */}
        {itemType === 'document' && item.status !== 'processing' && item.status !== 'pending' && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <IoDownloadOutline />
                Exportieren
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem onClick={() => handleExportDOCX(item)} disabled={isExporting}>
                  <FaFileWord />
                  Word (.docx)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExportPDF(item)} disabled={isExporting}>
                  <FaFilePdf />
                  PDF (.pdf)
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>
        )}
      </>
    );
  };

  // Render empty state
  const renderEmptyState = () => {
    const defaultIcon = itemType === 'notebook' ? NotebookIcon : HiOutlineDocumentText;
    const DefaultIcon = defaultIcon;
    const defaultMessage =
      itemType === 'notebook' ? 'Keine Notebooks vorhanden.' : 'Keine Dokumente vorhanden.';

    return (
      <div className="text-center py-2xl px-md text-grey-500 dark:text-grey-400">
        <DefaultIcon size={48} className="text-primary-400 mb-md opacity-80" />
        <p className="my-sm text-base leading-normal font-medium text-foreground">
          {emptyStateConfig.noDocuments || defaultMessage}
        </p>
        {emptyStateConfig.createMessage && (
          <p className="my-sm text-base leading-normal">{emptyStateConfig.createMessage}</p>
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

  if (loading && allItems.length === 0) {
    return (
      <div className="flex justify-center items-center py-xl">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex justify-between items-center py-md border-b border-grey-200 dark:border-grey-700 mb-md max-sm:flex-col max-sm:items-start max-sm:gap-sm">
        <div className="flex items-center gap-sm">
          <h3 className="m-0 text-foreground-heading text-[1.1rem] font-semibold flex items-center gap-sm">
            {title} (
            {(() => {
              const usingRemote = remoteSearchEnabled && searchState.hasQuery;
              const itemsToShow = usingRemote
                ? normalizeRemoteResults(remoteResults)
                : categoryFilteredItems;
              return itemsToShow.length;
            })()}
            )
          </h3>
        </div>

        <div className="flex items-center gap-sm max-sm:self-end">
          {headerActions && <div className="flex items-center gap-sm">{headerActions}</div>}
        </div>
      </div>

      <div>
        {/* Search and Sort Controls */}
        <div className="flex flex-wrap gap-md mb-md items-center max-md:flex-col max-md:items-stretch max-md:gap-sm">
          {enableLocalSearch && (
            <div className="relative max-w-[250px] shrink-0 max-md:max-w-none max-md:min-w-0">
              <HiOutlineSearch className="absolute left-sm top-1/2 -translate-y-1/2 text-grey-500 dark:text-grey-400 text-[1.1rem] pointer-events-none" />
              <input
                type="text"
                className="form-input pl-[calc(var(--spacing-sm)*2+1.1rem)] w-full rounded-[20px] border border-grey-200 dark:border-grey-700 bg-background transition-[border-color,box-shadow] duration-200 focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-600/10 text-sm"
                placeholder={searchPlaceholder}
                value={searchState.searchQuery}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  searchState.setSearchQuery(e.target.value)
                }
              />
            </div>
          )}
          {remoteSearchEnabled && (
            <div className="ml-2">
              <select
                className="form-select"
                value={searchState.searchMode}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  searchState.setSearchMode(e.target.value)
                }
                title="Suchmodus"
              >
                <option value="intelligent">Intelligent</option>
                <option value="fulltext">Volltext</option>
              </select>
            </div>
          )}

          {/* Category Filter */}
          <div className="min-w-[180px] max-md:min-w-0 max-md:w-full">
            <EnhancedSelect
              options={categoryOptions}
              value={categoryOptions.find((opt) => opt.value === selectedCategory)}
              onChange={(selectedOption) => {
                const option = selectedOption as { value: string; label: string } | null;
                setSelectedCategory(option?.value || 'all');
              }}
              enableIcons={true}
              placeholder="Kategorie wählen..."
              className="category-filter-select"
              isSearchable={false}
              isClearable={false}
            />
          </div>

          <div className="flex gap-xs items-center max-md:justify-between max-md:w-full">
            <select
              className="form-select min-w-[140px] rounded-lg"
              value={sortBy}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSortBy(e.target.value)}
            >
              {[
                ...sortOptions,
                ...(remoteSearchEnabled && searchState.hasQuery
                  ? [{ value: 'similarity_score', label: 'Relevanz' }]
                  : []),
              ].map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              className="bg-background border border-grey-200 dark:border-grey-700 rounded-lg p-xs cursor-pointer text-foreground text-[1.2rem] leading-none min-w-[36px] h-9 flex items-center justify-center transition-all duration-200 hover:bg-hover-alt hover:border-primary-400 focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-600/10"
              onClick={() => setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
              title={sortOrder === 'asc' ? 'Aufsteigend sortiert' : 'Absteigend sortiert'}
            >
              {sortOrder === 'asc' ? '↑' : '↓'}
            </button>

            {/* Select all checkbox - positioned next to sort controls */}
            <SelectAllCheckbox
              enabled={enableBulkSelect && !!onBulkDelete}
              disabledWhenRemote={true}
              isRemoteActive={remoteSearchEnabled && searchState.hasQuery}
              filteredItems={categoryFilteredItems}
              itemType={itemType}
              selectedItemIds={selectedItemIds}
              onToggleAll={handleSelectAll}
            />
          </div>
        </div>

        {/* Items Grid (supports remote results) */}
        {(() => {
          const usingRemote = remoteSearchEnabled && searchState.hasQuery;
          const itemsToShow = usingRemote
            ? normalizeRemoteResults(remoteResults)
            : categoryFilteredItems;

          if (itemsToShow.length === 0) {
            if (!searchState.hasQuery) {
              return renderEmptyState();
            }

            // Handle empty search results
            const status = searchState.getSearchStatus(isRemoteSearchingValue);
            if (status) {
              return (
                <div className="text-center py-2xl px-md text-grey-500 dark:text-grey-400">
                  <p>{status}</p>
                </div>
              );
            }

            if (searchState.shouldShowNoResults(0, isRemoteSearchingValue)) {
              return (
                <div className="text-center py-2xl px-md text-grey-500 dark:text-grey-400">
                  <p>Keine Ergebnisse gefunden für "{searchState.searchQuery}"</p>
                </div>
              );
            }

            return null;
          }

          // Sort items by selected sort
          const sorted = [...itemsToShow].sort((a, b) => {
            const valA = getSortValue(a, sortBy);
            const valB = getSortValue(b, sortBy);
            return sortOrder === 'asc' ? (valA > valB ? 1 : -1) : valA < valB ? 1 : -1;
          });

          return (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-lg max-md:grid-cols-1 max-md:gap-md xl:grid-cols-[repeat(auto-fill,minmax(280px,1fr))] 2xl:grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
              {sorted.map((item) => (cardRenderer ? cardRenderer(item) : renderDefaultCard(item)))}
            </div>
          );
        })()}
      </div>

      {/* Bulk delete section at the end for better UX */}
      {enableBulkSelect && onBulkDelete && selectedItemIds.size > 0 && (
        <div className="p-md border-t border-grey-200 dark:border-grey-700 flex justify-center bg-grey-50 dark:bg-grey-800">
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

      {/* Preview Modal */}
      {showPreview && renderPreview()}

      {/* Bulk Delete Confirmation Modal */}
      <BulkDeleteConfirmModal
        isOpen={showBulkDeleteModal}
        onClose={() => setShowBulkDeleteModal(false)}
        onConfirm={handleBulkDelete}
        itemCount={selectedItemIds.size}
        itemType={itemType === 'notebook' ? 'qas' : itemType === 'document' ? 'documents' : 'texts'}
        isDeleting={isBulkDeleting}
      />
    </div>
  );
};

export default DocumentOverview;
