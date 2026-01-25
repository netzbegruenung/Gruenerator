import { type JSX, useMemo, useState, useCallback } from 'react';

import IndexCard from '../IndexCard';
import TemplatePreviewModal from '../TemplatePreviewModal';

import { GallerySkeleton, cardAdapters, type GalleryItem } from './cards';
import { DEFAULT_GALLERY_TYPE, GALLERY_CONTENT_TYPES, ORDERED_CONTENT_TYPE_IDS } from './config';
import GalleryControls from './GalleryControls';
import { useGalleryController } from './useGalleryController';


import '../../../assets/styles/components/gallery-layout.css';
import '../../../assets/styles/components/gallery-content-type.css';
import '../../../assets/styles/components/SearchBar.css';

interface CategoryItem {
  id: string;
  label: string;
}

interface GalleryContainerProps {
  initialContentType?: string;
  availableContentTypes?: string[];
}

const GalleryContainer = ({
  initialContentType,
  availableContentTypes,
}: GalleryContainerProps): JSX.Element => {
  const typeOrder = useMemo(() => {
    if (Array.isArray(availableContentTypes) && availableContentTypes.length > 0) {
      return availableContentTypes;
    }
    return ORDERED_CONTENT_TYPE_IDS;
  }, [availableContentTypes]);

  const firstAvailableType = typeOrder.find((id) => GALLERY_CONTENT_TYPES[id]);
  const [contentType, setContentType] = useState(
    initialContentType && GALLERY_CONTENT_TYPES[initialContentType]
      ? initialContentType
      : firstAvailableType || DEFAULT_GALLERY_TYPE
  );
  const [previewTemplate, setPreviewTemplate] = useState<GalleryItem | null>(null);

  const handleOpenPreview = useCallback(
    (template: GalleryItem) => setPreviewTemplate(template),
    []
  );
  const handleClosePreview = useCallback(() => setPreviewTemplate(null), []);

  const controller = useGalleryController({ contentType, availableContentTypeIds: typeOrder });
  const {
    config,
    items,
    sections,
    loading,
    error,
    inputValue,
    setInputValue,
    searchMode,
    setSearchMode,
    selectedCategory,
    setSelectedCategory,
    categories,
    typeOptions,
    refetch,
    handleTagClick,
  } = controller;

  const activeConfig =
    config || GALLERY_CONTENT_TYPES[contentType] || GALLERY_CONTENT_TYPES[DEFAULT_GALLERY_TYPE];

  const placeholder = 'Durchsuchen...';
  const showCategoryFilter =
    activeConfig.allowCategoryFilter !== false &&
    Array.isArray(categories) &&
    categories.length > 0;

  const handleContentTypeChange = (nextType: string) => {
    if (!GALLERY_CONTENT_TYPES[nextType]) return;
    setContentType(nextType);
  };

  const renderList = (list: GalleryItem[], rendererId: string): React.ReactNode[] | null => {
    if (!Array.isArray(list) || list.length === 0) return null;
    const adapter = cardAdapters[rendererId as keyof typeof cardAdapters] || cardAdapters.default;
    const adapterOptions =
      rendererId === 'vorlagen'
        ? { onTagClick: handleTagClick, onOpenPreview: handleOpenPreview }
        : {};

    return list.map((item) => {
      const result = adapter(item, adapterOptions);
      if (!result || !result.key || !result.props.title) return null;
      const { key, props } = result;
      const { title, ...restProps } = props;
      return <IndexCard key={key} title={String(title)} {...restProps} />;
    });
  };

  const renderContent = () => {
    if (loading && (!items || items.length === 0)) {
      return (
        <div className="content-section-grid">
          {Array.from({ length: 6 }).map((_, index) => (
            <GallerySkeleton key={`skeleton-${index}`} />
          ))}
        </div>
      );
    }

    if (error) {
      return <p className="error-message">{error.message || String(error)}</p>;
    }

    const typedSections = sections as Record<string, GalleryItem[]> | undefined;
    if (typedSections && Object.keys(typedSections).length > 0) {
      return (
        <div className="all-content-container">
          {activeConfig.sectionOrder?.map((sectionId: unknown) => {
            const sectionIdStr = String(sectionId);
            const list = typedSections[sectionIdStr] || [];
            if (!list.length) return null;
            return (
              <div className="content-section" key={sectionIdStr}>
                <h2 className="content-section-title">
                  {activeConfig.sectionLabels?.[sectionIdStr] || sectionIdStr}
                </h2>
                <div className="content-section-grid">
                  {renderList(list, activeConfig.cardRenderer || sectionIdStr)}
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    if (!items || items.length === 0) {
      return <p>Keine Einträge gefunden.</p>;
    }

    return (
      <div className="content-section-grid">
        {renderList(items as GalleryItem[], activeConfig.cardRenderer || contentType)}
      </div>
    );
  };

  return (
    <div className="gallery-layout">
      <div className="gallery-header">
        {activeConfig.title && <h1>{activeConfig.title}</h1>}
        {activeConfig.intro && <p>{activeConfig.intro}</p>}

        <div className="gallery-main-searchbar-section">
          <GalleryControls
            searchTerm={inputValue}
            onSearchChange={(value: string) => setInputValue(value)}
            placeholder={placeholder}
            contentTypes={typeOptions}
            activeContentType={contentType}
            onContentTypeChange={(id: string) => handleContentTypeChange(id)}
            categories={(Array.isArray(categories) ? categories : []) as CategoryItem[]}
            selectedCategory={selectedCategory}
            onCategoryChange={(id: string) => setSelectedCategory(id)}
            showCategoryFilter={showCategoryFilter}
            onRefresh={refetch}
            searchModes={activeConfig.searchModes}
            selectedSearchMode={searchMode}
            onSearchModeChange={(mode: string) => setSearchMode(mode)}
          />
        </div>
      </div>

      <div className="gallery-grid">{renderContent()}</div>

      {previewTemplate && (
        <TemplatePreviewModal
          isOpen={!!previewTemplate}
          onClose={handleClosePreview}
          template={previewTemplate}
          onTagClick={handleTagClick}
        />
      )}
    </div>
  );
};

export default GalleryContainer;
