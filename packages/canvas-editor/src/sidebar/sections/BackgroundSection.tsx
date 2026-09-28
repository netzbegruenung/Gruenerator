import { useState, useEffect, useCallback } from 'react';
import { FaCheck } from 'react-icons/fa';
import { HiColorSwatch } from 'react-icons/hi';
import { HiPhoto, HiMagnifyingGlass, HiXMark } from 'react-icons/hi2';

import { useCanvasEditorServices } from '../../CanvasEditorProvider';
import UnsplashAttribution from '../../common/UnsplashAttribution';
import { useIsCanvasMobile } from '../../hooks/useIsCanvasMobile';
import { useUnsplashSearch } from '../../hooks/useUnsplashSearch';
import { cn } from '../../utils/cn';
import { ColorSwatchGrid } from '../components/ColorSwatchGrid';
import { SidebarSlider } from '../components/SidebarSlider';
import { persistImageSelection } from '../persistImageSelection';
import { SIDEBAR_SECTION } from '../sidebarStyles';
import { SubsectionTabBar, type Subsection } from '../SubsectionTabBar';

import type { StockImage } from '../../common/imageSourceTypes';
import type {
  BackgroundColorOption,
  BackgroundSectionProps,
  StockImageAttribution,
} from '../types';

// ============================================================================
// Shared mobile styling
// ============================================================================

/** Mobile slider rows: 13px muted label above the track, 18px between rows. */
export const MOBILE_SLIDER_ROWS =
  'max-canvas-mobile:gap-[18px] max-canvas-mobile:[&_.justify-between>span]:text-[13px] max-canvas-mobile:[&_.justify-between>span]:font-bold max-canvas-mobile:[&_.justify-between>span]:text-[var(--editor-text-muted)] max-canvas-mobile:[&_.justify-between]:mb-1.5';

export const MOBILE_BLOCK_LABEL = 'm-0 text-[13px] font-bold text-[var(--editor-text-muted)]';

export const MOBILE_SEARCH_FIELD =
  'flex items-center gap-2 h-11 px-3.5 rounded-xl bg-[var(--editor-tile)] text-[var(--editor-text)] [&_input]:!text-[15px]';

export const MOBILE_IMAGE_TILE =
  'relative block aspect-square w-full overflow-hidden rounded-xl border-none p-0 cursor-pointer bg-[var(--editor-tile)]';

/**
 * Colour swatches: the round `ColorSwatchGrid` on desktop, a 5-column grid of
 * square tiles in the mobile sheet.
 */
export function BackgroundSwatchGrid({
  colors,
  currentColor,
  onColorChange,
}: {
  colors: readonly BackgroundColorOption[];
  currentColor: string;
  onColorChange: (color: string) => void;
}) {
  const isMobile = useIsCanvasMobile();
  if (!isMobile) {
    return (
      <ColorSwatchGrid colors={colors} currentColor={currentColor} onColorChange={onColorChange} />
    );
  }
  return (
    <div className="grid grid-cols-5 gap-2.5">
      {colors.map((option) => {
        const isActive = currentColor === option.color;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onColorChange(option.color)}
            aria-label={option.label}
            aria-pressed={isActive}
            title={option.label}
            className={cn(
              'aspect-square w-full rounded-xl border-none p-0 cursor-pointer',
              isActive
                ? 'shadow-[0_0_0_2px_var(--editor-surface),0_0_0_4px_var(--editor-accent)]'
                : 'shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]'
            )}
            style={{ backgroundColor: option.color }}
          />
        );
      })}
    </div>
  );
}

// ============================================================================
// ColorSubsection - Solid colors and gradient overlay
// ============================================================================

interface ColorSubsectionProps {
  colors: BackgroundSectionProps['colors'];
  currentColor: BackgroundSectionProps['currentColor'];
  onColorChange: BackgroundSectionProps['onColorChange'];
  gradientOpacity?: BackgroundSectionProps['gradientOpacity'];
  onGradientOpacityChange?: BackgroundSectionProps['onGradientOpacityChange'];
}

