import { useState, useEffect, useCallback, useRef } from 'react';
import { FaCheck } from 'react-icons/fa';
import { HiUpload, HiAdjustments } from 'react-icons/hi';
import { HiMagnifyingGlass, HiXMark, HiPhoto } from 'react-icons/hi2';

import UnsplashAttribution from '../../../../../components/common/UnsplashAttribution';
import { useUnsplashSearch } from '../../../hooks/useUnsplashSearch';
import {
  fetchUnsplashImageAsFile,
  trackUnsplashDownloadLive,
} from '../../../services/imageSourceService';
import { SidebarHint } from '../components/SidebarHint';
import { SidebarSlider } from '../components/SidebarSlider';
import { SIDEBAR_SECTION } from '../primitives';
import { SubsectionTabBar, type Subsection } from '../SubsectionTabBar';

import type { StockImage, StockImageAttribution } from '../../../services/imageSourceService';

import { cn } from '@/utils/cn';

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
 * Image Preview Content - current image and upload button only
 */
function ImagePreviewContent({
  currentImageSrc,
  onImageChange,
}: Pick<ImageBackgroundSectionProps, 'currentImageSrc' | 'onImageChange'>) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        const objectUrl = URL.createObjectURL(file);
        onImageChange(file, objectUrl);
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [onImageChange]
  );

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleRemoveImage = useCallback(() => {
    onImageChange(null);
  }, [onImageChange]);

  return (
    <div
      className={cn(
        SIDEBAR_SECTION,
        'gap-4 p-4 px-3 max-canvas-mobile:p-3 max-canvas-mobile:px-2 max-canvas-mobile:gap-3'
      )}
    >
      <div className="flex flex-row gap-3 items-center w-full max-canvas-mobile:gap-2">
        {/* Current Image Preview */}
        <div className="flex-[2] flex justify-center">
          {currentImageSrc ? (
            <div className="group relative w-full max-w-[140px] max-h-[140px] aspect-square rounded-lg overflow-hidden bg-background-alt border border-border flex items-center justify-center max-canvas-mobile:max-w-[100px] max-canvas-mobile:max-h-[100px]">
              <img
                src={currentImageSrc}
                alt="Aktueller Hintergrund"
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                className="absolute top-1.5 right-1.5 bg-black/70 border-none rounded p-1 flex items-center justify-center text-white cursor-pointer opacity-0 transition-opacity duration-200 group-hover:opacity-100 max-canvas-mobile:opacity-100"
                onClick={handleRemoveImage}
                aria-label="Bild entfernen"
              >
                <HiXMark size={14} />
              </button>
            </div>
          ) : (
            <div className="w-full max-w-[140px] max-h-[140px] aspect-square rounded-lg overflow-hidden bg-background-alt border border-border flex flex-col items-center justify-center gap-2 text-foreground-muted max-canvas-mobile:max-w-[100px] max-canvas-mobile:max-h-[100px]">
              <HiPhoto size={24} />
              <span className="text-[length:var(--font-size-xxs)]">Kein Bild</span>
            </div>
          )}
        </div>

        {/* Upload Button */}
        <div className="flex-1 flex flex-col gap-3 items-center justify-center">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />

          <button
            type="button"
            className="btn btn-secondary flex items-center gap-1.5 whitespace-nowrap"
            onClick={handleUploadClick}
            title="Bild hochladen"
          >
            <HiUpload size={16} />
            <span>Hochladen</span>
          </button>
        </div>
      </div>

      <SidebarHint>Lade ein eigenes Bild hoch oder suche in der Unsplash-Bibliothek.</SidebarHint>
    </div>
  );
}

/**
 * Unsplash Search Section - Inline search
 */
