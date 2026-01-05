import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { HiArrowLeft, HiArrowRight, HiX, HiPhotograph } from 'react-icons/hi';
import useImageStudioStore from '../../../stores/imageStudioStore';
import { useImageSourceStore } from '../hooks/useImageSourceStore';
import { useShareStore, type Share } from '@gruenerator/shared/share';
import apiClient from '../../../components/utils/apiClient';
import Button from '../../../components/common/SubmitButton';
import SegmentedControl from '../../../components/common/UI/SegmentedControl';
import UnsplashAttribution from '../../../components/common/UnsplashAttribution';
import StockImagesGrid from './StockImagesGrid';
import { slideVariants } from '../components/StepFlow';

interface BackgroundRemovalProgress {
    phase: 'downloading' | 'processing' | 'compressing';
    progress: number;
    message: string;
}

export interface ImageUploadStepProps {
    onNext: () => void;
    onBack: () => void;
    direction: number;
    loading: boolean;
    bgRemovalProgress: BackgroundRemovalProgress | null;
}

const IMAGE_SOURCE_TABS = [
    { value: 'upload', label: 'Hochladen' },
    { value: 'stock', label: 'Stock Bilder' },
    { value: 'mediathek', label: 'Meine Bilder' }
];

const ImageUploadStep: React.FC<ImageUploadStepProps> = ({ onNext, onBack, direction, loading, bgRemovalProgress }) => {
    const { uploadedImage, updateFormData } = useImageStudioStore();
    const {
        imageSourceTab,
        setImageSourceTab,
        selectedStockImage,
        stockImageAttribution,
        resetStockImageState
    } = useImageSourceStore();

    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isDragActive, setIsDragActive] = useState<boolean>(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(() => {
        if (!uploadedImage) return null;
        // Handle both string URLs and File/Blob objects
        if (typeof uploadedImage === 'string') return uploadedImage;
        return URL.createObjectURL(uploadedImage);
    });
    const isNewUploadRef = useRef<boolean>(false);

    useEffect(() => {
        if (uploadedImage) {
            // Handle both string URLs and File/Blob objects
            if (typeof uploadedImage === 'string') {
                setPreviewUrl(uploadedImage);
                return; // No cleanup needed for string URLs
            }
            const url = URL.createObjectURL(uploadedImage);
            setPreviewUrl(url);
            return () => URL.revokeObjectURL(url);
        }
        setPreviewUrl(null);
    }, [uploadedImage]);

    const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragActive(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setIsDragActive(false);
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);

    const handleFileSelect = useCallback((file: File | undefined) => {
        if (!file) return;

        const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!validTypes.includes(file.type)) return;

        isNewUploadRef.current = true;
        updateFormData({ uploadedImage: file });
        setTimeout(() => onNext(), 50);
    }, [updateFormData, onNext]);

    const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragActive(false);

        const file = e.dataTransfer?.files?.[0];
        handleFileSelect(file);
    }, [handleFileSelect]);

    const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        handleFileSelect(file);
        e.target.value = '';
    }, [handleFileSelect]);

    const handleRemoveImage = useCallback(() => {
        updateFormData({ uploadedImage: null });
        resetStockImageState();
    }, [updateFormData, resetStockImageState]);

    const handleUploadClick = useCallback(() => {
        fileInputRef.current?.click();
    }, []);

    const handleStockImageSelect = useCallback(() => {
        setTimeout(() => onNext(), 50);
    }, [onNext]);

    const handleTabChange = useCallback((value: string | number) => {
        const tab = value as 'upload' | 'stock' | 'unsplash' | 'mediathek';
        setImageSourceTab(tab);
    }, [setImageSourceTab]);

    // Mediathek state
    const { shares, isLoading: isLoadingShares, fetchUserShares } = useShareStore();
    const [selectedMediathekImage, setSelectedMediathekImage] = useState<Share | null>(null);
    const [isLoadingMediathekImage, setIsLoadingMediathekImage] = useState(false);

    // Filter for images with originals or AI-generated
    const mediathekImages = useMemo(() => {
        return shares.filter(share =>
            share.mediaType === 'image' && (
                share.imageMetadata?.hasOriginalImage === true ||
                share.imageType === 'pure-create'
            )
        );
    }, [shares]);

    // Fetch mediathek images when tab is selected
    useEffect(() => {
        if (imageSourceTab === 'mediathek' && shares.length === 0) {
            fetchUserShares('image');
        }
    }, [imageSourceTab, shares.length, fetchUserShares]);

    const handleMediathekImageSelect = useCallback(async (share: Share) => {
        setSelectedMediathekImage(share);
        setIsLoadingMediathekImage(true);

        try {
            const hasOriginal = share.imageMetadata?.hasOriginalImage === true;
            const imageUrl = hasOriginal
                ? `${apiClient.defaults.baseURL}/share/${share.shareToken}/original`
                : `${apiClient.defaults.baseURL}/share/${share.shareToken}`;

            const response = await fetch(imageUrl, {
                credentials: 'include'
            });

            if (!response.ok) {
                throw new Error('Failed to fetch image');
            }

            const blob = await response.blob();
            const file = new File([blob], `mediathek-${share.shareToken}.jpg`, { type: blob.type || 'image/jpeg' });

            updateFormData({ uploadedImage: file });
            setTimeout(() => onNext(), 50);
        } catch (error) {
            console.error('Failed to load mediathek image:', error);
        } finally {
            setIsLoadingMediathekImage(false);
            setSelectedMediathekImage(null);
        }
    }, [updateFormData, onNext]);

    const renderUploadContent = () => (
        <div
            className={`typeform-upload-content ${isDragActive ? 'typeform-upload-content--drag-active' : ''}`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
        >
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileInputChange}
                accept="image/jpeg,image/png,image/webp"
                hidden
                aria-label="Bild auswählen"
            />

            <div className="typeform-upload-wrapper">
                {!previewUrl ? (
                    <div
                        className={`typeform-upload-area ${isDragActive ? 'typeform-upload-area--active' : ''}`}
                        onClick={handleUploadClick}
                        onKeyDown={(e: React.KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && handleUploadClick()}
                        role="button"
                        tabIndex={0}
                        aria-label="Bild hochladen"
                    >
                        <HiPhotograph className="typeform-upload-icon" />
                    </div>
                ) : (
                    <div className="typeform-upload-preview">
                        <img
                            src={previewUrl}
                            alt="Vorschau"
                            className="typeform-upload-preview__image"
                            onClick={handleUploadClick}
                            style={{ cursor: 'pointer' }}
                        />
                        <button
                            type="button"
                            className="typeform-upload-preview__remove"
                            onClick={handleRemoveImage}
                            aria-label="Bild entfernen"
                        >
                            <HiX />
                        </button>
                        {stockImageAttribution && (
                            <UnsplashAttribution
                                photographer={stockImageAttribution.photographer}
                                profileUrl={stockImageAttribution.profileUrl}
                            />
                        )}
                    </div>
                )}
            </div>
        </div>
    );

    const renderStockContent = () => (
        <div className="typeform-stock-content">
            {previewUrl ? (
                <div className="typeform-upload-preview">
                    <img
                        src={previewUrl}
                        alt={selectedStockImage?.alt_text || 'Ausgewähltes Stock Bild'}
                        className="typeform-upload-preview__image"
                    />
                    <button
                        type="button"
                        className="typeform-upload-preview__remove"
                        onClick={handleRemoveImage}
                        aria-label="Bild entfernen"
                    >
                        <HiX />
                    </button>
                    {stockImageAttribution && (
                        <UnsplashAttribution
                            photographer={stockImageAttribution.photographer}
                            profileUrl={stockImageAttribution.profileUrl}
                        />
                    )}
                </div>
            ) : (
                <StockImagesGrid onImageSelect={handleStockImageSelect} />
            )}
        </div>
    );

    const renderMediathekContent = () => (
        <div className="typeform-stock-content">
            {previewUrl ? (
                <div className="typeform-upload-preview">
                    <img
                        src={previewUrl}
                        alt="Ausgewähltes Bild aus Mediathek"
                        className="typeform-upload-preview__image"
                    />
                    <button
                        type="button"
                        className="typeform-upload-preview__remove"
                        onClick={handleRemoveImage}
                        aria-label="Bild entfernen"
                    >
                        <HiX />
                    </button>
                </div>
            ) : (
                <div className="stock-images-grid">
                    {isLoadingShares && mediathekImages.length === 0 ? (
                        <div className="stock-images-grid__loading">
                            <div className="stock-images-grid__spinner" />
                            <p>Mediathek wird geladen...</p>
                        </div>
                    ) : mediathekImages.length === 0 ? (
                        <div className="stock-images-grid__empty">
                            <p>Noch keine Bilder in der Mediathek.</p>
                            <p style={{ fontSize: '0.875rem', opacity: 0.7 }}>
                                Erstelle Sharepics, um sie hier wiederzuverwenden.
                            </p>
                        </div>
                    ) : (
                        <div className="stock-images-grid__grid">
                            <AnimatePresence mode="popLayout">
                                {mediathekImages.map((share, index) => {
                                    const isSelected = selectedMediathekImage?.shareToken === share.shareToken;
                                    const thumbnailUrl = share.thumbnailUrl || `${apiClient.defaults.baseURL}/share/${share.shareToken}/thumbnail`;
                                    const isOriginal = share.imageMetadata?.hasOriginalImage === true;

                                    return (
                                        <motion.div
                                            key={share.shareToken}
                                            className={`stock-images-grid__card ${isSelected ? 'selected' : ''}`}
                                            onClick={() => handleMediathekImageSelect(share)}
                                            initial={{ opacity: 0, scale: 0.9 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0.9 }}
                                            transition={{ duration: 0.2, delay: index * 0.02 }}
                                            whileHover={{ scale: 1.02 }}
                                            whileTap={{ scale: 0.98 }}
                                            style={{ cursor: isLoadingMediathekImage ? 'wait' : 'pointer' }}
                                        >
                                            <img
                                                src={thumbnailUrl}
                                                alt={share.title || 'Mediathek Bild'}
                                                loading="lazy"
                                                className="stock-images-grid__image"
                                            />

                                            {isSelected && isLoadingMediathekImage && (
                                                <div className="stock-images-grid__selected-overlay">
                                                    <div className="stock-images-grid__spinner" style={{ width: 16, height: 16 }} />
                                                </div>
                                            )}

                                            {!isSelected && (
                                                <div
                                                    className="stock-images-grid__recommended-badge"
                                                    title={isOriginal ? 'Original Bild' : 'KI-generiert'}
                                                    style={{ background: isOriginal ? 'var(--primary-500)' : 'var(--sonne)' }}
                                                >
                                                    {isOriginal ? <HiPhotograph style={{ fontSize: 12 }} /> : '✨'}
                                                </div>
                                            )}
                                        </motion.div>
                                    );
                                })}
                            </AnimatePresence>
                        </div>
                    )}
                </div>
            )}
        </div>
    );

    const renderTabContent = () => {
        switch (imageSourceTab) {
            case 'upload':
                return renderUploadContent();
            case 'stock':
                return renderStockContent();
            case 'mediathek':
                return renderMediathekContent();
            default:
                return renderUploadContent();
        }
    };

    return (
        <motion.div
            key="image_upload"
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="typeform-field typeform-field--image-upload"
        >
            <div className="typeform-image-source-tabs">
                <SegmentedControl
                    steps={IMAGE_SOURCE_TABS}
                    currentValue={imageSourceTab}
                    onChange={handleTabChange}
                    ariaLabel="Bildquelle auswählen"
                />
            </div>

            {renderTabContent()}

            {bgRemovalProgress && (
                <div className="typeform-progress-overlay">
                    <div className="typeform-progress-content">
                        <div className="typeform-progress-spinner" />
                        <p className="typeform-progress-message">{bgRemovalProgress.message}</p>
                        <div className="typeform-progress-bar">
                            <div
                                className="typeform-progress-bar__fill"
                                style={{ width: `${Math.round(bgRemovalProgress.progress * 100)}%` }}
                            />
                        </div>
                    </div>
                </div>
            )}

            <div className="template-input-step__actions">
                <Button
                    onClick={onBack}
                    text="Zurück"
                    icon={<HiArrowLeft />}
                    className="btn-secondary"
                    ariaLabel="Zurück"
                    disabled={loading}
                />
                {previewUrl && (
                    <Button
                        onClick={onNext}
                        text={loading ? "Wird verarbeitet..." : "Weiter"}
                        icon={loading ? undefined : <HiArrowRight />}
                        className="btn-primary"
                        ariaLabel="Weiter"
                        loading={loading}
                        disabled={loading}
                    />
                )}
            </div>
        </motion.div>
    );
};

export default ImageUploadStep;
