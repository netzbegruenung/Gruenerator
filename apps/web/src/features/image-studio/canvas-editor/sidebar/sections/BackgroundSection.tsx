import { useState, useEffect, useCallback } from 'react';
import { FaCheck } from 'react-icons/fa';
import { HiPhoto, HiMagnifyingGlass, HiXMark } from 'react-icons/hi2';
import { HiColorSwatch } from 'react-icons/hi';
import type { BackgroundSectionProps, StockImageAttribution } from '../types';
import { SidebarSlider } from '../components/SidebarSlider';
import { SidebarHint } from '../components/SidebarHint';
import { SubsectionTabBar, type Subsection } from '../SubsectionTabBar';
import { useUnsplashSearch } from '../../../hooks/useUnsplashSearch';
import { fetchUnsplashImageAsFile, trackUnsplashDownloadLive, type StockImage } from '../../../services/imageSourceService';
import UnsplashAttribution from '../../../../../components/common/UnsplashAttribution';
import './BackgroundSection.css';

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
    <div className="sidebar-section sidebar-section--background">
      <div className="sidebar-card-grid">
        {colors.map((option) => {
          const isActive = currentColor === option.color;
          return (
            <button
              key={option.id}
              className={`sidebar-selectable-card ${isActive ? 'sidebar-selectable-card--active' : ''}`}
              onClick={() => onColorChange(option.color)}
              type="button"
              title={option.label}
            >
              <div className="sidebar-selectable-card__preview">
                <span
                  className="background-color-swatch"
                  style={{ backgroundColor: option.color }}
                />
                {isActive && (
                  <span className="sidebar-selectable-card__check sidebar-selectable-card__check--small">
                    <FaCheck size={8} />
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {showGradient && (
        <div style={{ marginTop: 'var(--spacing-large)' }}>
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

      <SidebarHint>
        Wähle eine passende Hintergrundfarbe für dein Design. Die Farbe sollte gut mit dem Text harmonieren und für ausreichend Kontrast sorgen. Sand (hell) eignet sich für dunkle Texte, grüne Töne für helle Texte.
      </SidebarHint>
    </div>
  );
}

// ============================================================================
// ImageSubsection - Unsplash image search
// ============================================================================

interface ImageSubsectionProps {
  currentImageSrc?: string;
  onImageChange?: (file: File | null, objectUrl?: string, attribution?: StockImageAttribution | null) => void;
  textContext?: string;
}

function ImageSubsection({
  currentImageSrc,
  onImageChange,
  textContext,
}: ImageSubsectionProps) {
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
      searchUnsplash(debouncedQuery);
    } else {
      clearSearch();
    }
  }, [debouncedQuery, searchUnsplash, clearSearch]);

  // Handle image selection
  const handleImageSelect = useCallback(async (image: StockImage) => {
    if (!onImageChange) return;

    try {
      // Fetch image as File
      const file = await fetchUnsplashImageAsFile(image);

      // Create object URL for preview
      const objectUrl = URL.createObjectURL(file);

      // Track download (Unsplash API compliance)
      if (image.attribution?.downloadLocation) {
        await trackUnsplashDownloadLive(image.attribution.downloadLocation);
      }

      // Pass to parent with attribution
      onImageChange(file, objectUrl, image.attribution ?? null);
    } catch (error) {
      console.error('[ImageSubsection] Failed to select image:', error);
    }
  }, [onImageChange]);

  // Handle image removal
  const handleRemoveImage = useCallback(() => {
    if (onImageChange) {
      onImageChange(null);
    }
  }, [onImageChange]);

  return (
    <div className="sidebar-section sidebar-section--image-search">
      {/* Search Input */}
      <div className="image-search-bar" style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--spacing-small)',
        marginBottom: 'var(--spacing-medium)',
        padding: 'var(--spacing-small)',
        backgroundColor: 'var(--background-color)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--border-radius-medium)',
      }}>
        <HiMagnifyingGlass size={20} style={{ color: 'var(--font-color-muted)' }} />
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
            <HiXMark size={20} style={{ color: 'var(--font-color-muted)' }} />
          </button>
        )}
      </div>

      {/* Current Selection Preview */}
      {currentImageSrc && (
        <div style={{
          marginBottom: 'var(--spacing-medium)',
          position: 'relative',
        }}>
          <div style={{
            position: 'relative',
            borderRadius: 'var(--border-radius-medium)',
            overflow: 'hidden',
            aspectRatio: '16/9',
          }}>
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
        <div style={{
          padding: 'var(--spacing-large)',
          textAlign: 'center',
          color: 'var(--font-color-muted)',
        }}>
          <p>Suche läuft...</p>
        </div>
      )}

      {/* Error State */}
      {searchError && (
        <div style={{
          padding: 'var(--spacing-medium)',
          backgroundColor: 'var(--error-background)',
          borderRadius: 'var(--border-radius-medium)',
          marginBottom: 'var(--spacing-medium)',
        }}>
          <p style={{ color: 'var(--error-color)', fontSize: '0.875rem' }}>
            {searchError}
          </p>
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
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 'var(--spacing-small)',
            marginBottom: 'var(--spacing-medium)',
          }}>
            {searchResults.map((image) => {
              const isSelected = currentImageSrc === image.url;
              return (
                <button
                  key={image.filename}
                  onClick={() => handleImageSelect(image)}
                  type="button"
                  style={{
                    position: 'relative',
                    border: isSelected ? '2px solid var(--primary-600)' : '1px solid var(--border-color)',
                    borderRadius: 'var(--border-radius-medium)',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    padding: 0,
                    background: 'none',
                    aspectRatio: '3/4',
                  }}
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
                    <div style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      background: 'rgba(0, 0, 0, 0.7)',
                      padding: 'var(--spacing-xxsmall)',
                    }}>
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
                    <div style={{
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
                    }}>
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
              {isLoadingSearch ? 'Lädt...' : `Mehr laden (${searchResults.length} von ${totalResults})`}
            </button>
          )}
        </>
      )}

      {/* Empty State */}
      {!searchQuery && searchResults.length === 0 && !isLoadingSearch && (
        <div style={{
          padding: 'var(--spacing-xlarge)',
          textAlign: 'center',
        }}>
          <HiPhoto size={48} style={{
            color: 'var(--font-color-muted)',
            marginBottom: 'var(--spacing-medium)',
          }} />
          <p style={{
            color: 'var(--font-color)',
            marginBottom: 'var(--spacing-small)',
          }}>
            Suche nach Bildern auf Unsplash
          </p>
          <SidebarHint>
            Tipp: Verwende Begriffe wie "Natur", "Umwelt", "Politik", "Menschen"
          </SidebarHint>
        </div>
      )}

      {/* No Results */}
      {searchQuery && searchResults.length === 0 && !isLoadingSearch && !searchError && (
        <div style={{
          padding: 'var(--spacing-large)',
          textAlign: 'center',
        }}>
          <p style={{ color: 'var(--font-color-muted)' }}>
            Keine Ergebnisse für "{searchQuery}" gefunden.
          </p>
        </div>
      )}

      <SidebarHint style={{ marginTop: 'var(--spacing-medium)' }}>
        Bilder von Unsplash. Wird automatisch mit Fotografennennung versehen.
      </SidebarHint>
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