function UnsplashSearchSection({
  currentImageSrc,
  onImageSelect,
}: {
  currentImageSrc?: string;
  onImageSelect: (image: StockImage) => void;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const {
    searchResults,
    totalResults,
    searchUnsplash,
    loadMoreResults,
    isLoadingSearch,
    searchError,
    clearSearch,
  } = useUnsplashSearch();

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (debouncedQuery.trim()) {
      searchUnsplash(debouncedQuery);
    } else {
      clearSearch();
    }
  }, [debouncedQuery, searchUnsplash, clearSearch]);

  const handleImageClick = useCallback(
    (image: StockImage) => {
      onImageSelect(image);
      setSearchQuery('');
    },
    [onImageSelect]
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Search Input */}
      <div className="flex items-center gap-2 py-2 px-3 bg-background border border-[var(--font-color)] rounded-lg max-canvas-mobile:py-1.5 max-canvas-mobile:px-2.5">
        <HiMagnifyingGlass size={18} className="text-foreground-muted shrink-0" />
        <input
          type="text"
          placeholder="Suchen... (z.B. Natur, Politik)"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 border-none outline-none bg-transparent text-foreground text-sm max-canvas-mobile:text-[14px]"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            aria-label="Clear search"
            className="bg-none border-none cursor-pointer p-0 flex items-center text-foreground-muted hover:text-foreground"
          >
            <HiXMark size={18} />
          </button>
        )}
      </div>

      {/* Loading State */}
      {isLoadingSearch && searchResults.length === 0 && (
        <div className="p-4 text-center text-foreground-muted text-sm">
          <p>Suche läuft...</p>
        </div>
      )}

      {/* Error State */}
      {searchError && (
        <div className="p-4 text-center text-foreground-muted text-sm">
          <p>{searchError}</p>
          <button
            type="button"
            onClick={() => searchUnsplash(debouncedQuery)}
            className="mt-2 py-2 px-4 bg-primary-600 text-white border-none rounded-md cursor-pointer text-sm"
          >
            Erneut versuchen
          </button>
        </div>
      )}

      {/* Results Grid */}
      {searchResults.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-2">
            {searchResults.map((image) => {
              const isSelected = currentImageSrc === image.url;
              return (
                <button
                  key={image.filename}
                  onClick={() => handleImageClick(image)}
                  type="button"
                  className={cn(
                    'relative border border-grey-200 dark:border-grey-700 rounded-lg overflow-hidden cursor-pointer p-0 bg-none aspect-[4/3] max-canvas-mobile:aspect-[3/2]',
                    'hover:border-primary-600',
                    isSelected && 'border-2 border-primary-600'
                  )}
                >
                  <img
                    src={image.url}
                    alt={image.alt_text || 'Unsplash Bild'}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />

                  {/* Attribution Overlay */}
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

                  {/* Selected Checkmark */}
                  {isSelected && (
                    <div className="absolute top-2 right-2 bg-primary-600 rounded-full w-6 h-6 flex items-center justify-center">
                      <FaCheck size={12} color="white" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Load More Button */}
          {searchResults.length < totalResults && (
            <button
              type="button"
              onClick={loadMoreResults}
              disabled={isLoadingSearch}
              className="w-full py-2.5 bg-primary-600 text-white border-none rounded-lg cursor-pointer text-sm hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoadingSearch
                ? 'Lädt...'
                : `Mehr laden (${searchResults.length} von ${totalResults})`}
            </button>
          )}
        </>
      )}

      {/* No Results */}
      {debouncedQuery && searchResults.length === 0 && !isLoadingSearch && !searchError && (
        <div className="p-4 text-center text-foreground-muted text-sm">
          <p>Keine Ergebnisse für "{debouncedQuery}"</p>
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

      <SidebarHint style={{ marginTop: 'var(--spacing-medium)' }}>
        Passe den Bildausschnitt und die Helligkeit an, um die Lesbarkeit des Textes zu optimieren.
      </SidebarHint>
    </div>
  );
}

/**
 * Unsplash Content wrapper - wraps search section with proper container
 */
function UnsplashContent({
  currentImageSrc,
  onImageChange,
}: Pick<ImageBackgroundSectionProps, 'currentImageSrc' | 'onImageChange'>) {
  const handleUnsplashSelect = useCallback(
    async (image: StockImage) => {
      try {
        const file = await fetchUnsplashImageAsFile(image);
        const objectUrl = URL.createObjectURL(file);
        if (image.attribution?.downloadLocation) {
          await trackUnsplashDownloadLive(image.attribution.downloadLocation);
        }
        onImageChange(file, objectUrl, image.attribution ?? null);
      } catch (error) {
        console.error('[UnsplashContent] Failed to select Unsplash image:', error);
      }
    },
    [onImageChange]
  );

  return (
    <div
      className={cn(SIDEBAR_SECTION, 'gap-3 p-4 px-3 max-canvas-mobile:p-3 max-canvas-mobile:px-2')}
    >
      <UnsplashSearchSection
        currentImageSrc={currentImageSrc}
        onImageSelect={handleUnsplashSelect}
      />
      <SidebarHint style={{ marginTop: 'var(--spacing-medium)' }}>
        Bilder von Unsplash. Wird automatisch mit Fotografennennung versehen.
      </SidebarHint>
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
      id: 'image-source',
      icon: HiUpload,
      label: 'Bild',
      content: (
        <ImagePreviewContent currentImageSrc={currentImageSrc} onImageChange={onImageChange} />
      ),
    },
    {
      id: 'unsplash-search',
      icon: HiMagnifyingGlass,
      label: 'Suche',
      content: <UnsplashContent currentImageSrc={currentImageSrc} onImageChange={onImageChange} />,
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

  return <SubsectionTabBar subsections={subsections} defaultSubsection="image-source" />;
}