function ColorSubsection({
  colors,
  currentColor,
  onColorChange,
  gradientOpacity,
  onGradientOpacityChange,
}: ColorSubsectionProps) {
  const showGradient = gradientOpacity !== undefined && onGradientOpacityChange !== undefined;

  return (
    <div className={cn(SIDEBAR_SECTION, 'w-full max-canvas-mobile:gap-4')}>
      <BackgroundSwatchGrid
        colors={colors}
        currentColor={currentColor}
        onColorChange={onColorChange}
      />

      {showGradient && (
        <div className={cn('mt-[var(--spacing-large)] max-canvas-mobile:mt-0', MOBILE_SLIDER_ROWS)}>
          <SidebarSlider
            label="Gradient-Overlay"
            value={gradientOpacity}
            onValueChange={onGradientOpacityChange}
            min={0}
            max={1}
            step={0.01}
            unit="%"
          />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// ImageSubsection - Unsplash image search
// ============================================================================

interface ImageSubsectionProps {
  currentImageSrc?: string;
  onImageChange?: (
    file: File | null,
    objectUrl?: string,
    attribution?: StockImageAttribution | null
  ) => void;
  textContext?: string;
}

function ImageSubsection({ currentImageSrc, onImageChange, textContext }: ImageSubsectionProps) {
  const { fetchUnsplashImageAsFile, trackUnsplashDownloadLive, uploadImage } =
    useCanvasEditorServices();
  const isMobile = useIsCanvasMobile();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [pickError, setPickError] = useState<string | null>(null);
  const {
    searchResults,
    totalResults,
    searchUnsplash,
    loadMoreResults,
    isLoadingSearch,
    searchError,
    clearSearch,
  } = useUnsplashSearch();

  // Debounce search input (500ms delay)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Execute search when debounced query changes
  useEffect(() => {
    if (debouncedQuery.trim()) {
      void searchUnsplash(debouncedQuery);
    } else {
      clearSearch();
    }
  }, [debouncedQuery, searchUnsplash, clearSearch]);

  // Handle image selection
  const handleImageSelect = useCallback(
    async (image: StockImage) => {
      if (!onImageChange || !fetchUnsplashImageAsFile) return;

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
        if (!persisted && uploadImage) {
          setPickError(
            'Bild konnte nicht dauerhaft gespeichert werden und geht nach dem Neuladen verloren.'
          );
        }
      } catch (error) {
        console.error('[ImageSubsection] Failed to select image:', error);
        setPickError(error instanceof Error ? error.message : 'Fehler beim Laden des Bildes');
      }
    },
    [onImageChange, fetchUnsplashImageAsFile, trackUnsplashDownloadLive, uploadImage]
  );

  // Handle image removal
  const handleRemoveImage = useCallback(() => {
    if (onImageChange) {
      onImageChange(null);
    }
  }, [onImageChange]);

  return (
    <div className={cn(SIDEBAR_SECTION, 'max-canvas-mobile:gap-4')}>
      {/* Search Input */}
      <div
        className={isMobile ? MOBILE_SEARCH_FIELD : 'image-search-bar'}
        style={
          isMobile
            ? undefined
            : {
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--spacing-small)',
                marginBottom: 'var(--spacing-medium)',
                padding: 'var(--spacing-small)',
                backgroundColor: 'var(--background-color)',
                border: '1px solid var(--grey-200)',
                borderRadius: 'var(--border-radius-medium)',
              }
        }
      >
        <HiMagnifyingGlass size={20} style={{ color: 'var(--color-foreground-muted)' }} />
        <input
          type="text"
          placeholder="Bilder durchsuchen... (z.B. Natur, Umwelt)"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            backgroundColor: 'transparent',
            color: 'var(--font-color)',
            fontSize: '0.875rem',
          }}
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
            }}
            aria-label="Clear search"
          >
            <HiXMark size={20} style={{ color: 'var(--color-foreground-muted)' }} />
          </button>
        )}
      </div>

      {/* Current Selection Preview */}
      {currentImageSrc && (
        <div
          style={{
            marginBottom: isMobile ? 0 : 'var(--spacing-medium)',
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'relative',
              borderRadius: isMobile ? 12 : 'var(--border-radius-medium)',
              overflow: 'hidden',
              aspectRatio: '16/9',
            }}
          >
            <img
              src={currentImageSrc}
              alt="Aktuelles Bild"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
            />
            <button
              type="button"
              onClick={handleRemoveImage}
              style={{
                position: 'absolute',
                top: 'var(--spacing-small)',
                right: 'var(--spacing-small)',
                background: 'rgba(0, 0, 0, 0.7)',
                border: 'none',
                borderRadius: 'var(--border-radius-small)',
                color: 'white',
                cursor: 'pointer',
                padding: 'var(--spacing-xxsmall)',
                display: 'flex',
                alignItems: 'center',
              }}
              aria-label="Bild entfernen"
            >
              <HiXMark size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoadingSearch && searchResults.length === 0 && (
        <div
          style={{
            padding: 'var(--spacing-large)',
            textAlign: 'center',
            color: 'var(--color-foreground-muted)',
          }}
        >
          <p>Suche läuft...</p>
        </div>
      )}

      {/* Persist Error */}
      {pickError && (
        <div className="p-3 bg-editor-danger-bg rounded-lg mb-3">
          <p className="text-editor-danger-fg text-sm m-0">{pickError}</p>
        </div>
      )}

      {/* Error State */}
      {searchError && (
        <div className="p-3 bg-editor-danger-bg rounded-lg mb-3">
          <p className="text-editor-danger-fg text-sm m-0">{searchError}</p>
          <button
            type="button"
            onClick={() => searchUnsplash(debouncedQuery)}
            style={{
              marginTop: 'var(--spacing-small)',
              padding: 'var(--spacing-small) var(--spacing-medium)',
              backgroundColor: 'var(--primary-600)',
              color: 'white',
              border: 'none',
              borderRadius: 'var(--border-radius-small)',
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            Erneut versuchen
          </button>
        </div>
      )}

      {/* Results Grid */}
      {searchResults.length > 0 && (
        <>
          <div
            className={isMobile ? 'grid grid-cols-3 gap-2.5' : undefined}
            style={
              isMobile
                ? undefined
                : {
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: 'var(--spacing-small)',
                    marginBottom: 'var(--spacing-medium)',
                  }
            }
          >
            {searchResults.map((image) => {
              const isSelected = currentImageSrc === image.url;
              return (
                <button
                  key={image.filename}
                  onClick={() => handleImageSelect(image)}
                  type="button"
                  aria-pressed={isSelected}
                  className={
                    isMobile
                      ? cn(
                          MOBILE_IMAGE_TILE,
                          isSelected &&
                            'shadow-[0_0_0_2px_var(--editor-surface),0_0_0_4px_var(--editor-accent)]'
                        )
                      : undefined
                  }
                  style={
                    isMobile
                      ? undefined
                      : {
                          position: 'relative',
                          border: isSelected
                            ? '2px solid var(--primary-600)'
                            : '1px solid var(--grey-200)',
                          borderRadius: 'var(--border-radius-medium)',
                          overflow: 'hidden',
                          cursor: 'pointer',
                          padding: 0,
                          background: 'none',
                          aspectRatio: '3/4',
                        }
                  }
                >
                  <img
                    src={image.url}
                    alt={image.alt_text || 'Unsplash Bild'}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                    }}
                    loading="lazy"
                  />

                  {/* Attribution Overlay */}
                  {image.attribution && (
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        background: 'rgba(0, 0, 0, 0.7)',
                        padding: 'var(--spacing-xxsmall)',
                      }}
                    >
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
                    <div
                      style={{
                        position: 'absolute',
                        top: 'var(--spacing-small)',
                        right: 'var(--spacing-small)',
                        backgroundColor: 'var(--primary-600)',
                        borderRadius: '50%',
                        width: '24px',
                        height: '24px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
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
              style={{
                width: '100%',
                padding: 'var(--spacing-medium)',
                backgroundColor: 'var(--primary-600)',
                color: 'white',
                border: 'none',
                borderRadius: 'var(--border-radius-medium)',
                cursor: isLoadingSearch ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
                opacity: isLoadingSearch ? 0.5 : 1,
              }}
            >
              {isLoadingSearch
                ? 'Lädt...'
                : `Mehr laden (${searchResults.length} von ${totalResults})`}
            </button>
          )}
        </>
      )}

      {/* Empty State */}
      {!searchQuery && searchResults.length === 0 && !isLoadingSearch && (
        <div
          style={{
            padding: 'var(--spacing-xlarge)',
            textAlign: 'center',
          }}
        >
          <HiPhoto
            size={48}
            style={{
              color: 'var(--color-foreground-muted)',
              marginBottom: 'var(--spacing-medium)',
            }}
          />
          <p
            style={{
              color: 'var(--font-color)',
              marginBottom: 'var(--spacing-small)',
            }}
          >
            Suche nach Bildern auf Unsplash
          </p>
        </div>
      )}

      {/* No Results */}
      {searchQuery && searchResults.length === 0 && !isLoadingSearch && !searchError && (
        <div
          style={{
            padding: 'var(--spacing-large)',
            textAlign: 'center',
          }}
        >
          <p style={{ color: 'var(--color-foreground-muted)' }}>
            Keine Ergebnisse für "{searchQuery}" gefunden.
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main BackgroundSection Component
// ============================================================================

export function BackgroundSection({
  colors,
  currentColor,
  onColorChange,
  gradientOpacity,
  onGradientOpacityChange,
  currentImageSrc,
  onImageChange,
  textContext,
}: BackgroundSectionProps) {
  // Only show image subsection if image handlers are provided
  const showImageSubsection = onImageChange !== undefined;

  // If image subsection is not enabled, just show color subsection directly
  if (!showImageSubsection) {
    return (
      <ColorSubsection
        colors={colors}
        currentColor={currentColor}
        onColorChange={onColorChange}
        gradientOpacity={gradientOpacity}
        onGradientOpacityChange={onGradientOpacityChange}
      />
    );
  }

  // Build subsections array
  const subsections: Subsection[] = [
    {
      id: 'color',
      icon: HiColorSwatch,
      label: 'Farbe',
      content: (
        <ColorSubsection
          colors={colors}
          currentColor={currentColor}
          onColorChange={onColorChange}
          gradientOpacity={gradientOpacity}
          onGradientOpacityChange={onGradientOpacityChange}
        />
      ),
    },
    {
      id: 'unsplash',
      icon: HiMagnifyingGlass,
      label: 'Unsplash',
      content: (
        <ImageSubsection
          currentImageSrc={currentImageSrc}
          onImageChange={onImageChange}
          textContext={textContext}
        />
      ),
    },
  ];

  return <SubsectionTabBar subsections={subsections} defaultSubsection="color" />;
}
