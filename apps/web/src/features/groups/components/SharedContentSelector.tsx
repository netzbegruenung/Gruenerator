import { useState, useMemo, useCallback, useRef, useEffect, lazy } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from "motion/react";
const ReactMarkdown = lazy(() => import('react-markdown'));
import {
  HiDocumentText,
  HiCollection,
  HiOutlineEye,
  HiOutlinePencil,
  HiOutlineTrash,
  HiOutlineSearch,
  HiOutlineViewGrid,
  HiOutlineViewList,
  HiOutlinePlus
} from 'react-icons/hi';
import { IconType } from 'react-icons';
import { NotebookIcon } from '../../../config/icons';
import Spinner from '../../../components/common/Spinner';
import apiClient from '../../../components/utils/apiClient';
import '../../../assets/styles/features/groups/shared-content-selector.css';
import '../../../assets/styles/components/profile/profile-action-buttons.css';

/** Permission flags for shared content */
interface ContentPermissions {
  read?: boolean;
  write?: boolean;
  collaborative?: boolean;
}

/** Base shared content item from the API */
interface SharedContentItemBase {
  id: string;
  title?: string;
  name?: string;
  description?: string;
  shared_at?: string;
  shared_by_name?: string;
  group_permissions?: ContentPermissions;
  content_preview?: string;
  full_content?: string;
  markdown_content?: string;
  word_count?: number;
  page_count?: number;
  document_count?: number;
  view_count?: number;
  preview_image_url?: string;
  thumbnail_url?: string;
  canva_url?: string;
  external_url?: string;
  content_data?: {
    originalUrl?: string;
  };
  slug?: string;
}

/** Extended content item with UI-specific properties */
interface ContentItem extends SharedContentItemBase {
  contentType: 'documents' | 'user_documents' | 'notebook_collections' | 'custom_generators' | 'database';
  icon: IconType;
  typeLabel: string;
}

/** Document content returned from API */
interface DocumentContent {
  full_content: string;
  markdown_content?: string;
}

/** Group content data structure from API */
interface GroupContent {
  documents?: SharedContentItemBase[];
  texts?: SharedContentItemBase[];
  notebooks?: SharedContentItemBase[];
  generators?: SharedContentItemBase[];
  templates?: SharedContentItemBase[];
}

/** Configuration for grid layout */
interface GridConfig {
  minCardWidth?: string;
  aspectRatio?: 'auto' | '1:1';
}

/** Configuration options for the SharedContentSelector */
interface SharedContentSelectorConfig {
  title?: string;
  description?: string;
  contentFilter?: string | null;
  excludeTypes?: string[];
  hideFilters?: string[];
  hideHeader?: boolean;
  cardStyle?: 'default' | 'template-square';
  gridConfig?: GridConfig;
}

/** Props for the SharedContentSelector component */
interface SharedContentSelectorProps {
  groupContent: GroupContent | null;
  isLoading: boolean;
  isAdmin: boolean;
  onUnshare: (contentType: string, contentId: string) => void;
  isUnsharing: boolean;
  config?: SharedContentSelectorConfig;
}

const defaultConfig: Required<SharedContentSelectorConfig> = {
  title: "Geteilte Inhalte",
  description: "Hier findest du alle Inhalte, die mit dieser Gruppe geteilt wurden",
  contentFilter: null,
  excludeTypes: [],
  hideFilters: [],
  hideHeader: false,
  cardStyle: 'default',
  gridConfig: {
    minCardWidth: '320px',
    aspectRatio: 'auto'
  }
};

/**
 * SharedContentSelector - Enhanced component for displaying and interacting with shared group content
 * Includes search, filtering, and clickable content with proper navigation
 * Now supports configurable layouts and filtering for different content types
 */
