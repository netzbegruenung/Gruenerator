import { useState, useEffect, useCallback } from 'react';
import { FaCheck } from 'react-icons/fa';
import { HiAdjustments } from 'react-icons/hi';
import { HiMagnifyingGlass, HiPhoto, HiXMark } from 'react-icons/hi2';

import UnsplashAttribution from '../../common/UnsplashAttribution';
import { useUnsplashSearch } from '../../hooks/useUnsplashSearch';
import { useCanvasEditorServices } from '../../CanvasEditorProvider';
import { persistImageSelection } from '../persistImageSelection';
import { SidebarSlider } from '../components/SidebarSlider';
import { SIDEBAR_SECTION } from '../primitives';
import { SubsectionTabBar, type Subsection } from '../SubsectionTabBar';
import { useUserUploads } from '../UserUploadsProvider';

import type { StockImage, StockImageAttribution } from '../../common/imageSourceTypes';
import type { MediaItem } from '@gruenerator/shared/media-library';

import { cn } from '../../utils/cn';

function buildUploadUrl(item: MediaItem): string | null {
  if (item.mediaUrl) return item.mediaUrl;
  if (item.shareToken) return `/api/share/${item.shareToken}/download`;
  return item.thumbnailUrl;
}

export interface ImageBackgroundSectionProps {
  currentImageSrc?: string;
  onImageChange: (
    file: File | null,
    objectUrl?: string,
    attribution?: StockImageAttribution | null
  ) => void;

  // Optional legacy scale controls (will be deprecated)
  scale?: number;
  onScaleChange?: (scale: number) => void;

  // Gradient controls
  gradientOpacity?: number;
  onGradientOpacityChange?: (opacity: number) => void;

  // New Modular Lock Controls
  isLocked?: boolean;
  onToggleLock?: () => void;
}

/**
 * Unified Search Content - searches the user's upload library AND Unsplash
 * with one input. The currently active background pins to the front of the
 * library grid with an "active" marker. Selecting from either source
 * converges on onImageChange.
 */
