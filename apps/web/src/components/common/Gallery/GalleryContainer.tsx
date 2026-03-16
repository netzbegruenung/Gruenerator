import { type JSX, useMemo, useState, useCallback } from 'react';

import IndexCard from '../IndexCard';
import TemplatePreviewModal from '../TemplatePreviewModal';

import AgentPreviewModal from './AgentPreviewModal';
import { GallerySkeleton, cardAdapters, type GalleryItem } from './cards';
import { DEFAULT_GALLERY_TYPE, GALLERY_CONTENT_TYPES, ORDERED_CONTENT_TYPE_IDS } from './config';
import GalleryControls from './GalleryControls';
import { useGalleryController } from './useGalleryController';

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

  const handleContentTypeChange = useCallback((nextType: string) => {
    if (!GALLERY_CONTENT_TYPES[nextType]) return;
    setContentType(nextType);
  }, []);

  const renderList = useCallback(
    (list: GalleryItem[], rendererId: string): React.ReactNode[] | null => {
      if (!Array.isArray(list) || list.length === 0) return null;
      const adapter = cardAdapters[rendererId as keyof typeof cardAdapters] || cardAdapters.default;
      const adapterOptions =
        rendererId === 'vorlagen'
          ? { onTagClick: handleTagClick, onOpenPreview: handleOpenPreview }
          : rendererId === 'agents'
            ? { onOpenPreview: handleOpenPreview }
            : {};

      return list.map((item) => {
        const result = adapter(item, adapterOptions);
        if (!result || !result.key || !result.props.title) return null;
        const { key, props } = result;
        const { title, ...restProps } = props;
        return <IndexCard key={key} title={String(title)} {...restProps} />;
      });
    },
    [handleTagClick, handleOpenPreview]
  );

  const renderedContent = useMemo(() => {
    if (loading && (!items || items.length === 0)) {
      return (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-md col-span-full">
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
        <div className="col-span-full flex flex-col gap-lg">
          {activeConfig.sectionOrder?.map((sectionId: unknown) => {
            const sectionIdStr = String(sectionId);
            const list = typedSections[sectionIdStr] || [];
            if (!list.length) return null;
            return (
              <div className="mb-lg" key={sectionIdStr}>
                <h2 className="mb-md border-b border-grey-200 pb-xs dark:border-grey-700">
                  {activeConfig.sectionLabels?.[sectionIdStr] || sectionIdStr}
                </h2>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-md col-span-full">
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
      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-md col-span-full">
        {renderList(items as GalleryItem[], activeConfig.cardRenderer || contentType)}
      </div>
    );
  }, [items, sections, loading, error, activeConfig, renderList, contentType]);

  return (
    <div className="mx-auto mt-[60px] max-w-[1200px] flex-col px-lg box-border max-md:mt-0 max-md:px-md max-md:py-lg">
      <div className="text-center">
        {activeConfig.title && (
          <h1 className="mb-4 text-[2.5rem] font-semibold text-foreground-heading max-md:text-[1.75rem]">
            {activeConfig.title}
          </h1>
        )}
        {activeConfig.intro && (
          <p className="mx-auto mb-xl max-w-[800px] text-center text-[1.1rem] leading-relaxed text-foreground">
            {activeConfig.intro}
          </p>
        )}

        <div className="mx-auto mb-xl flex w-full justify-center px-md box-border">
          <GalleryControls
            searchTerm={inputValue}
            onSearchChange={setInputValue}
            placeholder={placeholder}
            contentTypes={typeOptions}
            activeContentType={contentType}
            onContentTypeChange={handleContentTypeChange}
            categories={(Array.isArray(categories) ? categories : []) as CategoryItem[]}
            selectedCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
            showCategoryFilter={showCategoryFilter}
            onRefresh={refetch}
            searchModes={activeConfig.searchModes}
            selectedSearchMode={searchMode}
            onSearchModeChange={setSearchMode}
          />
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-2xl max-lg:grid-cols-[repeat(auto-fill,minmax(280px,1fr))] max-md:grid-cols-[repeat(auto-fill,minmax(250px,1fr))] max-md:gap-4">
        {renderedContent}
      </div>

      {previewTemplate && contentType === 'agents' && (
        <AgentPreviewModal agent={previewTemplate} onClose={handleClosePreview} />
      )}

      {previewTemplate && contentType !== 'agents' && (
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