const SharedContentSelector = ({
  groupContent,
  isLoading,
  isAdmin,
  onUnshare,
  isUnsharing,
  config: configProp = {}
}: SharedContentSelectorProps) => {
  const config = { ...defaultConfig, ...configProp };
  const navigate = useNavigate();

  // UI State
  const [searchQuery, setSearchQuery] = useState('');
  const [contentTypeFilter, setContentTypeFilter] = useState('all');
  const [permissionFilter, setPermissionFilter] = useState('all');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'
  const [sortBy, setSortBy] = useState('shared_at'); // 'shared_at', 'title', 'type', 'shared_by'
  const [sortOrder, setSortOrder] = useState('desc');

  // Modal state for document preview
  const [selectedItem, setSelectedItem] = useState<ContentItem | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Refs for preloading
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intersectionObserverRef = useRef<IntersectionObserver | null>(null);

  // Document content caching utilities
  const getCachedContent = useCallback((documentId: string): DocumentContent | null => {
    try {
      const cached = sessionStorage.getItem(`doc_content_${documentId}`);
      if (cached) {
        const { content, timestamp } = JSON.parse(cached);
        // Cache expires after 1 hour
        if (Date.now() - timestamp < 60 * 60 * 1000) {
          return content;
        } else {
          sessionStorage.removeItem(`doc_content_${documentId}`);
        }
      }
    } catch (error) {
      console.warn('[SharedContentSelector] Error reading cache:', error);
    }
    return null;
  }, []);

  const setCachedContent = useCallback((documentId: string, content: DocumentContent) => {
    try {
      const cacheData = {
        content,
        timestamp: Date.now()
      };
      sessionStorage.setItem(`doc_content_${documentId}`, JSON.stringify(cacheData));
    } catch (error) {
      console.warn('[SharedContentSelector] Error writing cache:', error);
    }
  }, []);

  const isCached = useCallback((documentId: string): boolean => {
    return getCachedContent(documentId) !== null;
  }, [getCachedContent]);

  // Flatten all content into single array for unified handling
  const allContent = useMemo((): ContentItem[] => {
    if (!groupContent) return [];

    const content: ContentItem[] = [];

    // Add documents
    if (groupContent.documents &&
        (!config.contentFilter || config.contentFilter === 'documents') &&
        !(config.excludeTypes && config.excludeTypes.includes('documents'))) {
      content.push(...groupContent.documents.map((item): ContentItem => ({
        ...item,
        contentType: 'documents',
        icon: HiDocumentText,
        typeLabel: 'Dokument'
      })));
    }

    // Add texts
    if (groupContent.texts &&
        (!config.contentFilter || config.contentFilter === 'user_documents') &&
        !(config.excludeTypes && config.excludeTypes.includes('user_documents'))) {
      content.push(...groupContent.texts.map((item): ContentItem => ({
        ...item,
        contentType: 'user_documents',
        icon: HiDocumentText,
        typeLabel: 'Text'
      })));
    }

    // Add Notebooks
    if (groupContent.notebooks &&
        (!config.contentFilter || config.contentFilter === 'notebook_collections') &&
        !(config.excludeTypes && config.excludeTypes.includes('notebook_collections'))) {
      content.push(...groupContent.notebooks.map((item): ContentItem => ({
        ...item,
        contentType: 'notebook_collections',
        icon: NotebookIcon as IconType,
        typeLabel: 'Notebook'
      })));
    }

    // Add custom generators
    if (groupContent.generators &&
        (!config.contentFilter || config.contentFilter === 'custom_generators') &&
        !(config.excludeTypes && config.excludeTypes.includes('custom_generators'))) {
      content.push(...groupContent.generators.map((item): ContentItem => ({
        ...item,
        contentType: 'custom_generators',
        icon: HiCollection,
        typeLabel: 'Generator'
      })));
    }

    // Add templates
    if (groupContent.templates &&
        (!config.contentFilter || config.contentFilter === 'database') &&
        !(config.excludeTypes && config.excludeTypes.includes('database'))) {
      content.push(...groupContent.templates.map((item): ContentItem => ({
        ...item,
        contentType: 'database',
        icon: HiCollection,
        typeLabel: 'Template'
      })));
    }

    return content;
  }, [groupContent, config.contentFilter, config.excludeTypes]);

  // Filter and search content
  const filteredContent = useMemo(() => {
    let filtered = [...allContent];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(item => {
        const title = (item.title || item.name || '').toLowerCase();
        const description = (item.description || '').toLowerCase();
        const sharedBy = (item.shared_by_name || '').toLowerCase();
        return title.includes(query) || description.includes(query) || sharedBy.includes(query);
      });
    }

    // Apply content type filter
    if (contentTypeFilter !== 'all') {
      filtered = filtered.filter(item => item.contentType === contentTypeFilter);
    }

    // Apply permission filter
    if (permissionFilter !== 'all') {
      filtered = filtered.filter(item => {
        const permissions = item.group_permissions || {};
        switch (permissionFilter) {
          case 'read': return permissions.read;
          case 'write': return permissions.write;
          case 'collaborative': return permissions.collaborative;
          default: return true;
        }
      });
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let valueA, valueB;

      switch (sortBy) {
        case 'title':
          valueA = (a.title || a.name || '').toLowerCase();
          valueB = (b.title || b.name || '').toLowerCase();
          break;
        case 'type':
          valueA = a.typeLabel;
          valueB = b.typeLabel;
          break;
        case 'shared_by':
          valueA = (a.shared_by_name || '').toLowerCase();
          valueB = (b.shared_by_name || '').toLowerCase();
          break;
        case 'shared_at':
        default:
          valueA = new Date(a.shared_at || 0);
          valueB = new Date(b.shared_at || 0);
          break;
      }

      if (sortOrder === 'asc') {
        return valueA > valueB ? 1 : -1;
      } else {
        return valueA < valueB ? 1 : -1;
      }
    });

    return filtered;
  }, [allContent, searchQuery, contentTypeFilter, permissionFilter, sortBy, sortOrder]);

  // Fetch document content from API
  const fetchDocumentContent = useCallback(async (documentId: string): Promise<DocumentContent> => {
    const response = await apiClient.get(`/documents/${documentId}/content`);
    const data = response.data;

    return {
      full_content: data.data.ocr_text || 'Kein Text extrahiert',
      markdown_content: data.data.markdown_content
    };
  }, []);

  // Enhanced preview with cache-first approach
  const handleEnhancedPreview = async (item: ContentItem) => {
    // Show modal immediately with basic info for instant feedback
    setSelectedItem(item);
    setShowPreview(true);
    setPreviewError(null);

    // Check cache first
    const cachedContent = getCachedContent(item.id);
    if (cachedContent) {
      // Use cached content immediately - no loading state needed
      const enhancedItem: ContentItem = {
        ...item,
        ...cachedContent
      };
      setSelectedItem(enhancedItem);
      return;
    }

    // Not cached - show loading and fetch
    setPreviewLoading(true);

    try {
      const content = await fetchDocumentContent(item.id);

      // Cache the content for future use
      setCachedContent(item.id, content);

      // Update the selected item with the fetched content
      const enhancedItem: ContentItem = {
        ...item,
        ...content
      };
      setSelectedItem(enhancedItem);
    } catch (error) {
      console.error('[SharedContentSelector] Error fetching document content:', error);
      setPreviewError('Fehler beim Laden des Dokument-Inhalts');
      // Modal stays open with basic info even if content fetch fails
    } finally {
      setPreviewLoading(false);
    }
  };

  // Silent preloading for hover/viewport optimization
  const preloadDocumentContent = useCallback(async (documentId: string) => {
    // Don't preload if already cached
    if (isCached(documentId)) return;

    try {
      const content = await fetchDocumentContent(documentId);
      setCachedContent(documentId, content);
    } catch (error) {
      // Silent failure for preloading
      console.debug('[SharedContentSelector] Preload failed for document:', documentId);
    }
  }, [fetchDocumentContent, isCached, setCachedContent]);

  // Handle content click - navigate based on content type
  const handleContentClick = (item: ContentItem) => {
    switch (item.contentType) {
      case 'user_documents':
        // Navigate to collaborative editor
        navigate(`/editor/collab/${item.id}`);
        break;
      case 'notebook_collections':
        // Navigate to Q&A interface
        navigate(`/notebook/${item.id}`);
        break;
      case 'custom_generators':
        // Navigate to custom generator
        navigate(`/generators/custom/${item.slug || item.id}`);
        break;
      case 'documents':
        // Show document in modal popup
        handleEnhancedPreview(item);
        break;
      case 'database': {
        // Open template (Canva URL) in new tab - prefer original URL
        const templateUrl = item.content_data?.originalUrl || item.canva_url || item.external_url;
        if (templateUrl) {
          window.open(templateUrl, '_blank', 'noopener,noreferrer');
        } else {
          console.warn('Template has no URL to open:', item);
        }
        break;
      }
      default:
        console.warn('Unknown content type:', item.contentType);
    }
  };

  // Handle edit action
  const handleEdit = (item: ContentItem, event: React.MouseEvent) => {
    event.stopPropagation();

    const permissions = item.group_permissions || {};
    if (!permissions.write && !permissions.collaborative) {
      alert('Du hast keine Berechtigung, diesen Inhalt zu bearbeiten.');
      return;
    }

    handleContentClick(item);
  };

  // Handle unshare action
  const handleUnshare = (item: ContentItem, event: React.MouseEvent) => {
    event.stopPropagation();

    if (!isAdmin) {
      alert('Nur Gruppenadministratoren können Inhalte aus der Gruppe entfernen.');
      return;
    }

    const confirmMessage = `Möchtest du "${item.title || item.name}" aus der Gruppe entfernen?`;
    if (window.confirm(confirmMessage)) {
      onUnshare(item.contentType, item.id);
    }
  };

  // Hover handlers for preloading
  const handleItemHover = useCallback((item: ContentItem) => {
    // Only preload documents
    if (item.contentType !== 'documents') return;

    // Clear any existing timeout
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }

    // Start preloading after 500ms hover
    hoverTimeoutRef.current = setTimeout(() => {
      preloadDocumentContent(item.id);
    }, 500);
  }, [preloadDocumentContent]);

  const handleItemHoverLeave = useCallback(() => {
    // Cancel preloading if user moves away quickly
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  }, []);

  // Cleanup hover timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  // Viewport-based preloading with Intersection Observer
  useEffect(() => {
    // Only set up intersection observer if we have documents to observe
    const documentItems = filteredContent.filter(item => item.contentType === 'documents');
    if (documentItems.length === 0) return;

    // Create intersection observer
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const documentId = (entry.target as HTMLElement).dataset.documentId;
            if (documentId) {
              // Preload after a short delay to avoid excessive requests
              setTimeout(() => {
                preloadDocumentContent(documentId);
              }, 100);
            }
          }
        });
      },
      {
        rootMargin: '50px', // Start preloading 50px before item comes into view
        threshold: 0.1 // Trigger when 10% of item is visible
      }
    );

    intersectionObserverRef.current = observer;

    // Observe document cards after they're rendered
    const observeDocumentCards = () => {
      const documentCards = document.querySelectorAll('[data-document-id]');
      documentCards.forEach(card => observer.observe(card));
    };

    // Small delay to ensure DOM is updated
    const timeoutId = setTimeout(observeDocumentCards, 100);

    return () => {
      clearTimeout(timeoutId);
      if (intersectionObserverRef.current) {
        intersectionObserverRef.current.disconnect();
      }
    };
  }, [filteredContent, preloadDocumentContent]);

  // Also preload first 3 visible documents immediately
  useEffect(() => {
    const documentItems = filteredContent
      .filter(item => item.contentType === 'documents')
      .slice(0, 3);

    documentItems.forEach((item, index) => {
      // Stagger the preloading to avoid overwhelming the server
      setTimeout(() => {
        preloadDocumentContent(item.id);
      }, index * 200);
    });
  }, [filteredContent, preloadDocumentContent]);

  const formatDate = (dateString: string | undefined): string => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  // Get permission badges
  const getPermissionBadges = (permissions: ContentPermissions = {}) => (
    <div className="shared-content-permissions">
      <span className={`permission-badge ${permissions.read ? 'active' : ''}`}>
        Lesen
      </span>
      <span className={`permission-badge ${permissions.write ? 'active' : ''}`}>
        Bearbeiten
      </span>
      <span className={`permission-badge ${permissions.collaborative ? 'active' : ''}`}>
        Kollaborativ
      </span>
    </div>
  );

  const formatDateDetailed = (dateString: string | undefined): string => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('de-DE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Render preview modal
  const renderPreview = () => {
    if (!selectedItem) return null;

    const itemTitle = selectedItem.title || selectedItem.name;
    const previewContent = selectedItem.full_content || selectedItem.content_preview || 'Kein Inhalt verfügbar';

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
              <span>Typ: {selectedItem.typeLabel}</span>
              {selectedItem.word_count && (
                <span>Wörter: {selectedItem.word_count}</span>
              )}
              {selectedItem.page_count && (
                <span>Seiten: {selectedItem.page_count}</span>
              )}
              <span>Geteilt von: {selectedItem.shared_by_name}</span>
              <span>Geteilt am: {formatDateDetailed(selectedItem.shared_at)}</span>
            </div>
            <div className="document-preview-text">
              {previewLoading ? (
                <div className="document-preview-loading">
                  <Spinner size="medium" />
                  <p>Dokument wird geladen...</p>
                </div>
              ) : previewError ? (
                <div className="document-preview-error">
                  <p>{previewError}</p>
                  <p>Grundlegende Informationen werden trotzdem angezeigt.</p>
                </div>
              ) : selectedItem.markdown_content ? (
                <div className="markdown-content">
                  <ReactMarkdown>
                    {selectedItem.markdown_content}
                  </ReactMarkdown>
                </div>
              ) : (
                <div className="document-preview-plain-text">
                  {previewContent}
                </div>
              )}
            </div>
          </div>
          <div className="document-preview-actions">
            <div className="shared-content-permissions">
              {getPermissionBadges(selectedItem.group_permissions)}
            </div>
          </div>
        </motion.div>
      </motion.div>
    );
  };

  if (isLoading) {
    return (
      <div className="shared-content-loading">
        <Spinner size="medium" />
        <p>Geteilte Inhalte werden geladen...</p>
      </div>
    );
  }

  return (
    <div className="shared-content-selector">
      {/* Header with title and description */}
      <div className="shared-content-header">
        {!config.hideHeader && (
          <div className="shared-content-title-section">
            <h3>{config.title} ({filteredContent.length})</h3>
            <p className="shared-content-description">
              {config.description}
            </p>
          </div>
        )}

        {/* Search and filter controls */}

        {allContent.length > 0 && (
          <div className="shared-content-controls">
            {/* Search */}
            <div className="shared-content-search">
              <HiOutlineSearch className="search-icon" />
              <input
                type="text"
                className="search-input"
                placeholder="Inhalte durchsuchen..."
                value={searchQuery}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Filters */}
            <div className="shared-content-filters">
              {!config.hideFilters.includes('contentType') && (
                <select
                  className="filter-select"
                  value={contentTypeFilter}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setContentTypeFilter(e.target.value)}
                >
                  <option value="all">Alle Typen</option>
                  <option value="documents">Dokumente</option>
                  <option value="user_documents">Texte</option>
                </select>
              )}

              {!config.hideFilters.includes('permissions') && (
                <select
                  className="filter-select"
                  value={permissionFilter}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setPermissionFilter(e.target.value)}
                >
                  <option value="all">Alle Berechtigungen</option>
                  <option value="read">Nur Lesen</option>
                  <option value="write">Bearbeiten</option>
                  <option value="collaborative">Kollaborativ</option>
                </select>
              )}

              {!config.hideFilters.includes('sortBy') && (
                <select
                  className="filter-select"
                  value={sortBy}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSortBy(e.target.value)}
                >
                  <option value="shared_at">Geteilt am</option>
                  <option value="title">Titel</option>
                  <option value="type">Typ</option>
                  <option value="shared_by">Geteilt von</option>
                </select>
              )}

              <button
                className="sort-order-button"
                onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                title={sortOrder === 'asc' ? 'Aufsteigend sortiert' : 'Absteigend sortiert'}
              >
                {sortOrder === 'asc' ? '↑' : '↓'}
              </button>
            </div>

            {/* View mode toggle */}
            <div className="view-mode-toggle">
              <button
                className={`view-mode-button ${viewMode === 'grid' ? 'active' : ''}`}
                onClick={() => setViewMode('grid')}
                title="Grid-Ansicht"
              >
                <HiOutlineViewGrid />
              </button>
              <button
                className={`view-mode-button ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => setViewMode('list')}
                title="Listen-Ansicht"
              >
                <HiOutlineViewList />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Content Display */}
      {filteredContent.length === 0 ? (
        <div className="shared-content-empty">
          {allContent.length === 0 ? (
            <div className="shared-content-empty-state">
              <HiCollection className="shared-content-empty-icon" />
              <p className="shared-content-empty-text">Noch keine Inhalte</p>
              <Link to="/profile/inhalte" className="pabtn pabtn--m pabtn--secondary">
                <HiOutlinePlus className="pabtn__icon" />
                <span className="pabtn__label">Inhalte hinzufügen</span>
              </Link>
            </div>
          ) : (
            <div className="shared-content-no-results">
              <p>Keine Ergebnisse für "{searchQuery}" gefunden.</p>
              <button
                className="clear-search-button"
                onClick={() => {
                  setSearchQuery('');
                  setContentTypeFilter('all');
                  setPermissionFilter('all');
                }}
              >
                Filter zurücksetzen
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className={`shared-content-grid ${viewMode} ${config.cardStyle === 'template-square' ? 'template-square' : ''}`}>
          {filteredContent.map((item) => {
            const IconComponent = item.icon;
            const permissions = item.group_permissions || {};
            const canEdit = permissions.write || permissions.collaborative;

            // Determine if this should use the special template card layout
            const useTemplateCardLayout = config.cardStyle === 'template-square' && (item.preview_image_url || item.thumbnail_url);

            return (
              <div
                key={`${item.contentType}-${item.id}`}
                className={`shared-content-item ${useTemplateCardLayout ? 'template-card' : ''}`}
                onClick={() => handleContentClick(item)}
                onMouseEnter={() => handleItemHover(item)}
                onMouseLeave={handleItemHoverLeave}
                data-document-id={item.contentType === 'documents' ? item.id : undefined}
              >
                {config.cardStyle === 'template-square' && (item.preview_image_url || item.thumbnail_url) ? (
                  // Template card WITH preview image: Beautiful 1:1 square layout
                  <>
                    {/* Preview Image Section (75% height) */}
                    <div className="shared-content-preview">
                      <img
                        src={item.preview_image_url || item.thumbnail_url}
                        alt={`Vorschau von ${item.title || item.name}`}
                        className="shared-content-preview-image"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                        loading="lazy"
                      />

                      {/* Overlay Actions */}
                      <div className="shared-content-actions">
                        <button
                          className="shared-content-action view"
                          onClick={(e: React.MouseEvent) => {
                            e.stopPropagation();
                            handleContentClick(item);
                          }}
                          title="Öffnen"
                        >
                          <HiOutlineEye />
                        </button>
                        {canEdit && (
                          <button
                            className="shared-content-action edit"
                            onClick={(e: React.MouseEvent) => handleEdit(item, e)}
                            title="Bearbeiten"
                          >
                            <HiOutlinePencil />
                          </button>
                        )}
                        {isAdmin && (
                          <button
                            className="shared-content-action delete"
                            onClick={(e: React.MouseEvent) => handleUnshare(item, e)}
                            disabled={isUnsharing}
                            title="Aus Gruppe entfernen"
                          >
                            <HiOutlineTrash />
                          </button>
                        )}
                      </div>

                      {/* Overlay Type Badge */}
                      <div className="shared-content-item-header">
                        <div className="shared-content-type-badge">
                          {item.typeLabel}
                        </div>
                      </div>
                    </div>

                    {/* Content Section (25% height) */}
                    <div className="shared-content-item-body">
                      <h4 className="shared-content-item-title">
                        {item.title || item.name}
                      </h4>

                      <div className="shared-content-meta">
                        <span>Geteilt von: {item.shared_by_name}</span>
                        <span>Geteilt am: {formatDate(item.shared_at)}</span>
                      </div>
                    </div>
                  </>
                ) : (
                  // Default card layout: Header, body with image inside, metadata
                  <>
                    <div className="shared-content-item-header">
                      <div className="shared-content-icon">
                        <IconComponent />
                      </div>
                      <div className="shared-content-type-badge">
                        {item.typeLabel}
                      </div>
                      <div className="shared-content-actions">
                        <button
                          className="shared-content-action view"
                          onClick={(e: React.MouseEvent) => {
                            e.stopPropagation();
                            handleContentClick(item);
                          }}
                          title="Öffnen"
                        >
                          <HiOutlineEye />
                        </button>
                        {canEdit && (
                          <button
                            className="shared-content-action edit"
                            onClick={(e: React.MouseEvent) => handleEdit(item, e)}
                            title="Bearbeiten"
                          >
                            <HiOutlinePencil />
                          </button>
                        )}
                        {isAdmin && (
                          <button
                            className="shared-content-action delete"
                            onClick={(e: React.MouseEvent) => handleUnshare(item, e)}
                            disabled={isUnsharing}
                            title="Aus Gruppe entfernen"
                          >
                            <HiOutlineTrash />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="shared-content-item-body">
                      <h4 className="shared-content-item-title">
                        {item.title || item.name}
                      </h4>

                      {/* Preview Image for Templates */}
                      {(item.preview_image_url || item.thumbnail_url) && (
                        <div className="shared-content-preview">
                          <img
                            src={item.preview_image_url || item.thumbnail_url}
                            alt={`Vorschau von ${item.title || item.name}`}
                            className="shared-content-preview-image"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                            loading="lazy"
                          />
                        </div>
                      )}

                      {item.description && (
                        <p className="shared-content-item-description">
                          {item.description}
                        </p>
                      )}

                      <div className="shared-content-meta">
                        <span>Geteilt von: {item.shared_by_name}</span>
                        <span>Geteilt am: {formatDate(item.shared_at)}</span>
                      </div>

                      {/* Additional metadata based on type */}
                      <div className="shared-content-stats">
                        {item.word_count && <span>{item.word_count} Wörter</span>}
                        {item.document_count && <span>{item.document_count} Dokumente</span>}
                        {item.page_count && <span>{item.page_count} Seiten</span>}
                        {item.view_count && <span>{item.view_count} Aufrufe</span>}
                      </div>

                      {getPermissionBadges(permissions)}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Preview Modal */}
      {showPreview && renderPreview()}
    </div>
  );
};

export default SharedContentSelector;
