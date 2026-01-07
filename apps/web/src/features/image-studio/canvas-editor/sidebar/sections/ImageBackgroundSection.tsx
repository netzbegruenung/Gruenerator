import { useState, useEffect, useCallback, useRef } from 'react';
import { HiUpload, HiLibrary, HiZoomIn, HiAdjustments } from 'react-icons/hi';
import { HiPhoto } from 'react-icons/hi2';
import { useImageSourceStore } from '../../../hooks/useImageSourceStore';
import type { StockImage } from '../../../services/imageSourceService';
import { SubsectionTabBar, type Subsection } from '../SubsectionTabBar';
import MediathekModal from './MediathekModal';
import { SidebarSlider } from '../components/SidebarSlider';
import './ImageBackgroundSection.css';

export interface ImageBackgroundSectionProps {
    currentImageSrc?: string;
    onImageChange: (file: File | null, objectUrl?: string) => void;

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
 * Image Source Content - upload and mediathek controls
 */
function ImageSourceContent({
    currentImageSrc,
    onImageChange,
    isLocked,
    onToggleLock,
}: Pick<ImageBackgroundSectionProps, 'currentImageSrc' | 'onImageChange' | 'isLocked' | 'onToggleLock'>) {
    const [isMediathekOpen, setIsMediathekOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const {
        stockImages,
        isLoadingStockImages,
        fetchStockImages,
        selectStockImage,
    } = useImageSourceStore();

    useEffect(() => {
        if (stockImages.length === 0 && !isLoadingStockImages) {
            fetchStockImages();
        }
    }, [stockImages.length, isLoadingStockImages, fetchStockImages]);

    const handleStockImageClick = useCallback(async (image: StockImage) => {
        try {
            const file = await selectStockImage(image);
            if (file) {
                const objectUrl = URL.createObjectURL(file);
                onImageChange(file, objectUrl);
                setIsMediathekOpen(false);
            }
        } catch (error) {
            console.error('Failed to select stock image:', error);
        }
    }, [selectStockImage, onImageChange]);

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
                        className="btn-icon btn-primary"
                        onClick={() => setIsMediathekOpen(true)}
                        title="Aus Mediathek wählen"
                        aria-label="Aus Mediathek wählen"
                    >
                        <HiLibrary />
                    </button>

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


            <MediathekModal
                isOpen={isMediathekOpen}
                onClose={() => setIsMediathekOpen(false)}
                onImageSelect={handleStockImageClick}
            />

            <p className="sidebar-hint">
                {isLocked === false
                    ? 'Du kannst das Bild jetzt auf dem Canvas verschieben und skalieren.'
                    : 'Das Bild kann auf dem Canvas verschoben werden, wenn es nicht fixiert ist.'}
            </p>
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
            <div className="image-adjustments-stack" style={{ display: 'flex', flexDirection: 'row', gap: '16px' }}>
                {scale !== undefined && onScaleChange !== undefined && (
                    <SidebarSlider
                        label="Zoom"
                        value={scale}
                        onValueChange={onScaleChange}
                        min={1}
                        max={3}
                        step={0.01}
                        unit="%"
                    />
                )}
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