function SearchContent({
  currentImageSrc,
  onImageChange,
}: Pick<ImageBackgroundSectionProps, 'currentImageSrc' | 'onImageChange'>) {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [pickError, setPickError] = useState<string | null>(null);
  // Tracks which library item backs the current background, so we can dedupe it
  // from the grid. We cache the mapping locally (id → the src URL now applied)
  // while it's still active.
  const [activeLibraryRef, setActiveLibraryRef] = useState<{
    id: string;
    srcUrl: string;
  } | null>(null);

  const {
    items: uploadItems,
    isLoading: isUploadsLoading,
    error: uploadsError,
    setSearch: setUploadSearch,
    hasMore: uploadsHasMore,
    loadMore: loadMoreUploads,
  } = useUserUploads();

  const {
    searchResults: unsplashResults,
    totalResults: unsplashTotal,
    searchUnsplash,
    loadMoreResults: loadMoreUnsplash,
    isLoadingSearch: isUnsplashLoading,
    searchError: unsplashError,
    clearSearch: clearUnsplashSearch,
  } = useUnsplashSearch();

  const { fetchUnsplashImageAsFile, trackUnsplashDownloadLive, uploadImage } =
    useCanvasEditorServices();

  useEffect(() => {
    setUploadSearch(searchQuery);
  }, [searchQuery, setUploadSearch]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (debouncedQuery.trim()) {
      searchUnsplash(debouncedQuery);
    } else {
      clearUnsplashSearch();
    }
  }, [debouncedQuery, searchUnsplash, clearUnsplashSearch]);

  const handlePickUpload = useCallback(
    async (item: MediaItem) => {
      const url = buildUploadUrl(item);
      if (!url) return;
      setPickError(null);
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Bild konnte nicht geladen werden');
        const blob = await response.blob();
        const filename = item.originalFilename ?? item.title ?? `upload-${item.id}`;
        const file = new File([blob], filename, { type: blob.type || 'image/jpeg' });
        // The library URL is already durable — persist it directly instead of a
        // session-local blob: URL (which dies on reload in the collab editor).
        onImageChange(file, url, null);
        setActiveLibraryRef({ id: item.id, srcUrl: url });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Fehler beim Laden des Bildes';
        setPickError(message);
      }
    },
    [onImageChange]
  );

  const handlePickUnsplash = useCallback(
    async (image: StockImage) => {
      if (!fetchUnsplashImageAsFile) return;
      setPickError(null);
      try {
        const file = await fetchUnsplashImageAsFile(image);
        if (image.attribution?.downloadLocation && trackUnsplashDownloadLive) {
          await trackUnsplashDownloadLive(image.attribution.downloadLocation);
        }
        // Optimistic blob preview, then swap to a durable URL so the chosen
        // image survives reload (the value gets written to the collab doc).
        const { persisted } = await persistImageSelection(
          file,
          image.attribution ?? null,
          onImageChange,
          uploadImage
        );
        setActiveLibraryRef(null);
        if (!persisted && uploadImage) {
          setPickError(
            'Bild konnte nicht dauerhaft gespeichert werden und geht nach dem Neuladen verloren.'
          );
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Fehler beim Laden des Bildes';
        setPickError(message);
      }
    },
    [onImageChange, fetchUnsplashImageAsFile, trackUnsplashDownloadLive, uploadImage]
  );

  const handleClearActive = useCallback(() => {
    onImageChange(null);
    setActiveLibraryRef(null);
  }, [onImageChange]);

  const displayedError = pickError ?? uploadsError ?? unsplashError;
  const hasActive = !!currentImageSrc;
  const activeLibraryId =
    activeLibraryRef && activeLibraryRef.srcUrl === currentImageSrc ? activeLibraryRef.id : null;
  const dedupedUploads = activeLibraryId
    ? uploadItems.filter((item) => item.id !== activeLibraryId)
    : uploadItems;
  const hasLibrary = hasActive || dedupedUploads.length > 0;
  const hasUnsplash = unsplashResults.length > 0;
  const showEmpty =
    !isUploadsLoading && !isUnsplashLoading && !hasLibrary && !hasUnsplash && !displayedError;

  return (
    <div
      className={cn(SIDEBAR_SECTION, 'gap-3 p-4 px-3 max-canvas-mobile:p-3 max-canvas-mobile:px-2')}
    >
      {/* Search Input */}
      <div className="flex items-center gap-2 py-2 px-3 bg-background border border-[var(--font-color)] rounded-lg max-canvas-mobile:py-1.5 max-canvas-mobile:px-2.5">
        <HiMagnifyingGlass size={18} className="text-foreground-muted shrink-0" />
        <input
          type="text"
          placeholder="Bilder durchsuchen (eigene + Unsplash)"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 border-none outline-none bg-transparent text-foreground text-sm max-canvas-mobile:text-[14px]"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            aria-label="Suche leeren"
            className="bg-none border-none cursor-pointer p-0 flex items-center text-foreground-muted hover:text-foreground"
          >
            <HiXMark size={18} />
          </button>
        )}
      </div>

      {displayedError && (
        <div
          role="alert"
          className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-2 py-1"
        >
          {displayedError}
        </div>
      )}

      {/* Section: Active image + User Uploads */}
      {hasLibrary && (
        <section className="flex flex-col gap-2">
          <h3 className="m-0 text-xs font-semibold uppercase tracking-wide text-foreground-muted">
            Deine Bilder
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {hasActive && currentImageSrc && (
              <div
                className="group relative aspect-square overflow-hidden rounded-lg border-2 border-primary-600 ring-2 ring-primary-200 bg-[var(--card-background)]"
                title="Aktuelles Hintergrundbild"
              >
                <img
                  src={currentImageSrc}
                  alt="Aktuelles Hintergrundbild"
                  className="size-full object-cover"
                  draggable={false}
                />
                <div className="absolute top-1 left-1 bg-primary-600 rounded-full size-5 flex items-center justify-center">
                  <FaCheck size={10} color="white" />
                </div>
                <button
                  type="button"
                  onClick={handleClearActive}
                  aria-label="Hintergrund entfernen"
                  className="absolute top-1 right-1 size-5 flex items-center justify-center bg-black/70 text-white border-none rounded-full cursor-pointer opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus:opacity-100 max-canvas-mobile:opacity-100"
                >
                  <HiXMark size={10} />
                </button>
              </div>
            )}
            {dedupedUploads.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => void handlePickUpload(item)}
                className={cn(
                  'group relative aspect-square overflow-hidden rounded-lg border bg-[var(--card-background)] transition-colors duration-150 cursor-pointer p-0',
                  'border-[var(--card-border)] hover:border-primary-500'
                )}
                title={item.title ?? item.originalFilename ?? ''}
              >
                {item.thumbnailUrl ? (
                  <img
                    src={item.thumbnailUrl}
                    alt={item.altText ?? item.title ?? ''}
                    className="size-full object-cover"
                    draggable={false}
                  />
                ) : (
                  <div className="size-full flex items-center justify-center text-foreground-muted">
                    <HiPhoto size={20} />
                  </div>
                )}
              </button>
            ))}
          </div>
          {uploadsHasMore && !isUploadsLoading && (
            <button
              type="button"
              onClick={() => void loadMoreUploads()}
              className="text-xs text-primary-600 hover:underline self-center cursor-pointer bg-transparent border-none"
            >
              Mehr eigene Bilder
            </button>
          )}
        </section>
      )}

      {/* Section: Unsplash */}
      {hasUnsplash && (
        <section className="flex flex-col gap-2">
          <h3 className="m-0 text-xs font-semibold uppercase tracking-wide text-foreground-muted">
            Unsplash
          </h3>
          <div className="grid grid-cols-1 gap-2">
            {unsplashResults.map((image) => {
              const isSelected = currentImageSrc === image.url;
              return (
                <button
                  key={image.filename}
                  type="button"
                  onClick={() => void handlePickUnsplash(image)}
                  className={cn(
                    'relative border border-grey-200 dark:border-grey-700 rounded-lg overflow-hidden cursor-pointer p-0 bg-none aspect-[4/3] max-canvas-mobile:aspect-[3/2] hover:border-primary-600',
                    isSelected && 'border-2 border-primary-600'
                  )}
                >
                  <img
                    src={image.url}
                    alt={image.alt_text || 'Unsplash Bild'}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                  {image.attribution && (
                    <div className="absolute bottom-0 left-0 right-0 bg-black/70 p-1">
                      <UnsplashAttribution
                        photographer={image.attribution.photographer}
                        profileUrl={image.attribution.profileUrl}
                        photoUrl={image.attribution.photoUrl}
                        compact={true}
                      />
                    </div>
                  )}
                  {isSelected && (
                    <div className="absolute top-2 right-2 bg-primary-600 rounded-full w-6 h-6 flex items-center justify-center">
                      <FaCheck size={12} color="white" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          {unsplashResults.length < unsplashTotal && (
            <button
              type="button"
              onClick={() => void loadMoreUnsplash()}
              disabled={isUnsplashLoading}
              className="w-full py-2 bg-primary-600 text-white border-none rounded-lg cursor-pointer text-xs hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isUnsplashLoading
                ? 'Lädt…'
                : `Mehr Unsplash-Bilder (${unsplashResults.length} von ${unsplashTotal})`}
            </button>
          )}
        </section>
      )}

      {/* Loading hints */}
      {(isUploadsLoading || isUnsplashLoading) && !hasLibrary && !hasUnsplash && (
        <div className="p-4 text-center text-foreground-muted text-sm">
          <p>Suche läuft…</p>
        </div>
      )}

      {showEmpty && (
        <div className="p-4 text-center text-foreground-muted text-sm">
          <HiPhoto size={28} className="mx-auto mb-2 opacity-50" />
          <p className="m-0">
            {searchQuery
              ? `Keine Treffer für „${searchQuery}".`
              : 'Tippe einen Suchbegriff ein, um Unsplash zu durchsuchen.'}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Adjustment Controls Content - scale, gradient, etc.
 */
function AdjustmentsContent({
  scale,
  onScaleChange,
  gradientOpacity,
  onGradientOpacityChange,
}: Pick<
  ImageBackgroundSectionProps,
  'scale' | 'onScaleChange' | 'gradientOpacity' | 'onGradientOpacityChange'
>) {
  return (
    <div className={cn(SIDEBAR_SECTION, 'gap-4 px-3 pb-4')}>
      {gradientOpacity !== undefined && onGradientOpacityChange !== undefined && (
        <SidebarSlider
          label="Overlay"
          value={gradientOpacity}
          onValueChange={onGradientOpacityChange}
          min={0}
          max={1}
          step={0.01}
          unit="%"
        />
      )}
    </div>
  );
}

export function ImageBackgroundSection({
  currentImageSrc,
  onImageChange,
  scale,
  onScaleChange,
  gradientOpacity,
  onGradientOpacityChange,
  isLocked,
  onToggleLock,
}: ImageBackgroundSectionProps) {
  const hasAdjustments =
    (scale !== undefined && onScaleChange !== undefined) ||
    (gradientOpacity !== undefined && onGradientOpacityChange !== undefined);

  const subsections: Subsection[] = [
    {
      id: 'image-search',
      icon: HiMagnifyingGlass,
      label: 'Bilder',
      content: <SearchContent currentImageSrc={currentImageSrc} onImageChange={onImageChange} />,
    },
  ];

  if (hasAdjustments) {
    subsections.push({
      id: 'image-adjustments',
      icon: HiAdjustments,
      label: 'Anpassung',
      content: (
        <AdjustmentsContent
          scale={scale}
          onScaleChange={onScaleChange}
          gradientOpacity={gradientOpacity}
          onGradientOpacityChange={onGradientOpacityChange}
        />
      ),
    });
  }

  return <SubsectionTabBar subsections={subsections} defaultSubsection="image-search" />;
}
