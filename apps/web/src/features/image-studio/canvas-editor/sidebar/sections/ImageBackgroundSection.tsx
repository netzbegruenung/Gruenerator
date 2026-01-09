import { useState, useEffect, useCallback, useRef } from 'react';
import { HiUpload, HiAdjustments } from 'react-icons/hi';
import { HiMagnifyingGlass, HiXMark, HiPhoto } from 'react-icons/hi2';
import { FaCheck } from 'react-icons/fa';
import type { StockImage, StockImageAttribution } from '../../../services/imageSourceService';
import { fetchUnsplashImageAsFile, trackUnsplashDownloadLive } from '../../../services/imageSourceService';
import { SubsectionTabBar, type Subsection } from '../SubsectionTabBar';
import { useUnsplashSearch } from '../../../hooks/useUnsplashSearch';
import UnsplashAttribution from '../../../../../components/common/UnsplashAttribution';
import { SidebarSlider } from '../components/SidebarSlider';
import './ImageBackgroundSection.css';

export interface ImageBackgroundSectionProps {
    currentImageSrc?: string;
    onImageChange: (file: File | null, objectUrl?: string, attribution?: StockImageAttribution | null) => void;

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
 * Image Source Content - upload, unsplash, and mediathek controls
 */
function ImageSourceContent({
    currentImageSrc,
    onImageChange,
    isLocked,
    onToggleLock,
}: Pick<ImageBackgroundSectionProps, 'currentImageSrc' | 'onImageChange' | 'isLocked' | 'onToggleLock'>) {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const objectUrl = URL.createObjectURL(file);
            onImageChange(file, objectUrl);
        }
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    }, [onImageChange]);

    const handleUploadClick = useCallback(() => {
        fileInputRef.current?.click();
    }, []);

    const handleUnsplashSelect = useCallback(async (image: StockImage) => {
        try {
            const file = await fetchUnsplashImageAsFile(image);
            const objectUrl = URL.createObjectURL(file);
            if (image.attribution?.downloadLocation) {
                await trackUnsplashDownloadLive(image.attribution.downloadLocation);
            }
            onImageChange(file, objectUrl, image.attribution ?? null);
        } catch (error) {
            console.error('[ImageSourceContent] Failed to select Unsplash image:', error);
        }
    }, [onImageChange]);

    return (
        <div className="sidebar-section sidebar-section--image-background">
            <div className="image-background-row">
                {/* Current Image Preview */}
                <div className="image-background-current">
                    {currentImageSrc ? (
                        <div className="image-background-preview">
                            <img src={currentImageSrc} alt="Aktueller Hintergrund" />
                        </div>
                    ) : (
                        <div className="image-background-placeholder">
                            <span>Kein Bild</span>
                        </div>
                    )}
                </div>

                {/* Quick Actions */}
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
                        className="btn-icon btn-secondary"
                        onClick={handleUploadClick}
                        title="Bild hochladen"
                        aria-label="Bild hochladen"
                    >
                        <HiUpload />
                    </button>
                </div>
            </div>

            {/* Unsplash Search */}
            <UnsplashSearchSection
                currentImageSrc={currentImageSrc}
                onImageSelect={handleUnsplashSelect}
            />
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

    const handleImageClick = useCallback(async (image: StockImage) => {
        await onImageSelect(image);
        setSearchQuery('');
    }, [onImageSelect]);

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
                    <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        aria-label="Clear search"
                    >
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
                    <button
                        type="button"
                        onClick={() => searchUnsplash(debouncedQuery)}
                    >
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
                                    <img
                                        src={image.url}
                                        alt={image.alt_text || 'Unsplash Bild'}
                                        loading="lazy"
                                    />

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
                            {isLoadingSearch ? 'Lädt...' : `Mehr laden (${searchResults.length} von ${totalResults})`}
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
}: Pick<ImageBackgroundSectionProps, 'scale' | 'onScaleChange' | 'gradientOpacity' | 'onGradientOpacityChange'>) {
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


            <p className="sidebar-hint" style={{ marginTop: 'var(--spacing-medium)' }}>
                Passe den Bildausschnitt und die Helligkeit an, um die Lesbarkeit des Textes zu optimieren.
            </p>
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
    // If zoom/gradient controls are provided, use subsection navigation
    const hasAdjustments = (scale !== undefined && onScaleChange !== undefined) ||
        (gradientOpacity !== undefined && onGradientOpacityChange !== undefined);

    if (!hasAdjustments) {
        return (
            <ImageSourceContent
                currentImageSrc={currentImageSrc}
                onImageChange={onImageChange}
                isLocked={isLocked}
                onToggleLock={onToggleLock}
            />
        );
    }

    const subsections: Subsection[] = [
        {
            id: 'image-source',
            icon: HiPhoto,
            label: 'Bild',
            content: (
                <ImageSourceContent
                    currentImageSrc={currentImageSrc}
                    onImageChange={onImageChange}
                    isLocked={isLocked}
                    onToggleLock={onToggleLock}
                />
            ),
        },
        {
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
        },
    ];

    return <SubsectionTabBar subsections={subsections} defaultSubsection="image-source" />;
}


