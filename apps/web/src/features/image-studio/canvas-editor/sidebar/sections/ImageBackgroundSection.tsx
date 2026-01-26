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
import { SubsectionTabBar, type Subsection } from '../SubsectionTabBar';

import type { StockImage, StockImageAttribution } from '../../../services/imageSourceService';
import './ImageBackgroundSection.css';

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
    <div className="sidebar-section sidebar-section--image-background">
      <div className="image-background-row">
        {/* Current Image Preview */}
        <div className="image-background-current">
          {currentImageSrc ? (
            <div className="image-background-preview">
              <img src={currentImageSrc} alt="Aktueller Hintergrund" />
              <button
                type="button"
                className="image-background-remove"
                onClick={handleRemoveImage}
                aria-label="Bild entfernen"
              >
                <HiXMark size={14} />
              </button>
            </div>
          ) : (
            <div className="image-background-placeholder">
              <HiPhoto size={24} />
              <span>Kein Bild</span>
            </div>
          )}
        </div>

        {/* Upload Button */}
        <div className="image-background-actions">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />

          <button
            type="button"
            className="btn btn-secondary"
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
    <div className="unsplash-search-section">
      {/* Search Input */}
      <div className="unsplash-search-bar">
        <HiMagnifyingGlass size={18} />
        <input
          type="text"
          placeholder="Suchen... (z.B. Natur, Politik)"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button type="button" onClick={() => setSearchQuery('')} aria-label="Clear search">
            <HiXMark size={18} />
          </button>
        )}
      </div>

      {/* Loading State */}
      {isLoadingSearch && searchResults.length === 0 && (
        <div className="unsplash-loading">
          <p>Suche läuft...</p>
        </div>
      )}

      {/* Error State */}
      {searchError && (
        <div className="unsplash-error">
          <p>{searchError}</p>
          <button type="button" onClick={() => searchUnsplash(debouncedQuery)}>
            Erneut versuchen
          </button>
        </div>
      )}

      {/* Results Grid */}
      {searchResults.length > 0 && (
        <>
          <div className="unsplash-grid">
            {searchResults.map((image) => {
              const isSelected = currentImageSrc === image.url;
              return (
                <button
                  key={image.filename}
                  onClick={() => handleImageClick(image)}
                  type="button"
                  className={`unsplash-image-card ${isSelected ? 'selected' : ''}`}
                >
                  <img src={image.url} alt={image.alt_text || 'Unsplash Bild'} loading="lazy" />

                  {/* Attribution Overlay */}
                  {image.attribution && (
                    <div className="unsplash-attribution-overlay">
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
                    <div className="unsplash-selected-check">
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
              className="unsplash-load-more"
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
        <div className="unsplash-empty">
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
    <div className="sidebar-section sidebar-section--image-adjustments">
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
    <div className="sidebar-section sidebar-section--unsplash">
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
